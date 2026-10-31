use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

pub const DB_FILE: &str = "grimoire.db";
pub const BACKUP_DIR: &str = "backups";
pub const BACKUPS_KEPT: usize = 10;

/// Migraciones en orden. La versión del esquema es `PRAGMA user_version`:
/// el número de migraciones aplicadas. Nunca se edita una ya publicada; los
/// cambios van en una nueva al final de la lista.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/001_init.sql")];

pub fn open(path: &Path) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;
    configure(&conn)?;
    check_integrity(&conn)?;
    migrate(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configure(&conn)?;
    migrate(&mut conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> AppResult<()> {
    // WAL aguanta mejor un corte a mitad de escritura y no bloquea lecturas.
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

fn check_integrity(conn: &Connection) -> AppResult<()> {
    let result: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    if result == "ok" {
        Ok(())
    } else {
        Err(AppError::Corrupt(result))
    }
}

fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let supported = MIGRATIONS.len() as i64;
    if current > supported {
        return Err(AppError::NewerSchema { found: current, supported });
    }
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn revision(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("SELECT value FROM meta WHERE key = 'revision'", [], |row| row.get(0))?)
}

/// Copia la base de datos a `dir` si ha cambiado desde la última copia, y deja
/// solo las `keep` más recientes. No copia una base de datos sin cambios nunca.
pub fn backup_if_changed(conn: &Connection, dir: &Path, keep: usize) -> AppResult<Option<PathBuf>> {
    let rev = revision(conn)?;
    if rev == 0 {
        return Ok(None);
    }
    fs::create_dir_all(dir)?;
    let mut backups = list_backups(dir)?;
    if backups.last().and_then(|p| backup_revision(p)) == Some(rev) {
        return Ok(None);
    }

    let stamp: String =
        conn.query_row("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')", [], |row| row.get(0))?;
    let target = dir.join(format!("grimoire-{stamp}-r{rev}.db"));
    if !target.exists() {
        // VACUUM INTO crea una copia consistente y compacta, aunque haya WAL.
        conn.execute("VACUUM INTO ?1", [target.to_string_lossy()])?;
        backups.push(target.clone());
    }

    backups.sort();
    let excess = backups.len().saturating_sub(keep);
    for old in backups.drain(..excess) {
        // Si una copia antigua no se puede borrar, se reintenta en el próximo arranque.
        let _ = fs::remove_file(old);
    }
    Ok(Some(target))
}

/// Copias existentes, de la más antigua a la más reciente (el nombre empieza
/// por la fecha, así que el orden alfabético es el cronológico).
pub fn list_backups(dir: &Path) -> AppResult<Vec<PathBuf>> {
    let mut found = Vec::new();
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        if name.starts_with("grimoire-") && name.ends_with(".db") {
            found.push(path);
        }
    }
    found.sort();
    Ok(found)
}

fn backup_revision(path: &Path) -> Option<i64> {
    let stem = path.file_stem()?.to_str()?;
    stem.rsplit_once("-r")?.1.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bump(conn: &Connection) {
        conn.execute("INSERT INTO sigils (name, name_norm) VALUES ('x', ?1)", [revision(conn).unwrap().to_string()])
            .unwrap();
    }

    #[test]
    fn migrations_apply_and_set_version() {
        let conn = open_in_memory().unwrap();
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
        assert_eq!(revision(&conn).unwrap(), 0);
    }

    #[test]
    fn reopening_is_idempotent_and_keeps_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = open(&path).unwrap();
            bump(&conn);
        }
        let conn = open(&path).unwrap();
        let count: i64 = conn.query_row("SELECT count(*) FROM sigils", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn refuses_newer_schema() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = open(&path).unwrap();
            conn.pragma_update(None, "user_version", 99).unwrap();
        }
        assert!(matches!(open(&path), Err(AppError::NewerSchema { found: 99, .. })));
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let conn = open_in_memory().unwrap();
        let result = conn.execute("INSERT INTO book_sigils (book_id, sigil_id) VALUES (1, 1)", []);
        assert!(result.is_err());
    }

    #[test]
    fn backup_skips_unchanged_and_rotates() {
        let dir = tempfile::tempdir().unwrap();
        let backups = dir.path().join(BACKUP_DIR);
        let conn = open(&dir.path().join(DB_FILE)).unwrap();

        // Base de datos recién creada: nada que copiar.
        assert!(backup_if_changed(&conn, &backups, 3).unwrap().is_none());

        bump(&conn);
        let first = backup_if_changed(&conn, &backups, 3).unwrap().unwrap();
        assert!(first.exists());
        // Sin cambios: no se repite la copia.
        assert!(backup_if_changed(&conn, &backups, 3).unwrap().is_none());

        // Copias antiguas simuladas para comprobar la rotación.
        for i in 1..=4 {
            fs::write(backups.join(format!("grimoire-20000101-00000{i}-r{i}.db")), b"old").unwrap();
        }
        bump(&conn);
        let latest = backup_if_changed(&conn, &backups, 3).unwrap().unwrap();
        let kept = list_backups(&backups).unwrap();
        assert_eq!(kept.len(), 3);
        assert_eq!(kept.last(), Some(&latest));
        assert!(kept.contains(&first));

        // La copia es una base de datos válida con los datos.
        let copy = Connection::open(&latest).unwrap();
        let count: i64 = copy.query_row("SELECT count(*) FROM sigils", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
    }
}
