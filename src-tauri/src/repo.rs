use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};

use crate::error::{AppError, AppResult, FieldError};
use crate::models::{Book, BookInput, Dictionary, Format, NamedCount, Status};
use crate::normalize::{clean, fold};
use crate::validate::sanitize;

/// Separador para listas agregadas con group_concat. `clean` elimina los
/// caracteres de control de los nombres, así que nunca aparece dentro de uno.
const SEP: char = '\u{1f}';

pub(crate) const SELECT_BOOK: &str = "
    SELECT b.id, b.title, b.subtitle,
           (SELECT group_concat(a.name, char(31) ORDER BY ba.position)
              FROM book_authors ba JOIN authors a ON a.id = ba.author_id
             WHERE ba.book_id = b.id),
           c.name, s.name, b.series_number, b.publisher, b.year, b.isbn,
           b.language, b.pages, b.format, b.status, b.rating, b.location,
           b.synopsis, b.notes, b.cover, b.lent_to, b.lent_at,
           (SELECT group_concat(g.name, char(31) ORDER BY g.name_norm)
              FROM book_sigils bs JOIN sigils g ON g.id = bs.sigil_id
             WHERE bs.book_id = b.id),
           b.created_at, b.updated_at, b.deleted_at
      FROM books b
      LEFT JOIN categories c ON c.id = b.category_id
      LEFT JOIN series s ON s.id = b.series_id";

fn split(list: Option<String>) -> Vec<String> {
    list.map(|s| s.split(SEP).map(str::to_owned).collect()).unwrap_or_default()
}

pub(crate) fn book_from_row(row: &Row) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        title: row.get(1)?,
        subtitle: row.get(2)?,
        authors: split(row.get(3)?),
        category: row.get(4)?,
        series: row.get(5)?,
        series_number: row.get(6)?,
        publisher: row.get(7)?,
        year: row.get(8)?,
        isbn: row.get(9)?,
        language: row.get(10)?,
        pages: row.get(11)?,
        format: Format::from_db(&row.get::<_, String>(12)?),
        status: Status::from_db(&row.get::<_, String>(13)?),
        rating: row.get(14)?,
        location: row.get(15)?,
        synopsis: row.get(16)?,
        notes: row.get(17)?,
        cover: row.get(18)?,
        lent_to: row.get(19)?,
        lent_at: row.get(20)?,
        sigils: split(row.get(21)?),
        created_at: row.get(22)?,
        updated_at: row.get(23)?,
        deleted_at: row.get(24)?,
    })
}

/// Libro por id, esté o no en la papelera.
pub fn get_book(conn: &Connection, id: i64) -> AppResult<Book> {
    conn.query_row(&format!("{SELECT_BOOK} WHERE b.id = ?1"), [id], book_from_row)
        .optional()?
        .ok_or(AppError::NotFound("el libro"))
}

/// Libros fuera de la papelera, por título (sin distinguir acentos).
pub fn list_books(conn: &Connection) -> AppResult<Vec<Book>> {
    let sql = format!("{SELECT_BOOK} WHERE b.deleted_at IS NULL ORDER BY b.title_norm, b.id");
    let mut stmt = conn.prepare(&sql)?;
    let books = stmt.query_map([], book_from_row)?.collect::<Result<_, _>>()?;
    Ok(books)
}

/// Libros en la papelera, los borrados más recientemente primero.
pub fn list_trash(conn: &Connection) -> AppResult<Vec<Book>> {
    let sql = format!("{SELECT_BOOK} WHERE b.deleted_at IS NOT NULL ORDER BY b.deleted_at DESC, b.id");
    let mut stmt = conn.prepare(&sql)?;
    let books = stmt.query_map([], book_from_row)?.collect::<Result<_, _>>()?;
    Ok(books)
}

pub fn create_book(conn: &mut Connection, input: BookInput) -> AppResult<Book> {
    let b = sanitize(input)?;
    let tx = conn.transaction()?;
    let id = insert_book(&tx, &b)?;
    tx.commit()?;
    get_book(conn, id)
}

