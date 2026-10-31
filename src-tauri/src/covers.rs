use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use rusqlite::{Connection, OptionalExtension};

use crate::error::{AppError, AppResult, FieldError};
use crate::models::Book;
use crate::repo::get_book;

pub const COVERS_DIR: &str = "covers";
/// La interfaz reduce la imagen antes de enviarla; esto es solo un tope.
pub const MAX_BYTES: usize = 5 * 1024 * 1024;

fn invalid(message: &str) -> AppError {
    AppError::Validation(vec![FieldError { field: "cover", message: message.into() }])
}

/// Tipo de imagen por su firma, no por lo que diga el nombre del archivo.
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// Guarda la portada de un libro (imagen en base64) y borra la anterior.
pub fn set_cover(conn: &Connection, dir: &Path, id: i64, data_base64: &str) -> AppResult<Book> {
    let bytes = STANDARD.decode(data_base64.trim()).map_err(|_| invalid("La imagen no se ha podido leer"))?;
    if bytes.len() > MAX_BYTES {
        return Err(invalid("La imagen es demasiado grande (máximo 5 MB)"));
    }
    let ext = image_extension(&bytes).ok_or_else(|| invalid("Formato no admitido: usa JPG, PNG o WebP"))?;
    let previous = current_cover(conn, id)?;

    fs::create_dir_all(dir)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default();
    let name = format!("{id}-{stamp}.{ext}");
    // Se escribe aparte y se renombra: nunca queda una imagen a medias.
    let tmp = dir.join(format!("{name}.tmp"));
    fs::write(&tmp, &bytes)?;
    fs::rename(&tmp, dir.join(&name))?;

    if let Err(err) = conn.execute("UPDATE books SET cover = ?2 WHERE id = ?1", rusqlite::params![id, name]) {
        let _ = fs::remove_file(dir.join(&name));
        return Err(err.into());
    }
    if let Some(old) = previous {
        delete_file(dir, &old);
    }
    get_book(conn, id)
}

pub fn remove_cover(conn: &Connection, dir: &Path, id: i64) -> AppResult<Book> {
    if let Some(old) = current_cover(conn, id)? {
        conn.execute("UPDATE books SET cover = NULL WHERE id = ?1", [id])?;
        delete_file(dir, &old);
    }
    get_book(conn, id)
}

/// Portada actual de un libro que existe y no está en la papelera.
fn current_cover(conn: &Connection, id: i64) -> AppResult<Option<String>> {
    conn.query_row("SELECT cover FROM books WHERE id = ?1 AND deleted_at IS NULL", [id], |row| row.get(0))
        .optional()?
        .ok_or(AppError::NotFound("el libro"))
}

/// Borra un archivo de portada. Solo nombres simples: nada de rutas.
pub fn delete_file(dir: &Path, name: &str) {
    if Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name) {
        let _ = fs::remove_file(dir.join(name));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::models::BookInput;
    use crate::repo::{create_book, trash_book};

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    fn setup() -> (Connection, tempfile::TempDir, i64) {
        let mut conn = open_in_memory().unwrap();
        let book = create_book(&mut conn, BookInput { title: "Dune".into(), ..Default::default() }).unwrap();
        (conn, tempfile::tempdir().unwrap(), book.id)
    }

    #[test]
    fn detects_formats() {
        assert_eq!(image_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(image_extension(PNG), Some("png"));
        assert_eq!(image_extension(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(image_extension(b"GIF89a"), None);
    }

    #[test]
    fn set_replace_and_remove() {
        let (conn, dir, id) = setup();
        let first = set_cover(&conn, dir.path(), id, &STANDARD.encode(PNG)).unwrap().cover.unwrap();
        assert!(dir.path().join(&first).exists());

        let second = set_cover(&conn, dir.path(), id, &STANDARD.encode([0xFF, 0xD8, 0xFF, 0xE0])).unwrap();
        let second = second.cover.unwrap();
        assert!(second.ends_with(".jpg"));
        assert!(!dir.path().join(&first).exists(), "la portada anterior se borra");

        let book = remove_cover(&conn, dir.path(), id).unwrap();
        assert_eq!(book.cover, None);
        assert!(!dir.path().join(&second).exists());
    }

    #[test]
    fn rejects_bad_input() {
        let (conn, dir, id) = setup();
        assert!(matches!(set_cover(&conn, dir.path(), id, "no es base64!"), Err(AppError::Validation(_))));
        assert!(matches!(
            set_cover(&conn, dir.path(), id, &STANDARD.encode(b"GIF89a")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(set_cover(&conn, dir.path(), 999, &STANDARD.encode(PNG)), Err(AppError::NotFound(_))));
        trash_book(&conn, id).unwrap();
        assert!(matches!(set_cover(&conn, dir.path(), id, &STANDARD.encode(PNG)), Err(AppError::NotFound(_))));
        assert_eq!(fs::read_dir(dir.path()).map(|d| d.count()).unwrap_or(0), 0, "no deja archivos sueltos");
    }

    #[test]
    fn delete_file_ignores_paths() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("fuera.txt");
        fs::write(&outside, b"x").unwrap();
        let covers = dir.path().join(COVERS_DIR);
        fs::create_dir_all(&covers).unwrap();
        delete_file(&covers, "../fuera.txt");
        assert!(outside.exists());
    }
}
