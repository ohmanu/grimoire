use std::collections::HashSet;
use std::fs;
use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, FieldError};
use crate::models::{Book, BookInput, Format, Status};
use crate::normalize::fold;
use crate::repo::{insert_book, list_books};
use crate::validate::sanitize;

/// Tope de tamaño para importar: muy por encima de cualquier catálogo real.
const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;
/// Errores que se detallan en el informe; el resto solo se cuentan.
const MAX_REPORTED_ERRORS: usize = 100;
const LIST_SEP: &str = "; ";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
    Csv,
}

const CSV_HEADERS: [&str; 20] = [
    "titulo",
    "subtitulo",
    "autores",
    "categoria",
    "serie",
    "numero_serie",
    "editorial",
    "año",
    "isbn",
    "idioma",
    "paginas",
    "formato",
    "estado",
    "valoracion",
    "ubicacion",
    "sinopsis",
    "notas",
    "prestado_a",
    "fecha_prestamo",
    "sigils",
];

/// Un libro tal como se exporta: todos sus datos, sin ids internos ni portada.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportBook<'a> {
    title: &'a str,
    subtitle: &'a Option<String>,
    authors: &'a [String],
    category: &'a Option<String>,
    series: &'a Option<String>,
    series_number: Option<f64>,
    publisher: &'a Option<String>,
    year: Option<i64>,
    isbn: &'a Option<String>,
    language: &'a Option<String>,
    pages: Option<i64>,
    format: Format,
    status: Status,
    rating: Option<i64>,
    location: &'a Option<String>,
    synopsis: &'a Option<String>,
    notes: &'a Option<String>,
    lent_to: &'a Option<String>,
    lent_at: &'a Option<String>,
    sigils: &'a [String],
    created_at: &'a str,
}

impl<'a> From<&'a Book> for ExportBook<'a> {
    fn from(b: &'a Book) -> Self {
        ExportBook {
            title: &b.title,
            subtitle: &b.subtitle,
            authors: &b.authors,
            category: &b.category,
            series: &b.series,
            series_number: b.series_number,
            publisher: &b.publisher,
            year: b.year,
            isbn: &b.isbn,
            language: &b.language,
            pages: b.pages,
            format: b.format,
            status: b.status,
            rating: b.rating,
            location: &b.location,
            synopsis: &b.synopsis,
            notes: &b.notes,
            lent_to: &b.lent_to,
            lent_at: &b.lent_at,
            sigils: &b.sigils,
            created_at: &b.created_at,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportFile<'a> {
    app: &'static str,
    version: u32,
    exported_at: String,
    books: Vec<ExportBook<'a>>,
}

/// Contenido del archivo de exportación de todos los libros (sin papelera).
pub fn export(conn: &Connection, format: ExportFormat) -> AppResult<Vec<u8>> {
    let books = list_books(conn)?;
    match format {
        ExportFormat::Json => {
            let exported_at: String =
                conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", [], |r| r.get(0))?;
            let file = ExportFile {
                app: "grimoire",
                version: 1,
                exported_at,
                books: books.iter().map(ExportBook::from).collect(),
            };
            serde_json::to_vec_pretty(&file).map_err(|e| AppError::Io(std::io::Error::other(e)))
        }
        ExportFormat::Csv => {
            // BOM y punto y coma: así Excel en español lo abre bien a la primera.
            let mut out = "\u{feff}".as_bytes().to_vec();
            {
                let mut w = csv::WriterBuilder::new().delimiter(b';').from_writer(&mut out);
                w.write_record(CSV_HEADERS).map_err(csv_error)?;
                for b in &books {
                    let num = |v: Option<i64>| v.map(|v| v.to_string()).unwrap_or_default();
                    let opt = |v: &Option<String>| v.clone().unwrap_or_default();
                    w.write_record([
                        b.title.clone(),
                        opt(&b.subtitle),
                        b.authors.join(LIST_SEP),
                        opt(&b.category),
                        opt(&b.series),
                        b.series_number.map(|n| n.to_string()).unwrap_or_default(),
                        opt(&b.publisher),
                        num(b.year),
                        opt(&b.isbn),
                        opt(&b.language),
                        num(b.pages),
                        b.format.as_str().to_string(),
                        b.status.as_str().to_string(),
                        num(b.rating),
                        opt(&b.location),
                        opt(&b.synopsis),
                        opt(&b.notes),
                        opt(&b.lent_to),
                        opt(&b.lent_at),
                        b.sigils.join(LIST_SEP),
                    ])
                    .map_err(csv_error)?;
                }
                w.flush()?;
            }
            Ok(out)
        }
    }
}

/// Escribe el archivo completo junto al destino y lo renombra: si algo falla
/// a mitad, el archivo anterior (si lo había) sigue intacto.
pub fn export_to(conn: &Connection, path: &Path, format: ExportFormat) -> AppResult<usize> {
    let data = export(conn, format)?;
    let tmp = path.with_extension("grimoire-tmp");
    fs::write(&tmp, &data)?;
    if let Err(err) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(err.into());
    }
    Ok(list_books(conn)?.len())
}