/// Inserta un libro ya validado dentro de una transacción abierta. Lo usa
/// también la importación, que mete cientos de libros en una sola.
pub(crate) fn insert_book(tx: &Transaction, b: &BookInput) -> AppResult<i64> {
    let category_id = upsert_optional(&tx, Dictionary::Categories, b.category.as_deref())?;
    let series_id = upsert_optional(&tx, Dictionary::Series, b.series.as_deref())?;
    tx.execute(
        "INSERT INTO books (title, title_norm, subtitle, category_id, series_id, series_number,
                            publisher, year, isbn, language, pages, format, status, rating,
                            location, synopsis, notes, lent_to, lent_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            b.title,
            fold(&b.title),
            b.subtitle,
            category_id,
            series_id,
            b.series_number,
            b.publisher,
            b.year,
            b.isbn,
            b.language,
            b.pages,
            b.format.as_str(),
            b.status.as_str(),
            b.rating,
            b.location,
            b.synopsis,
            b.notes,
            b.lent_to,
            b.lent_at,
        ],
    )?;
    let id = tx.last_insert_rowid();
    save_relations(tx, id, b)?;
    Ok(id)
}

pub fn update_book(conn: &mut Connection, id: i64, input: BookInput) -> AppResult<Book> {
    let b = sanitize(input)?;
    let tx = conn.transaction()?;
    let category_id = upsert_optional(&tx, Dictionary::Categories, b.category.as_deref())?;
    let series_id = upsert_optional(&tx, Dictionary::Series, b.series.as_deref())?;
    let changed = tx.execute(
        "UPDATE books SET title = ?2, title_norm = ?3, subtitle = ?4, category_id = ?5,
                          series_id = ?6, series_number = ?7, publisher = ?8, year = ?9,
                          isbn = ?10, language = ?11, pages = ?12, format = ?13, status = ?14,
                          rating = ?15, location = ?16, synopsis = ?17, notes = ?18,
                          lent_to = ?19, lent_at = ?20,
                          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id,
            b.title,
            fold(&b.title),
            b.subtitle,
            category_id,
            series_id,
            b.series_number,
            b.publisher,
            b.year,
            b.isbn,
            b.language,
            b.pages,
            b.format.as_str(),
            b.status.as_str(),
            b.rating,
            b.location,
            b.synopsis,
            b.notes,
            b.lent_to,
            b.lent_at,
        ],
    )?;
    if changed == 0 {
        // Al soltar `tx` sin commit se deshace todo, incluidas las altas de diccionario.
        return Err(AppError::NotFound("el libro"));
    }
    tx.execute("DELETE FROM book_authors WHERE book_id = ?1", [id])?;
    tx.execute("DELETE FROM book_sigils WHERE book_id = ?1", [id])?;
    save_relations(&tx, id, &b)?;
    prune_orphans(&tx)?;
    tx.commit()?;
    get_book(conn, id)
}

/// Manda el libro a la papelera. Se puede recuperar con `restore_book`.
pub fn trash_book(conn: &Connection, id: i64) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE books SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?1 AND deleted_at IS NULL",
        [id],
    )?;
    if changed == 0 { Err(AppError::NotFound("el libro")) } else { Ok(()) }
}

pub fn restore_book(conn: &Connection, id: i64) -> AppResult<Book> {
    let changed = conn.execute(
        "UPDATE books SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL",
        [id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("el libro en la papelera"));
    }
    get_book(conn, id)
}

/// Borra definitivamente un libro. Solo funciona con libros que ya están en
/// la papelera, para que nunca se pierda nada de un solo paso. Devuelve los
/// archivos de portada que han quedado sin libro, para borrarlos.
pub fn purge_book(conn: &mut Connection, id: i64) -> AppResult<Vec<String>> {
    purge(conn, "id = ?1 AND deleted_at IS NOT NULL", id)?.ok_or(AppError::NotFound("el libro en la papelera"))
}

/// Vacía la papelera. Devuelve los archivos de portada que hay que borrar
/// (su número no es el de libros: no todos tienen portada).
pub fn empty_trash(conn: &mut Connection) -> AppResult<(usize, Vec<String>)> {
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM books_fts WHERE rowid IN (SELECT id FROM books WHERE deleted_at IS NOT NULL)",
        [],
    )?;
    let covers: Vec<Option<String>> = tx
        .prepare("DELETE FROM books WHERE deleted_at IS NOT NULL RETURNING cover")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    prune_orphans(&tx)?;
    tx.commit()?;
    Ok((covers.len(), covers.into_iter().flatten().collect()))
}

