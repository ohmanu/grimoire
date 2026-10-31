use rusqlite::types::Value;
use rusqlite::{Connection, params_from_iter};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::models::{Book, Format, NamedCount, Status};
use crate::normalize::fold;
use crate::repo::{SELECT_BOOK, book_from_row};

/// Cuántos valores se aceptan como mucho en cada lista de filtros. Es un tope
/// de seguridad, no un límite que el usuario vaya a notar.
const MAX_VALUES: usize = 500;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SigilMode {
    /// El libro tiene todos los sigils elegidos: cada uno estrecha el resultado.
    #[default]
    All,
    /// El libro tiene alguno de los sigils elegidos.
    Any,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sort {
    #[default]
    Title,
    Author,
    Year,
    Added,
    Rating,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchQuery {
    pub text: String,
    pub statuses: Vec<Status>,
    pub lent: Option<bool>,
    pub formats: Vec<Format>,
    pub category_ids: Vec<i64>,
    pub author_ids: Vec<i64>,
    pub series_ids: Vec<i64>,
    pub publishers: Vec<String>,
    pub languages: Vec<String>,
    pub year_min: Option<i64>,
    pub year_max: Option<i64>,
    pub pages_min: Option<i64>,
    pub pages_max: Option<i64>,
    pub rating_min: Option<i64>,
    pub location: String,
    pub sigil_ids: Vec<i64>,
    pub sigil_mode: SigilMode,
    pub sort: Sort,
    pub descending: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub books: Vec<Book>,
    /// Todos los sigils, cada uno con cuántos libros del resultado quedarían
    /// al añadirlo (modo «todos») o cuántos lo tienen (modo «alguno»).
    pub sigils: Vec<NamedCount>,
}

/// Condiciones WHERE con sus parámetros en el mismo orden.
#[derive(Default, Clone)]
struct Where {
    clauses: Vec<String>,
    params: Vec<Value>,
}

impl Where {
    fn push(&mut self, clause: impl Into<String>, params: impl IntoIterator<Item = Value>) {
        self.clauses.push(clause.into());
        self.params.extend(params);
    }

    /// `column IN (?, ?, …)` con los valores dados, si hay alguno.
    fn any_of(&mut self, column: &str, values: Vec<Value>) {
        if values.is_empty() {
            return;
        }
        let marks = vec!["?"; values.len()].join(", ");
        self.push(format!("{column} IN ({marks})"), values);
    }

    fn sql(&self) -> String {
        if self.clauses.is_empty() { "1".into() } else { self.clauses.join(" AND ") }
    }
}

fn ids(values: &[i64]) -> Vec<Value> {
    values.iter().take(MAX_VALUES).map(|&v| Value::Integer(v)).collect()
}

fn folded(values: &[String]) -> Vec<Value> {
    values.iter().take(MAX_VALUES).map(|v| Value::Text(fold(v))).filter(|v| v != &Value::Text(String::new())).collect()
}

/// Consulta FTS5 a partir de lo que escribe el usuario: cada palabra debe
/// aparecer (como prefijo) en algún campo. Se descarta la sintaxis de FTS5
/// para que ninguna entrada pueda romper la consulta.
pub fn fts_query(text: &str) -> Option<String> {
    let terms: Vec<String> = text
        .split_whitespace()
        .map(|word| word.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|word| !word.is_empty())
        .take(20)
        .map(|word| format!("\"{word}\"*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

/// Filtros comunes, sin los sigils (que se tratan aparte para los recuentos).
fn base_filters(q: &SearchQuery) -> Where {
    let mut w = Where::default();
    w.push("b.deleted_at IS NULL", []);

    if let Some(fts) = fts_query(&q.text) {
        // Un ISBN se busca tal cual, sin guiones; el resto, por texto completo.
        let digits: String = q.text.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase();
        let isbn_like = digits.len() >= 4 && digits.chars().all(|c| c.is_ascii_digit() || c == 'X');
        if isbn_like {
            w.push(
                "(b.id IN (SELECT rowid FROM books_fts WHERE books_fts MATCH ?) OR instr(b.isbn, ?) > 0)",
                [Value::Text(fts), Value::Text(digits)],
            );
        } else {
            w.push("b.id IN (SELECT rowid FROM books_fts WHERE books_fts MATCH ?)", [Value::Text(fts)]);
        }
    }

    w.any_of("b.status", q.statuses.iter().map(|s| Value::Text(s.as_str().into())).collect());
    w.any_of("b.format", q.formats.iter().map(|f| Value::Text(f.as_str().into())).collect());
    w.any_of("b.category_id", ids(&q.category_ids));
    w.any_of("b.series_id", ids(&q.series_ids));
    w.any_of("fold(b.publisher)", folded(&q.publishers));
    w.any_of("fold(b.language)", folded(&q.languages));
    if !q.author_ids.is_empty() {
        let marks = vec!["?"; q.author_ids.len().min(MAX_VALUES)].join(", ");
        w.push(
            format!("b.id IN (SELECT book_id FROM book_authors WHERE author_id IN ({marks}))"),
            ids(&q.author_ids),
        );
    }

    match q.lent {
        Some(true) => w.push("b.lent_to IS NOT NULL", []),
        Some(false) => w.push("b.lent_to IS NULL", []),
        None => {}
    }
    for (column, op, value) in [
        ("b.year", ">=", q.year_min),
        ("b.year", "<=", q.year_max),
        ("b.pages", ">=", q.pages_min),
        ("b.pages", "<=", q.pages_max),
        ("b.rating", ">=", q.rating_min),
    ] {
        if let Some(v) = value {
            w.push(format!("{column} {op} ?"), [Value::Integer(v)]);
        }
    }
    let location = fold(&q.location);
    if !location.is_empty() {
        w.push("instr(fold(b.location), ?) > 0", [Value::Text(location)]);
    }
    w
}

fn with_sigils(mut w: Where, sigil_ids: &[i64], mode: SigilMode) -> Where {
    let sigils = ids(sigil_ids);
    if sigils.is_empty() {
        return w;
    }
    let n = sigils.len() as i64;
    let marks = vec!["?"; sigils.len()].join(", ");
    match mode {
        SigilMode::All => {
            let mut params = sigils;
            params.push(Value::Integer(n));
            w.push(
                format!(
                    "b.id IN (SELECT book_id FROM book_sigils WHERE sigil_id IN ({marks}) \
                     GROUP BY book_id HAVING count(*) = ?)"
                ),
                params,
            );
        }
        SigilMode::Any => {
            w.push(format!("b.id IN (SELECT book_id FROM book_sigils WHERE sigil_id IN ({marks}))"), sigils);
        }
    }
    w
}

fn order_by(sort: Sort, descending: bool) -> String {
    let dir = if descending { "DESC" } else { "ASC" };
    // Los libros sin el dato van siempre al final, se ordene como se ordene.
    let key = match sort {
        Sort::Title => return format!("b.title_norm {dir}, b.id"),
        Sort::Author => {
            "(SELECT a.name_norm FROM book_authors ba JOIN authors a ON a.id = ba.author_id \
              WHERE ba.book_id = b.id ORDER BY ba.position LIMIT 1)"
        }
        Sort::Year => "b.year",
        Sort::Added => "b.created_at",
        Sort::Rating => "b.rating",
    };
    format!("({key}) IS NULL, {key} {dir}, b.title_norm, b.id")
}

pub fn search(conn: &Connection, q: &SearchQuery) -> AppResult<SearchResult> {
    // Sigils deduplicados: el mismo id dos veces rompería el recuento del modo «todos».
    let mut sigil_ids = q.sigil_ids.clone();
    sigil_ids.sort_unstable();
    sigil_ids.dedup();

    let base = base_filters(q);
    let filtered = with_sigils(base.clone(), &sigil_ids, q.sigil_mode);

    let sql = format!("{SELECT_BOOK} WHERE {} ORDER BY {}", filtered.sql(), order_by(q.sort, q.descending));
    let books = conn
        .prepare(&sql)?
        .query_map(params_from_iter(filtered.params.iter()), book_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    // En modo «todos», el recuento de cada sigil es cuántos libros del
    // resultado actual lo tienen: lo que quedaría si se añadiera. En modo
    // «alguno», cuántos libros (sin contar el filtro de sigils) lo tienen.
    let scope = match q.sigil_mode {
        SigilMode::All => &filtered,
        SigilMode::Any => &base,
    };
    // Una sola agrupación: la búsqueda se evalúa una vez, no una por sigil.
    let facets_sql = format!(
        "SELECT s.id, s.name, coalesce(c.n, 0)
           FROM sigils s
           LEFT JOIN (SELECT bs.sigil_id, count(*) AS n FROM book_sigils bs
                       WHERE bs.book_id IN (SELECT b.id FROM books b WHERE {})
                       GROUP BY bs.sigil_id) c ON c.sigil_id = s.id
          ORDER BY s.name_norm",
        scope.sql()
    );
    let sigils = conn
        .prepare(&facets_sql)?
        .query_map(params_from_iter(scope.params.iter()), |row| {
            Ok(NamedCount { id: row.get(0)?, name: row.get(1)?, count: row.get(2)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(SearchResult { books, sigils })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub all: i64,
    pub pendiente: i64,
    pub leyendo: i64,
    pub leido: i64,
    pub lent: i64,
    pub trash: i64,
}

/// Recuentos de la barra lateral.
pub fn stats(conn: &Connection) -> AppResult<Stats> {
    Ok(conn.query_row(
        "SELECT count(*) FILTER (WHERE deleted_at IS NULL),
                count(*) FILTER (WHERE deleted_at IS NULL AND status = 'pendiente'),
                count(*) FILTER (WHERE deleted_at IS NULL AND status = 'leyendo'),
                count(*) FILTER (WHERE deleted_at IS NULL AND status = 'leido'),
                count(*) FILTER (WHERE deleted_at IS NULL AND lent_to IS NOT NULL),
                count(*) FILTER (WHERE deleted_at IS NOT NULL)
           FROM books",
        [],
        |r| {
            Ok(Stats {
                all: r.get(0)?,
                pendiente: r.get(1)?,
                leyendo: r.get(2)?,
                leido: r.get(3)?,
                lent: r.get(4)?,
                trash: r.get(5)?,
            })
        },
    )?)
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextField {
    Language,
    Publisher,
}

/// Valores distintos de un campo de texto libre (sin distinguir acentos ni
/// mayúsculas), para sugerirlos y filtrar por ellos.
pub fn distinct_values(conn: &Connection, field: TextField) -> AppResult<Vec<String>> {
    let column = match field {
        TextField::Language => "language",
        TextField::Publisher => "publisher",
    };
    let sql = format!(
        "SELECT min({column}) FROM books WHERE {column} IS NOT NULL GROUP BY fold({column}) ORDER BY fold({column})"
    );
    let values = conn.prepare(&sql)?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::models::{BookInput, Dictionary};
    use crate::repo::{create_book, list_dictionary, trash_book};

    fn add(conn: &mut Connection, title: &str, f: impl FnOnce(&mut BookInput)) -> i64 {
        let mut input = BookInput { title: title.into(), ..Default::default() };
        f(&mut input);
        create_book(conn, input).unwrap().id
    }

    fn library() -> Connection {
        let mut conn = open_in_memory().unwrap();
        add(&mut conn, "El nombre del viento", |b| {
            b.authors = vec!["Patrick Rothfuss".into()];
            b.category = Some("Fantasía".into());
            b.series = Some("Crónica del asesino de reyes".into());
            b.year = Some(2007);
            b.pages = Some(880);
            b.rating = Some(5);
            b.status = Status::Leido;
            b.language = Some("Español".into());
            b.publisher = Some("Plaza & Janés".into());
            b.isbn = Some("978-84-376-0494-7".into());
            b.location = Some("Salón, balda 2".into());
            b.synopsis = Some("Kvothe cuenta su historia en una posada.".into());
            b.sigils = vec!["Magia".into(), "Épica".into(), "Música".into()];
        });
        add(&mut conn, "Dune", |b| {
            b.authors = vec!["Frank Herbert".into()];
            b.category = Some("Ciencia ficción".into());
            b.year = Some(1965);
            b.pages = Some(600);
            b.rating = Some(4);
            b.format = Format::Ebook;
            b.language = Some("español".into());
            b.sigils = vec!["Épica".into(), "Política".into()];
        });
        add(&mut conn, "Buenos presagios", |b| {
            b.authors = vec!["Terry Pratchett".into(), "Neil Gaiman".into()];
            b.category = Some("Fantasía".into());
            b.year = Some(1990);
            b.status = Status::Leyendo;
            b.language = Some("Inglés".into());
            b.lent_to = Some("Lucía".into());
            b.sigils = vec!["Humor".into(), "Magia".into()];
        });
        add(&mut conn, "Rayuela", |b| {
            b.authors = vec!["Julio Cortázar".into()];
            b.category = Some("Novela".into());
        });
        conn
    }

    fn titles(conn: &Connection, q: &SearchQuery) -> Vec<String> {
        search(conn, q).unwrap().books.into_iter().map(|b| b.title).collect()
    }

    fn dict_id(conn: &Connection, dict: Dictionary, name: &str) -> i64 {
        list_dictionary(conn, dict).unwrap().into_iter().find(|d| d.name == name).unwrap().id
    }

    #[test]
    fn empty_query_returns_everything_by_title() {
        let conn = library();
        assert_eq!(titles(&conn, &SearchQuery::default()), vec![
            "Buenos presagios",
            "Dune",
            "El nombre del viento",
            "Rayuela"
        ]);
    }

    #[test]
    fn text_matches_prefixes_accents_and_any_field() {
        let conn = library();
        let q = |text: &str| SearchQuery { text: text.into(), ..Default::default() };
        assert_eq!(titles(&conn, &q("nomb vien")), vec!["El nombre del viento"]);
        assert_eq!(titles(&conn, &q("cortazar")), vec!["Rayuela"]);
        assert_eq!(titles(&conn, &q("CRÓNICA")), vec!["El nombre del viento"]);
        assert_eq!(titles(&conn, &q("posada")), vec!["El nombre del viento"]);
        assert_eq!(titles(&conn, &q("gaiman")), vec!["Buenos presagios"]);
        assert!(titles(&conn, &q("inexistente")).is_empty());
    }

    #[test]
    fn text_never_breaks_the_query() {
        let conn = library();
        for text in ["\"", "*", "dune AND", "NEAR(", "(", "-", "a:b", "^^", "\"dune\" OR"] {
            let q = SearchQuery { text: text.into(), ..Default::default() };
            assert!(search(&conn, &q).is_ok(), "falló con {text:?}");
        }
    }

    #[test]
    fn isbn_search_ignores_dashes() {
        let conn = library();
        let q = SearchQuery { text: "84-376-0494".into(), ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento"]);
    }

    #[test]
    fn field_filters_combine() {
        let conn = library();
        let fantasia = dict_id(&conn, Dictionary::Categories, "Fantasía");
        let q = SearchQuery { category_ids: vec![fantasia], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Buenos presagios", "El nombre del viento"]);

        let q = SearchQuery { category_ids: vec![fantasia], statuses: vec![Status::Leido], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento"]);

        let gaiman = dict_id(&conn, Dictionary::Authors, "Neil Gaiman");
        let q = SearchQuery { author_ids: vec![gaiman], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Buenos presagios"]);

        let q = SearchQuery { formats: vec![Format::Ebook], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Dune"]);

        let q = SearchQuery { lent: Some(true), ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Buenos presagios"]);
        let q = SearchQuery { lent: Some(false), ..Default::default() };
        assert_eq!(titles(&conn, &q).len(), 3);
    }

    #[test]
    fn ranges_rating_location_and_free_text_fields() {
        let conn = library();
        let q = SearchQuery { year_min: Some(1980), year_max: Some(2000), ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Buenos presagios"]);
        let q = SearchQuery { pages_min: Some(700), ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento"]);
        let q = SearchQuery { rating_min: Some(4), ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Dune", "El nombre del viento"]);
        let q = SearchQuery { location: "salon".into(), ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento"]);
        // "Español" y "español" son el mismo idioma.
        let q = SearchQuery { languages: vec!["ESPAÑOL".into()], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Dune", "El nombre del viento"]);
        let q = SearchQuery { publishers: vec!["plaza & janes".into()], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento"]);
    }

    #[test]
    fn sigils_all_mode_narrows_and_counts_what_would_remain() {
        let conn = library();
        let magia = dict_id(&conn, Dictionary::Sigils, "Magia");
        let epica = dict_id(&conn, Dictionary::Sigils, "Épica");

        let q = SearchQuery { sigil_ids: vec![magia], ..Default::default() };
        let result = search(&conn, &q).unwrap();
        assert_eq!(result.books.len(), 2);
        let count = |name: &str| result.sigils.iter().find(|s| s.name == name).unwrap().count;
        assert_eq!(count("Magia"), 2);
        assert_eq!(count("Épica"), 1, "solo uno de los dos con Magia tiene Épica");
        assert_eq!(count("Política"), 0, "añadir Política dejaría 0 libros");

        let q = SearchQuery { sigil_ids: vec![magia, epica, magia], ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento"]);
    }

    #[test]
    fn sigils_any_mode_widens() {
        let conn = library();
        let humor = dict_id(&conn, Dictionary::Sigils, "Humor");
        let politica = dict_id(&conn, Dictionary::Sigils, "Política");
        let q = SearchQuery { sigil_ids: vec![humor, politica], sigil_mode: SigilMode::Any, ..Default::default() };
        let result = search(&conn, &q).unwrap();
        assert_eq!(result.books.len(), 2);
        // En «alguno» los recuentos no dependen de los sigils elegidos.
        assert_eq!(result.sigils.iter().find(|s| s.name == "Magia").unwrap().count, 2);
    }

    #[test]
    fn sorting_keeps_missing_values_last() {
        let conn = library();
        let q = SearchQuery { sort: Sort::Year, ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Dune", "Buenos presagios", "El nombre del viento", "Rayuela"]);
        let q = SearchQuery { sort: Sort::Year, descending: true, ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["El nombre del viento", "Buenos presagios", "Dune", "Rayuela"]);
        let q = SearchQuery { sort: Sort::Author, ..Default::default() };
        assert_eq!(titles(&conn, &q), vec!["Dune", "Rayuela", "El nombre del viento", "Buenos presagios"]);
        let q = SearchQuery { sort: Sort::Rating, descending: true, ..Default::default() };
        assert_eq!(&titles(&conn, &q)[..2], ["El nombre del viento", "Dune"]);
    }

    #[test]
    fn trash_is_excluded_and_stats_add_up() {
        let mut conn = library();
        let id = add(&mut conn, "Borrado", |_| {});
        trash_book(&conn, id).unwrap();
        assert!(!titles(&conn, &SearchQuery::default()).contains(&"Borrado".to_string()));
        let s = stats(&conn).unwrap();
        assert_eq!((s.all, s.leido, s.leyendo, s.pendiente, s.lent, s.trash), (4, 1, 1, 2, 1, 1));
    }

    #[test]
    fn distinct_values_merge_case_and_accents() {
        let conn = library();
        let languages = distinct_values(&conn, TextField::Language).unwrap();
        assert_eq!(languages.len(), 2);
        assert!(languages.iter().any(|l| fold(l) == "español"));
    }

    /// `cargo test --lib -- --ignored --nocapture` para medirlo.
    #[test]
    #[ignore]
    fn perf_5000_books() {
        let mut conn = open_in_memory().unwrap();
        let start = std::time::Instant::now();
        for i in 0..5000 {
            add(&mut conn, &format!("Libro número {i} de la colección"), |b| {
                b.authors = vec![format!("Autor {}", i % 400), format!("Coautor {}", i % 37)];
                b.category = Some(format!("Categoría {}", i % 25));
                b.year = Some(1900 + (i % 125) as i64);
                b.pages = Some(100 + (i % 900) as i64);
                b.rating = Some(1 + (i % 5) as i64);
                b.synopsis = Some(format!("Sinopsis del libro {i} con palabras como dragón, viaje y memoria."));
                b.sigils = (0..4).map(|k| format!("Sigil {}", (i * 7 + k * 13) % 120)).collect();
            });
        }
        println!("alta de 5.000 libros: {:?}", start.elapsed());

        let sigils = list_dictionary(&conn, Dictionary::Sigils).unwrap();
        let cases = [
            ("todo", SearchQuery::default()),
            ("texto", SearchQuery { text: "drag viaje".into(), ..Default::default() }),
            ("2 sigils", SearchQuery { sigil_ids: vec![sigils[3].id, sigils[50].id], ..Default::default() }),
            (
                "texto + filtros + sigil + orden",
                SearchQuery {
                    text: "libro".into(),
                    year_min: Some(1950),
                    rating_min: Some(3),
                    sigil_ids: vec![sigils[10].id],
                    sort: Sort::Author,
                    ..Default::default()
                },
            ),
        ];
        for (name, q) in cases {
            let start = std::time::Instant::now();
            let result = search(&conn, &q).unwrap();
            let elapsed = start.elapsed();
            println!("{name}: {} libros en {elapsed:?}", result.books.len());
        }
    }

    #[test]
    fn fts_query_sanitizes() {
        assert_eq!(fts_query("  "), None);
        assert_eq!(fts_query("\"*()"), None);
        assert_eq!(fts_query("El nombre").as_deref(), Some("\"El\"* \"nombre\"*"));
    }
}