fn csv_error(err: csv::Error) -> AppError {
    AppError::Io(std::io::Error::other(err))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportIssue {
    /// Fila del archivo (en CSV, contando la cabecera) o posición en JSON.
    pub row: usize,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: usize,
    pub duplicates: usize,
    pub failed: usize,
    /// Detalle de los primeros errores.
    pub issues: Vec<ImportIssue>,
}

pub fn import_from(conn: &mut Connection, path: &Path) -> AppResult<ImportReport> {
    let size = fs::metadata(path)?.len();
    if size > MAX_IMPORT_BYTES {
        return Err(invalid_file("El archivo es demasiado grande (máximo 50 MB)"));
    }
    let bytes = fs::read(path)?;
    let text = String::from_utf8(bytes).map_err(|_| invalid_file("El archivo no está en UTF-8"))?;
    let is_json = path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("json"))
        || text.trim_start_matches('\u{feff}').trim_start().starts_with(['{', '[']);
    let rows = if is_json { parse_json(&text)? } else { parse_csv(&text)? };
    import_rows(conn, rows)
}

fn invalid_file(message: &str) -> AppError {
    AppError::Validation(vec![FieldError { field: "file", message: message.into() }])
}

/// Fila ya leída: el número para el informe y el libro o el motivo por el que no se pudo leer.
type Row = (usize, Result<BookInput, (String, String)>);

fn parse_json(text: &str) -> AppResult<Vec<Row>> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum File {
        Wrapped { books: Vec<serde_json::Value> },
        Plain(Vec<serde_json::Value>),
    }
    let file: File = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|e| invalid_file(&format!("El JSON no es válido: {e}")))?;
    let values = match file {
        File::Wrapped { books } | File::Plain(books) => books,
    };
    Ok(values
        .into_iter()
        .enumerate()
        .map(|(i, value)| {
            let title = value.get("title").and_then(|t| t.as_str()).unwrap_or_default().to_string();
            let book = serde_json::from_value::<BookInput>(value).map_err(|e| (title, format!("Datos no válidos: {e}")));
            (i + 1, book)
        })
        .collect())
}