fn purge(conn: &mut Connection, filter: &str, id: i64) -> AppResult<Option<Vec<String>>> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM books_fts WHERE rowid = ?1", [id])?;
    let covers: Vec<Option<String>> = tx
        .prepare(&format!("DELETE FROM books WHERE {filter} RETURNING cover"))?
        .query_map([id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    if covers.is_empty() {
        return Ok(None);
    }
    prune_orphans(&tx)?;
    tx.commit()?;
    Ok(Some(covers.into_iter().flatten().collect()))
}

/// Entradas de un diccionario con su número de libros, por nombre.
pub fn list_dictionary(conn: &Connection, dict: Dictionary) -> AppResult<Vec<NamedCount>> {
    let count = match dict {
        Dictionary::Categories => {
            "SELECT count(*) FROM books b WHERE b.category_id = d.id AND b.deleted_at IS NULL"
        }
        Dictionary::Series => "SELECT count(*) FROM books b WHERE b.series_id = d.id AND b.deleted_at IS NULL",
        Dictionary::Authors => {
            "SELECT count(*) FROM book_authors x JOIN books b ON b.id = x.book_id
              WHERE x.author_id = d.id AND b.deleted_at IS NULL"
        }
        Dictionary::Sigils => {
            "SELECT count(*) FROM book_sigils x JOIN books b ON b.id = x.book_id
              WHERE x.sigil_id = d.id AND b.deleted_at IS NULL"
        }
    };
    let sql = format!("SELECT d.id, d.name, ({count}) FROM {} d ORDER BY d.name_norm", dict.table());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], |row| Ok(NamedCount { id: row.get(0)?, name: row.get(1)?, count: row.get(2)? }))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Diccionarios que el usuario gestiona a mano. Autores y series se cuidan
/// solos (desaparecen cuando ningún libro los usa).
fn managed(dict: Dictionary) -> AppResult<(&'static str, usize)> {
    match dict {
        Dictionary::Sigils => Ok(("sigils", crate::validate::SIGIL_MAX_CHARS)),
        Dictionary::Categories => Ok(("categories", 80)),
        _ => Err(AppError::Validation(vec![FieldError {
            field: "name",
            message: "Solo se pueden gestionar sigils y categorías".into(),
        }])),
    }
}

/// Renombra un sigil o una categoría. Si el nombre nuevo ya existe (sin
/// distinguir mayúsculas ni acentos), las dos entradas se fusionan: los
/// libros pasan a la existente y la renombrada desaparece. Devuelve el id
/// con el que queda.
pub fn rename_entry(conn: &mut Connection, dict: Dictionary, id: i64, name: &str) -> AppResult<i64> {
    let (table, max) = managed(dict)?;
    let name = clean(name);
    let invalid = |message: String| AppError::Validation(vec![FieldError { field: "name", message }]);
    if name.is_empty() {
        return Err(invalid("El nombre no puede quedar vacío".into()));
    }
    if name.chars().count() > max {
        return Err(invalid(format!("Máximo {max} caracteres")));
    }
    let norm = fold(&name);

    let tx = conn.transaction()?;
    let exists = tx.query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1"), [id], |_| Ok(())).optional()?;
    if exists.is_none() {
        return Err(AppError::NotFound(if table == "sigils" { "el sigil" } else { "la categoría" }));
    }
    let other: Option<i64> = tx
        .query_row(&format!("SELECT id FROM {table} WHERE name_norm = ?1 AND id != ?2"), params![norm, id], |r| {
            r.get(0)
        })
        .optional()?;

    let result = match (other, dict) {
        (Some(target), Dictionary::Sigils) => {
            tx.execute(
                "INSERT OR IGNORE INTO book_sigils (book_id, sigil_id)
                 SELECT book_id, ?2 FROM book_sigils WHERE sigil_id = ?1",
                params![id, target],
            )?;
            tx.execute("DELETE FROM sigils WHERE id = ?1", [id])?;
            target
        }
        (Some(target), _) => {
            tx.execute("UPDATE books SET category_id = ?2 WHERE category_id = ?1", params![id, target])?;
            tx.execute("DELETE FROM categories WHERE id = ?1", [id])?;
            target
        }
        (None, _) => {
            tx.execute(&format!("UPDATE {table} SET name = ?2, name_norm = ?3 WHERE id = ?1"), params![id, name, norm])?;
            id
        }
    };
    tx.commit()?;
    Ok(result)
}

