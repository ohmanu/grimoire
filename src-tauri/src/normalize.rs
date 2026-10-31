use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// Texto de una línea listo para guardar: sin caracteres de control y con los
/// espacios colapsados.
pub fn clean(s: &str) -> String {
    s.split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Texto de varias líneas: saltos de línea unificados, sin control ni espacios
/// al final de cada línea, y sin líneas vacías al principio o al final.
pub fn clean_multiline(s: &str) -> String {
    s.replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(|line| {
            line.chars()
                .map(|c| if c == '\t' { ' ' } else { c })
                .filter(|c| !c.is_control())
                .collect::<String>()
                .trim_end()
                .to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim_matches('\n')
        .to_string()
}

/// Clave de comparación: minúsculas y sin acentos, pero la ñ se conserva para
/// que "año" y "ano" no se confundan.
pub fn fold(s: &str) -> String {
    let mut out = String::new();
    for c in clean(s).chars() {
        if c == 'ñ' || c == 'Ñ' {
            out.push('ñ');
            continue;
        }
        for d in c.nfd().filter(|d| !is_combining_mark(*d)) {
            out.extend(d.to_lowercase());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_collapses_whitespace_and_control() {
        assert_eq!(clean("  El \t nombre\u{1f}del  viento "), "El nombre del viento");
        assert_eq!(clean("   "), "");
    }

    #[test]
    fn clean_multiline_normalizes_lines() {
        assert_eq!(clean_multiline("\r\nUna  \r\n\tdos\r\n\n"), "Una\n dos");
    }

    #[test]
    fn fold_ignores_case_and_accents_but_keeps_enye() {
        assert_eq!(fold("Ciencia  Ficción"), "ciencia ficcion");
        assert_eq!(fold("CIENCIA FICCION"), "ciencia ficcion");
        assert_eq!(fold("Año"), "año");
        assert_ne!(fold("Año"), fold("Ano"));
        assert_eq!(fold("Gabriel García Márquez"), "gabriel garcia marquez");
    }
}
