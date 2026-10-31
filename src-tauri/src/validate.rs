use std::collections::HashSet;

use crate::error::{AppError, AppResult, FieldError};
use crate::models::BookInput;
use crate::normalize::{clean, clean_multiline, fold};

pub const SYNOPSIS_MAX_LINES: usize = 5;
pub const SYNOPSIS_MAX_CHARS: usize = 600;
pub const MAX_AUTHORS: usize = 20;
pub const MAX_SIGILS: usize = 50;
pub const SIGIL_MAX_CHARS: usize = 40;

/// Limpia y valida la entrada. Devuelve la versión lista para guardar o todos
/// los errores a la vez, para que el formulario los marque de una sola pasada.
pub fn sanitize(input: BookInput) -> AppResult<BookInput> {
    let mut v = Validator::default();

    let title = clean(&input.title);
    if title.is_empty() {
        v.error("title", "El título es obligatorio");
    }
    v.max_len("title", &title, 300);

    let subtitle = v.line("subtitle", input.subtitle, 300);
    let category = v.line("category", input.category, 80);
    let series = v.line("series", input.series, 200);
    let publisher = v.line("publisher", input.publisher, 200);
    let language = v.line("language", input.language, 50);
    let location = v.line("location", input.location, 200);
    let lent_to = v.line("lentTo", input.lent_to, 200);
    let notes = v.text("notes", input.notes, 5000);

    let synopsis = input.synopsis.map(|s| clean_multiline(&s)).filter(|s| !s.is_empty());
    if let Some(s) = &synopsis {
        if s.lines().count() > SYNOPSIS_MAX_LINES {
            v.error("synopsis", format!("La sinopsis admite como máximo {SYNOPSIS_MAX_LINES} líneas"));
        }
        v.max_len("synopsis", s, SYNOPSIS_MAX_CHARS);
    }

    let authors = v.names("authors", input.authors, 200, MAX_AUTHORS, "autores");
    let sigils = v.names("sigils", input.sigils, SIGIL_MAX_CHARS, MAX_SIGILS, "sigils");

    let series_number = input.series_number;
    if let Some(n) = series_number {
        if !n.is_finite() || n <= 0.0 || n > 100_000.0 {
            v.error("seriesNumber", "El número en la serie debe ser mayor que 0");
        } else if series.is_none() {
            v.error("seriesNumber", "Indica la serie a la que pertenece");
        }
    }

    if let Some(year) = input.year {
        if !(-3000..=2100).contains(&year) {
            v.error("year", "El año debe estar entre -3000 y 2100");
        }
    }
    if let Some(pages) = input.pages {
        if !(1..=100_000).contains(&pages) {
            v.error("pages", "El número de páginas debe ser mayor que 0");
        }
    }
    if let Some(rating) = input.rating {
        if !(1..=5).contains(&rating) {
            v.error("rating", "La valoración va de 1 a 5");
        }
    }

    let isbn = input.isbn.map(|s| clean(&s)).filter(|s| !s.is_empty());
    let isbn = match isbn {
        Some(raw) => match normalize_isbn(&raw) {
            Some(valid) => Some(valid),
            None => {
                v.error("isbn", "El ISBN no es válido (debe tener 10 o 13 cifras y la de control correcta)");
                None
            }
        },
        None => None,
    };

    // Sin destinatario no hay préstamo: la fecha sola no tiene sentido.
    let lent_at = if lent_to.is_some() {
        let date = input.lent_at.map(|s| clean(&s)).filter(|s| !s.is_empty());
        if let Some(d) = &date {
            if !is_valid_date(d) {
                v.error("lentAt", "La fecha de préstamo debe tener el formato AAAA-MM-DD");
            }
        }
        date
    } else {
        None
    };

    v.finish(BookInput {
        title,
        subtitle,
        authors,
        category,
        series,
        series_number,
        publisher,
        year: input.year,
        isbn,
        language,
        pages: input.pages,
        format: input.format,
        status: input.status,
        rating: input.rating,
        location,
        synopsis,
        notes,
        lent_to,
        lent_at,
        sigils,
    })
}

#[derive(Default)]
struct Validator {
    errors: Vec<FieldError>,
}