/// Borra un sigil (se quita de todos sus libros) o una categoría (sus libros
/// se quedan sin categoría). Los libros no se tocan en nada más.
pub fn delete_entry(conn: &Connection, dict: Dictionary, id: i64) -> AppResult<()> {
    let (table, _) = managed(dict)?;
    let changed = conn.execute(&format!("DELETE FROM {table} WHERE id = ?1"), [id])?;
    if changed == 0 {
        return Err(AppError::NotFound(if table == "sigils" { "el sigil" } else { "la categoría" }));
    }
    Ok(())
}

/// Id de la entrada con ese nombre (comparando sin mayúsculas ni acentos); si
/// no existe, la crea con el nombre tal cual se escribió.
fn upsert(tx: &Transaction, dict: Dictionary, name: &str) -> AppResult<i64> {
    let table = dict.table();
    let norm = fold(name);
    tx.execute(
        &format!("INSERT INTO {table} (name, name_norm) VALUES (?1, ?2) ON CONFLICT (name_norm) DO NOTHING"),
        params![name, norm],
    )?;
    Ok(tx.query_row(&format!("SELECT id FROM {table} WHERE name_norm = ?1"), [norm], |row| row.get(0))?)
}

fn upsert_optional(tx: &Transaction, dict: Dictionary, name: Option<&str>) -> AppResult<Option<i64>> {
    name.map(|n| upsert(tx, dict, n)).transpose()
}

fn save_relations(tx: &Transaction, id: i64, b: &BookInput) -> AppResult<()> {
    for (position, author) in b.authors.iter().enumerate() {
        let author_id = upsert(tx, Dictionary::Authors, author)?;
        tx.execute(
            "INSERT INTO book_authors (book_id, author_id, position) VALUES (?1, ?2, ?3)",
            params![id, author_id, position as i64],
        )?;
    }
    for sigil in &b.sigils {
        let sigil_id = upsert(tx, Dictionary::Sigils, sigil)?;
        tx.execute("INSERT INTO book_sigils (book_id, sigil_id) VALUES (?1, ?2)", params![id, sigil_id])?;
    }
    refresh_fts(tx, id)
}

fn refresh_fts(tx: &Transaction, id: i64) -> AppResult<()> {
    tx.execute("DELETE FROM books_fts WHERE rowid = ?1", [id])?;
    tx.execute(
        "INSERT INTO books_fts (rowid, title, subtitle, authors, series, synopsis)
         SELECT b.id, b.title, b.subtitle,
                (SELECT group_concat(a.name, ' ') FROM book_authors ba
                   JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id),
                s.name, b.synopsis
           FROM books b LEFT JOIN series s ON s.id = b.series_id
          WHERE b.id = ?1",
        [id],
    )?;
    Ok(())
}