fn parse_csv(text: &str) -> AppResult<Vec<Row>> {
    let text = text.trim_start_matches('\u{feff}');
    let first_line = text.lines().next().unwrap_or_default();
    let delimiter = if first_line.matches(';').count() >= first_line.matches(',').count() { b';' } else { b',' };
    let mut reader = csv::ReaderBuilder::new().delimiter(delimiter).flexible(true).from_reader(text.as_bytes());

    // Cabeceras sin acentos ni mayúsculas; se admiten también en inglés.
    let headers: Vec<String> = reader.headers().map_err(csv_error)?.iter().map(|h| fold(h).replace(' ', "_")).collect();
    let column = |names: &[&str]| headers.iter().position(|h| names.contains(&h.as_str()));
    let col = Columns {
        title: column(&["titulo", "title"]),
        subtitle: column(&["subtitulo", "subtitle"]),
        authors: column(&["autores", "autor", "authors", "author"]),
        category: column(&["categoria", "category"]),
        series: column(&["serie", "series"]),
        series_number: column(&["numero_serie", "series_number"]),
        publisher: column(&["editorial", "publisher"]),
        year: column(&["año", "ano", "year"]),
        isbn: column(&["isbn"]),
        language: column(&["idioma", "language"]),
        pages: column(&["paginas", "pages"]),
        format: column(&["formato", "format"]),
        status: column(&["estado", "status"]),
        rating: column(&["valoracion", "rating"]),
        location: column(&["ubicacion", "location"]),
        synopsis: column(&["sinopsis", "synopsis"]),
        notes: column(&["notas", "notes"]),
        lent_to: column(&["prestado_a", "lent_to"]),
        lent_at: column(&["fecha_prestamo", "lent_at"]),
        sigils: column(&["sigils", "tags", "etiquetas"]),
    };
    if col.title.is_none() {
        return Err(invalid_file("Falta la columna «titulo» en la primera fila"));
    }

    let mut rows = Vec::new();
    for (i, record) in reader.records().enumerate() {
        let line = i + 2;
        match record {
            Ok(record) => rows.push((line, col.read(&record))),
            Err(e) => rows.push((line, Err((String::new(), format!("Fila ilegible: {e}"))))),
        }
    }
    Ok(rows)
}

struct Columns {
    title: Option<usize>,
    subtitle: Option<usize>,
    authors: Option<usize>,
    category: Option<usize>,
    series: Option<usize>,
    series_number: Option<usize>,
    publisher: Option<usize>,
    year: Option<usize>,
    isbn: Option<usize>,
    language: Option<usize>,
    pages: Option<usize>,
    format: Option<usize>,
    status: Option<usize>,
    rating: Option<usize>,
    location: Option<usize>,
    synopsis: Option<usize>,
    notes: Option<usize>,
    lent_to: Option<usize>,
    lent_at: Option<usize>,
    sigils: Option<usize>,
}

impl Columns {
    fn read(&self, r: &csv::StringRecord) -> Result<BookInput, (String, String)> {
        let get = |c: Option<usize>| c.and_then(|c| r.get(c)).map(str::trim).filter(|s| !s.is_empty());
        let text = |c| get(c).map(str::to_string);
        let list = |c| get(c).map(|s| s.split(';').map(|p| p.trim().to_string()).collect()).unwrap_or_default();
        let title = text(self.title).unwrap_or_default();
        let fail = |field: &str, value: &str| (title.clone(), format!("{field}: «{value}» no es un número válido"));
        let int = |c, field| match get(c) {
            None => Ok(None),
            Some(v) => v.parse::<i64>().map(Some).map_err(|_| fail(field, v)),
        };

        let series_number = match get(self.series_number) {
            None => None,
            Some(v) => Some(v.replace(',', ".").parse::<f64>().map_err(|_| fail("numero_serie", v))?),
        };
        let format = match get(self.format).map(fold).as_deref() {
            None | Some("fisico") | Some("papel") => Format::Fisico,
            Some("ebook") | Some("digital") => Format::Ebook,
            Some("audio") | Some("audiolibro") => Format::Audio,
            Some(other) => return Err((title.clone(), format!("formato: «{other}» no es físico, ebook ni audio"))),
        };
        let status = match get(self.status).map(fold).as_deref() {
            None | Some("pendiente") => Status::Pendiente,
            Some("leyendo") => Status::Leyendo,
            Some("leido") => Status::Leido,
            Some(other) => return Err((title.clone(), format!("estado: «{other}» no es pendiente, leyendo ni leído"))),
        };

        Ok(BookInput {
            title: title.clone(),
            subtitle: text(self.subtitle),
            authors: list(self.authors),
            category: text(self.category),
            series: text(self.series),
            series_number,
            publisher: text(self.publisher),
            year: int(self.year, "año")?,
            isbn: text(self.isbn),
            language: text(self.language),
            pages: int(self.pages, "paginas")?,
            format,
            status,
            rating: int(self.rating, "valoracion")?,
            location: text(self.location),
            synopsis: get(self.synopsis).map(|s| s.replace("\\n", "\n")),
            notes: text(self.notes),
            lent_to: text(self.lent_to),
            lent_at: text(self.lent_at),
            sigils: list(self.sigils),
        })
    }
}