impl Validator {
    fn error(&mut self, field: &'static str, message: impl Into<String>) {
        // Un mensaje por campo: el primero es el más útil.
        if !self.errors.iter().any(|e| e.field == field) {
            self.errors.push(FieldError { field, message: message.into() });
        }
    }

    fn max_len(&mut self, field: &'static str, value: &str, max: usize) {
        if value.chars().count() > max {
            self.error(field, format!("Máximo {max} caracteres"));
        }
    }

    fn line(&mut self, field: &'static str, value: Option<String>, max: usize) -> Option<String> {
        let value = value.map(|s| clean(&s)).filter(|s| !s.is_empty());
        if let Some(s) = &value {
            self.max_len(field, s, max);
        }
        value
    }

    fn text(&mut self, field: &'static str, value: Option<String>, max: usize) -> Option<String> {
        let value = value.map(|s| clean_multiline(&s)).filter(|s| !s.is_empty());
        if let Some(s) = &value {
            self.max_len(field, s, max);
        }
        value
    }

    /// Lista de nombres sin vacíos ni duplicados (comparando sin mayúsculas ni
    /// acentos), en el orden en que se escribieron.
    fn names(
        &mut self,
        field: &'static str,
        values: Vec<String>,
        max_chars: usize,
        max_items: usize,
        label: &str,
    ) -> Vec<String> {
        let mut seen = HashSet::new();
        let names: Vec<String> = values
            .iter()
            .map(|s| clean(s))
            .filter(|s| !s.is_empty() && seen.insert(fold(s)))
            .collect();
        if names.len() > max_items {
            self.error(field, format!("Máximo {max_items} {label}"));
        }
        if names.iter().any(|n| n.chars().count() > max_chars) {
            self.error(field, format!("Cada nombre admite como máximo {max_chars} caracteres"));
        }
        names
    }

    fn finish(self, book: BookInput) -> AppResult<BookInput> {
        if self.errors.is_empty() {
            Ok(book)
        } else {
            Err(AppError::Validation(self.errors))
        }
    }
}

/// ISBN-10 o ISBN-13 sin guiones ni espacios, con la cifra de control
/// comprobada. `None` si no es válido.
pub fn normalize_isbn(raw: &str) -> Option<String> {
    let s: String = raw
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();
    let bytes = s.as_bytes();
    let valid = match bytes.len() {
        10 => {
            let mut sum = 0u32;
            for (i, &c) in bytes.iter().enumerate() {
                let digit = match c {
                    b'0'..=b'9' => (c - b'0') as u32,
                    b'X' if i == 9 => 10,
                    _ => return None,
                };
                sum += digit * (10 - i as u32);
            }
            sum % 11 == 0
        }
        13 => {
            if !bytes.iter().all(u8::is_ascii_digit) {
                return None;
            }
            let sum: u32 = bytes
                .iter()
                .enumerate()
                .map(|(i, &c)| (c - b'0') as u32 * if i % 2 == 0 { 1 } else { 3 })
                .sum();
            sum % 10 == 0
        }
        _ => false,
    };
    valid.then_some(s)
}