/// Autores y series que ya no usa ningún libro desaparecen solos. Categorías y
/// sigils se conservan: los gestiona el usuario.
fn prune_orphans(tx: &Transaction) -> AppResult<()> {
    tx.execute("DELETE FROM authors WHERE id NOT IN (SELECT author_id FROM book_authors)", [])?;
    tx.execute(
        "DELETE FROM series WHERE id NOT IN (SELECT series_id FROM books WHERE series_id IS NOT NULL)",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn full_input() -> BookInput {
        BookInput {
            title: "El nombre del viento".into(),
            subtitle: Some("Crónica del asesino de reyes".into()),
            authors: vec!["Patrick Rothfuss".into()],
            category: Some("Fantasía".into()),
            series: Some("Crónica del asesino de reyes".into()),
            series_number: Some(1.0),
            publisher: Some("Plaza & Janés".into()),
            year: Some(2009),
            isbn: Some("978-84-376-0494-7".into()),
            language: Some("Español".into()),
            pages: Some(880),
            format: Format::Fisico,
            status: Status::Leido,
            rating: Some(5),
            location: Some("Salón, balda 2".into()),
            synopsis: Some("Kvothe cuenta su historia.".into()),
            notes: Some("Regalo".into()),
            lent_to: Some("Lucía".into()),
            lent_at: Some("2026-10-01".into()),
            sigils: vec!["Magia".into(), "Épica".into()],
        }
    }

    fn fts_hits(conn: &Connection, query: &str) -> i64 {
        conn.query_row("SELECT count(*) FROM books_fts WHERE books_fts MATCH ?1", [query], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn create_and_read_round_trip() {
        let mut conn = open_in_memory().unwrap();
        let book = create_book(&mut conn, full_input()).unwrap();
        assert_eq!(book.title, "El nombre del viento");
        assert_eq!(book.authors, vec!["Patrick Rothfuss"]);
        assert_eq!(book.category.as_deref(), Some("Fantasía"));
        assert_eq!(book.series_number, Some(1.0));
        assert_eq!(book.isbn.as_deref(), Some("9788437604947"));
        assert_eq!(book.status, Status::Leido);
        assert_eq!(book.sigils, vec!["Épica", "Magia"]);
        assert_eq!(book.lent_at.as_deref(), Some("2026-10-01"));
        assert!(book.deleted_at.is_none());
        assert_eq!(get_book(&conn, book.id).unwrap(), book);
    }

    #[test]
    fn invalid_input_writes_nothing() {
        let mut conn = open_in_memory().unwrap();
        let mut input = full_input();
        input.rating = Some(9);
        assert!(matches!(create_book(&mut conn, input), Err(AppError::Validation(_))));
        assert!(list_books(&conn).unwrap().is_empty());
        assert!(list_dictionary(&conn, Dictionary::Categories).unwrap().is_empty());
    }

    #[test]
    fn dictionaries_are_shared_ignoring_case_and_accents() {
        let mut conn = open_in_memory().unwrap();
        let mut a = full_input();
        a.sigils = vec!["Fantasía".into()];
        let mut b = full_input();
        b.title = "El temor de un hombre sabio".into();
        b.category = Some("FANTASIA".into());
        b.sigils = vec!["fantasia".into()];
        create_book(&mut conn, a).unwrap();
        let second = create_book(&mut conn, b).unwrap();

        // Se reutiliza el nombre que se escribió primero.
        assert_eq!(second.category.as_deref(), Some("Fantasía"));
        assert_eq!(second.sigils, vec!["Fantasía"]);
        let sigils = list_dictionary(&conn, Dictionary::Sigils).unwrap();
        assert_eq!(sigils.len(), 1);
        assert_eq!(sigils[0].count, 2);
    }

    #[test]
    fn authors_keep_their_order() {
        let mut conn = open_in_memory().unwrap();
        let mut input = full_input();
        input.authors = vec!["Terry Pratchett".into(), "Neil Gaiman".into()];
        let book = create_book(&mut conn, input).unwrap();
        assert_eq!(book.authors, vec!["Terry Pratchett", "Neil Gaiman"]);
    }

    #[test]
    fn update_replaces_relations_and_prunes_orphans() {
        let mut conn = open_in_memory().unwrap();
        let book = create_book(&mut conn, full_input()).unwrap();

        let mut input = full_input();
        input.authors = vec!["Ursula K. Le Guin".into()];
        input.series = None;
        input.series_number = None;
        input.sigils = vec!["Clásico".into()];
        input.lent_to = None;
        let updated = update_book(&mut conn, book.id, input).unwrap();

        assert_eq!(updated.authors, vec!["Ursula K. Le Guin"]);
        assert_eq!(updated.series, None);
        assert_eq!(updated.sigils, vec!["Clásico"]);
        assert_eq!(updated.lent_at, None);
        assert_eq!(updated.created_at, book.created_at);

        let authors = list_dictionary(&conn, Dictionary::Authors).unwrap();
        assert_eq!(authors.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), vec!["Ursula K. Le Guin"]);
        assert!(list_dictionary(&conn, Dictionary::Series).unwrap().is_empty());
        // Los sigils sin libros se conservan, con 0.
        let magia = list_dictionary(&conn, Dictionary::Sigils).unwrap();
        assert!(magia.iter().any(|s| s.name == "Magia" && s.count == 0));
    }

    #[test]
    fn update_missing_book_is_not_found_and_rolls_back() {
        let mut conn = open_in_memory().unwrap();
        let result = update_book(&mut conn, 42, full_input());
        assert!(matches!(result, Err(AppError::NotFound(_))));
        assert!(list_dictionary(&conn, Dictionary::Categories).unwrap().is_empty());
    }

    #[test]
    fn trash_restore_and_purge() {
        let mut conn = open_in_memory().unwrap();
        let book = create_book(&mut conn, full_input()).unwrap();

        // No se puede purgar un libro que no está en la papelera.
        assert!(matches!(purge_book(&mut conn, book.id), Err(AppError::NotFound(_))));

        trash_book(&conn, book.id).unwrap();
        assert!(list_books(&conn).unwrap().is_empty());
        assert_eq!(list_trash(&conn).unwrap().len(), 1);
        assert_eq!(list_dictionary(&conn, Dictionary::Sigils).unwrap()[0].count, 0);
        // Un libro en la papelera no se edita.
        assert!(matches!(update_book(&mut conn, book.id, full_input()), Err(AppError::NotFound(_))));

        let restored = restore_book(&conn, book.id).unwrap();
        assert!(restored.deleted_at.is_none());
        assert_eq!(list_books(&conn).unwrap().len(), 1);

        trash_book(&conn, book.id).unwrap();
        purge_book(&mut conn, book.id).unwrap();
        assert!(matches!(get_book(&conn, book.id), Err(AppError::NotFound(_))));
        assert!(list_dictionary(&conn, Dictionary::Authors).unwrap().is_empty());
        assert_eq!(fts_hits(&conn, "kvothe"), 0);
    }

    #[test]
    fn empty_trash_counts_removed() {
        let mut conn = open_in_memory().unwrap();
        let a = create_book(&mut conn, full_input()).unwrap();
        let mut other = full_input();
        other.title = "Otro".into();
        let b = create_book(&mut conn, other).unwrap();
        create_book(&mut conn, BookInput { title: "Se queda".into(), ..Default::default() }).unwrap();
        conn.execute("UPDATE books SET cover = 'a.webp' WHERE id = ?1", [a.id]).unwrap();
        trash_book(&conn, a.id).unwrap();
        trash_book(&conn, b.id).unwrap();
        assert_eq!(empty_trash(&mut conn).unwrap(), (2, vec!["a.webp".to_string()]));
        assert_eq!(list_books(&conn).unwrap().len(), 1);
    }

    #[test]
    fn list_orders_by_title_ignoring_accents() {
        let mut conn = open_in_memory().unwrap();
        for title in ["Zorba", "Ébano", "alas"] {
            create_book(&mut conn, BookInput { title: title.into(), ..Default::default() }).unwrap();
        }
        let titles: Vec<String> = list_books(&conn).unwrap().into_iter().map(|b| b.title).collect();
        assert_eq!(titles, vec!["alas", "Ébano", "Zorba"]);
    }

    #[test]
    fn full_text_index_follows_changes() {
        let mut conn = open_in_memory().unwrap();
        let book = create_book(&mut conn, full_input()).unwrap();
        assert_eq!(fts_hits(&conn, "rothfuss"), 1);
        assert_eq!(fts_hits(&conn, "cronica"), 1);

        let mut input = full_input();
        input.authors = vec!["Otra Persona".into()];
        update_book(&mut conn, book.id, input).unwrap();
        assert_eq!(fts_hits(&conn, "rothfuss"), 0);
        assert_eq!(fts_hits(&conn, "persona"), 1);
    }

    fn sigil_id(conn: &Connection, name: &str) -> i64 {
        list_dictionary(conn, Dictionary::Sigils).unwrap().into_iter().find(|s| s.name == name).unwrap().id
    }

    #[test]
    fn rename_sigil_keeps_books() {
        let mut conn = open_in_memory().unwrap();
        let book = create_book(&mut conn, full_input()).unwrap();
        let magia = sigil_id(&conn, "Magia");
        rename_entry(&mut conn, Dictionary::Sigils, magia, "  Hechicería ").unwrap();
        assert_eq!(get_book(&conn, book.id).unwrap().sigils, vec!["Épica", "Hechicería"]);
    }

    #[test]
    fn renaming_to_existing_name_merges() {
        let mut conn = open_in_memory().unwrap();
        let a = create_book(&mut conn, full_input()).unwrap();
        let mut other = full_input();
        other.title = "Otro".into();
        other.sigils = vec!["Fantasia".into()];
        let b = create_book(&mut conn, other).unwrap();

        // Renombrar "Fantasia" a "epica" choca con "Épica": se fusionan.
        let epica = sigil_id(&conn, "Épica");
        let fantasia = sigil_id(&conn, "Fantasia");
        let target = rename_entry(&mut conn, Dictionary::Sigils, fantasia, "epica").unwrap();
        assert_eq!(target, epica);
        assert_eq!(get_book(&conn, b.id).unwrap().sigils, vec!["Épica"]);
        // a ya tenía Épica: no se duplica.
        assert_eq!(get_book(&conn, a.id).unwrap().sigils, vec!["Épica", "Magia"]);
        let sigils = list_dictionary(&conn, Dictionary::Sigils).unwrap();
        assert_eq!(sigils.iter().map(|s| (s.name.as_str(), s.count)).collect::<Vec<_>>(), vec![("Épica", 2), ("Magia", 1)]);
    }

    #[test]
    fn merge_and_delete_categories() {
        let mut conn = open_in_memory().unwrap();
        let a = create_book(&mut conn, full_input()).unwrap();
        let mut other = full_input();
        other.title = "Otro".into();
        other.category = Some("Fantasy".into());
        let b = create_book(&mut conn, other).unwrap();
        let fantasy = list_dictionary(&conn, Dictionary::Categories).unwrap().into_iter().find(|c| c.name == "Fantasy").unwrap();
        rename_entry(&mut conn, Dictionary::Categories, fantasy.id, "fantasía").unwrap();
        assert_eq!(get_book(&conn, b.id).unwrap().category.as_deref(), Some("Fantasía"));

        let id = list_dictionary(&conn, Dictionary::Categories).unwrap()[0].id;
        delete_entry(&conn, Dictionary::Categories, id).unwrap();
        assert_eq!(get_book(&conn, a.id).unwrap().category, None);
        assert_eq!(get_book(&conn, b.id).unwrap().title, "Otro", "el libro sigue ahí");
    }

    #[test]
    fn manage_rejects_bad_input() {
        let mut conn = open_in_memory().unwrap();
        create_book(&mut conn, full_input()).unwrap();
        let id = sigil_id(&conn, "Magia");
        assert!(matches!(rename_entry(&mut conn, Dictionary::Sigils, id, "   "), Err(AppError::Validation(_))));
        assert!(matches!(rename_entry(&mut conn, Dictionary::Sigils, id, &"x".repeat(41)), Err(AppError::Validation(_))));
        assert!(matches!(rename_entry(&mut conn, Dictionary::Sigils, 999, "Nuevo"), Err(AppError::NotFound(_))));
        assert!(matches!(rename_entry(&mut conn, Dictionary::Authors, 1, "X"), Err(AppError::Validation(_))));
        assert!(matches!(delete_entry(&conn, Dictionary::Sigils, 999), Err(AppError::NotFound(_))));
        delete_entry(&conn, Dictionary::Sigils, id).unwrap();
        assert!(list_dictionary(&conn, Dictionary::Sigils).unwrap().iter().all(|s| s.name != "Magia"));
    }

    #[test]
    fn changes_bump_revision() {
        let mut conn = open_in_memory().unwrap();
        let before = crate::db::revision(&conn).unwrap();
        create_book(&mut conn, full_input()).unwrap();
        assert!(crate::db::revision(&conn).unwrap() > before);
    }
}