/// Clave para detectar duplicados: título y primer autor, sin acentos ni mayúsculas.
fn dedup_key(title: &str, authors: &[String]) -> String {
    format!("{}\u{1f}{}", fold(title), authors.first().map(|a| fold(a)).unwrap_or_default())
}

/// Valida todas las filas y guarda las correctas en una sola transacción:
/// o entran todas las válidas, o (si falla la base de datos) ninguna.
fn import_rows(conn: &mut Connection, rows: Vec<Row>) -> AppResult<ImportReport> {
    let mut seen: HashSet<String> = list_books(conn)?.iter().map(|b| dedup_key(&b.title, &b.authors)).collect();
    let mut report = ImportReport::default();
    fn issue(report: &mut ImportReport, row: usize, title: String, message: String) {
        report.failed += 1;
        if report.issues.len() < MAX_REPORTED_ERRORS {
            report.issues.push(ImportIssue { row, title, message });
        }
    }

    let tx = conn.transaction()?;
    for (row, parsed) in rows {
        let input = match parsed {
            Ok(input) => input,
            Err((title, message)) => {
                issue(&mut report, row, title, message);
                continue;
            }
        };
        let title = input.title.clone();
        let book = match sanitize(input) {
            Ok(book) => book,
            Err(AppError::Validation(errors)) => {
                let message = errors.iter().map(|e| format!("{}: {}", e.field, e.message)).collect::<Vec<_>>().join(" · ");
                issue(&mut report, row, title, message);
                continue;
            }
            Err(other) => return Err(other),
        };
        if !seen.insert(dedup_key(&book.title, &book.authors)) {
            report.duplicates += 1;
            continue;
        }
        insert_book(&tx, &book)?;
        report.imported += 1;
    }
    tx.commit()?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::repo::create_book;

    fn sample(conn: &mut Connection) {
        create_book(conn, BookInput {
            title: "El nombre del viento".into(),
            authors: vec!["Patrick Rothfuss".into()],
            category: Some("Fantasía".into()),
            series: Some("Crónica; del asesino".into()),
            series_number: Some(1.0),
            year: Some(2007),
            isbn: Some("978-84-376-0494-7".into()),
            status: Status::Leido,
            rating: Some(5),
            synopsis: Some("Primera línea\nsegunda línea; con \"comillas\"".into()),
            sigils: vec!["Magia".into(), "Épica".into()],
            ..Default::default()
        })
        .unwrap();
        create_book(conn, BookInput { title: "Dune".into(), authors: vec!["Frank Herbert".into()], ..Default::default() })
            .unwrap();
    }

    fn write(dir: &tempfile::TempDir, name: &str, data: &[u8]) -> std::path::PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, data).unwrap();
        path
    }

    #[test]
    fn json_round_trip_keeps_everything() {
        let mut source = open_in_memory().unwrap();
        sample(&mut source);
        let data = export(&source, ExportFormat::Json).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let path = write(&dir, "biblioteca.json", &data);
        let mut target = open_in_memory().unwrap();
        let report = import_from(&mut target, &path).unwrap();
        assert_eq!((report.imported, report.duplicates, report.failed), (2, 0, 0));

        let strip = |mut b: Book| {
            b.id = 0;
            b.created_at.clear();
            b.updated_at.clear();
            b
        };
        let a: Vec<Book> = list_books(&source).unwrap().into_iter().map(strip).collect();
        let b: Vec<Book> = list_books(&target).unwrap().into_iter().map(strip).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn csv_round_trip_keeps_everything() {
        let mut source = open_in_memory().unwrap();
        sample(&mut source);
        let data = export(&source, ExportFormat::Csv).unwrap();
        assert!(data.starts_with("\u{feff}".as_bytes()));

        let dir = tempfile::tempdir().unwrap();
        let path = write(&dir, "biblioteca.csv", &data);
        let mut target = open_in_memory().unwrap();
        let report = import_from(&mut target, &path).unwrap();
        assert_eq!(report.imported, 2, "{report:?}");
        let book = list_books(&target).unwrap().into_iter().find(|b| b.title == "El nombre del viento").unwrap();
        assert_eq!(book.sigils, vec!["Épica", "Magia"]);
        assert_eq!(book.synopsis.as_deref(), Some("Primera línea\nsegunda línea; con \"comillas\""));
        assert_eq!(book.isbn.as_deref(), Some("9788437604947"));
        assert_eq!(book.status, Status::Leido);
    }

    #[test]
    fn importing_twice_skips_duplicates() {
        let mut conn = open_in_memory().unwrap();
        sample(&mut conn);
        let data = export(&conn, ExportFormat::Json).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = write(&dir, "b.json", &data);
        let report = import_from(&mut conn, &path).unwrap();
        assert_eq!((report.imported, report.duplicates), (0, 2));
    }

    #[test]
    fn csv_from_other_sources_is_accepted_and_errors_are_reported() {
        let csv = "Title,Author,Year,Status,Tags\n\
                   Rayuela,Julio Cortázar,1963,Leído,Clásico;Experimental\n\
                   ,Sin título,2000,,\n\
                   Ficciones,Jorge Luis Borges,mil novecientos,,\n\
                   Solaris,Stanisław Lem,1961,abandonado,\n";
        let dir = tempfile::tempdir().unwrap();
        let path = write(&dir, "otra-app.csv", csv.as_bytes());
        let mut conn = open_in_memory().unwrap();
        let report = import_from(&mut conn, &path).unwrap();
        assert_eq!((report.imported, report.failed), (1, 3), "{report:?}");
        assert_eq!(report.issues.iter().map(|i| i.row).collect::<Vec<_>>(), vec![3, 4, 5]);
        assert!(report.issues[1].message.contains("mil novecientos"));
        let book = &list_books(&conn).unwrap()[0];
        assert_eq!(book.sigils, vec!["Clásico", "Experimental"]);
        assert_eq!(book.status, Status::Leido);
    }

    #[test]
    fn rejects_unusable_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = open_in_memory().unwrap();
        for (name, data) in [
            ("a.json", "{ roto".as_bytes()),
            ("b.csv", "nombre;autor\nDune;Herbert".as_bytes()),
            ("c.csv", &[0xff, 0xfe, 0x00][..]),
        ] {
            let path = write(&dir, name, data);
            assert!(matches!(import_from(&mut conn, &path), Err(AppError::Validation(_))), "{name}");
        }
        assert!(list_books(&conn).unwrap().is_empty());
    }

    #[test]
    fn export_replaces_file_atomically() {
        let mut conn = open_in_memory().unwrap();
        sample(&mut conn);
        let dir = tempfile::tempdir().unwrap();
        let path = write(&dir, "salida.json", b"viejo");
        assert_eq!(export_to(&conn, &path, ExportFormat::Json).unwrap(), 2);
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"app\": \"grimoire\""));
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no quedan temporales");
    }
}