/// Fecha `AAAA-MM-DD` que existe en el calendario.
pub fn is_valid_date(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    let [y, m, d] = parts.as_slice() else { return false };
    if y.len() != 4 || m.len() != 2 || d.len() != 2 {
        return false;
    }
    let (Ok(y), Ok(m), Ok(d)) = (y.parse::<u32>(), m.parse::<u32>(), d.parse::<u32>()) else {
        return false;
    };
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&d)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book(title: &str) -> BookInput {
        BookInput { title: title.into(), ..Default::default() }
    }

    fn fields(err: AppError) -> Vec<&'static str> {
        match err {
            AppError::Validation(errors) => errors.into_iter().map(|e| e.field).collect(),
            other => panic!("se esperaba error de validación, llegó {other:?}"),
        }
    }

    #[test]
    fn title_is_required() {
        assert_eq!(fields(sanitize(book("   ")).unwrap_err()), vec!["title"]);
    }

    #[test]
    fn cleans_text_and_drops_empty_optionals() {
        let mut input = book("  Dune  ");
        input.subtitle = Some("   ".into());
        input.publisher = Some(" Debolsillo ".into());
        let out = sanitize(input).unwrap();
        assert_eq!(out.title, "Dune");
        assert_eq!(out.subtitle, None);
        assert_eq!(out.publisher.as_deref(), Some("Debolsillo"));
    }

    #[test]
    fn synopsis_limits_lines_and_chars() {
        let mut input = book("X");
        input.synopsis = Some("1\n2\n3\n4\n5".into());
        assert!(sanitize(input.clone()).is_ok());

        input.synopsis = Some("1\n2\n3\n4\n5\n6".into());
        assert_eq!(fields(sanitize(input.clone()).unwrap_err()), vec!["synopsis"]);

        input.synopsis = Some("a".repeat(SYNOPSIS_MAX_CHARS + 1));
        assert_eq!(fields(sanitize(input).unwrap_err()), vec!["synopsis"]);
    }

    #[test]
    fn authors_and_sigils_are_deduplicated_in_order() {
        let mut input = book("X");
        input.authors = vec!["Neil Gaiman".into(), " ".into(), "Terry Pratchett".into(), "neil  gaiman".into()];
        input.sigils = vec!["Fantasía".into(), "fantasia".into(), "Humor".into()];
        let out = sanitize(input).unwrap();
        assert_eq!(out.authors, vec!["Neil Gaiman", "Terry Pratchett"]);
        assert_eq!(out.sigils, vec!["Fantasía", "Humor"]);
    }

    #[test]
    fn sigil_length_is_limited() {
        let mut input = book("X");
        input.sigils = vec!["s".repeat(SIGIL_MAX_CHARS + 1)];
        assert_eq!(fields(sanitize(input).unwrap_err()), vec!["sigils"]);
    }

    #[test]
    fn numeric_ranges() {
        let mut input = book("X");
        input.year = Some(2101);
        input.pages = Some(0);
        input.rating = Some(6);
        assert_eq!(fields(sanitize(input).unwrap_err()), vec!["year", "pages", "rating"]);
    }

    #[test]
    fn series_number_needs_series() {
        let mut input = book("X");
        input.series_number = Some(2.0);
        assert_eq!(fields(sanitize(input.clone()).unwrap_err()), vec!["seriesNumber"]);
        input.series = Some("Dune".into());
        assert!(sanitize(input.clone()).is_ok());
        input.series_number = Some(f64::NAN);
        assert_eq!(fields(sanitize(input).unwrap_err()), vec!["seriesNumber"]);
    }

    #[test]
    fn isbn_is_validated_and_normalized() {
        assert_eq!(normalize_isbn("978-84-376-0494-7").as_deref(), Some("9788437604947"));
        assert_eq!(normalize_isbn("0-306-40615-2").as_deref(), Some("0306406152"));
        assert_eq!(normalize_isbn("0-8044-2957-x").as_deref(), Some("080442957X"));
        assert_eq!(normalize_isbn("978-84-376-0494-8"), None);
        assert_eq!(normalize_isbn("12345"), None);
        assert_eq!(normalize_isbn("X306406152"), None);

        let mut input = book("X");
        input.isbn = Some("978 84 376 0494 7".into());
        assert_eq!(sanitize(input.clone()).unwrap().isbn.as_deref(), Some("9788437604947"));
        input.isbn = Some("1234".into());
        assert_eq!(fields(sanitize(input).unwrap_err()), vec!["isbn"]);
    }

    #[test]
    fn loan_date_requires_borrower_and_valid_date() {
        let mut input = book("X");
        input.lent_at = Some("2026-10-31".into());
        assert_eq!(sanitize(input.clone()).unwrap().lent_at, None);

        input.lent_to = Some("Lucía".into());
        assert_eq!(sanitize(input.clone()).unwrap().lent_at.as_deref(), Some("2026-10-31"));

        input.lent_at = Some("2026-02-30".into());
        assert_eq!(fields(sanitize(input).unwrap_err()), vec!["lentAt"]);
    }

    #[test]
    fn dates() {
        assert!(is_valid_date("2024-02-29"));
        assert!(!is_valid_date("2023-02-29"));
        assert!(!is_valid_date("2023-13-01"));
        assert!(!is_valid_date("23-01-01"));
        assert!(!is_valid_date("2023-1-01"));
    }
}
