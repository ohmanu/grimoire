use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    #[default]
    Fisico,
    Ebook,
    Audio,
}

impl Format {
    pub fn as_str(self) -> &'static str {
        match self {
            Format::Fisico => "fisico",
            Format::Ebook => "ebook",
            Format::Audio => "audio",
        }
    }

    pub fn from_db(s: &str) -> Self {
        match s {
            "ebook" => Format::Ebook,
            "audio" => Format::Audio,
            _ => Format::Fisico,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    #[default]
    Pendiente,
    Leyendo,
    Leido,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Pendiente => "pendiente",
            Status::Leyendo => "leyendo",
            Status::Leido => "leido",
        }
    }

    pub fn from_db(s: &str) -> Self {
        match s {
            "leyendo" => Status::Leyendo,
            "leido" => Status::Leido,
            _ => Status::Pendiente,
        }
    }
}

/// Lo que envía el formulario al crear o editar un libro. Los diccionarios
/// (autores, categoría, serie, sigils) van por nombre: si no existen, se crean.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BookInput {
    pub title: String,
    pub subtitle: Option<String>,
    pub authors: Vec<String>,
    pub category: Option<String>,
    pub series: Option<String>,
    pub series_number: Option<f64>,
    pub publisher: Option<String>,
    pub year: Option<i64>,
    pub isbn: Option<String>,
    pub language: Option<String>,
    pub pages: Option<i64>,
    pub format: Format,
    pub status: Status,
    pub rating: Option<i64>,
    pub location: Option<String>,
    pub synopsis: Option<String>,
    pub notes: Option<String>,
    pub lent_to: Option<String>,
    pub lent_at: Option<String>,
    pub sigils: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: i64,
    pub title: String,
    pub subtitle: Option<String>,
    pub authors: Vec<String>,
    pub category: Option<String>,
    pub series: Option<String>,
    pub series_number: Option<f64>,
    pub publisher: Option<String>,
    pub year: Option<i64>,
    pub isbn: Option<String>,
    pub language: Option<String>,
    pub pages: Option<i64>,
    pub format: Format,
    pub status: Status,
    pub rating: Option<i64>,
    pub location: Option<String>,
    pub synopsis: Option<String>,
    pub notes: Option<String>,
    pub cover: Option<String>,
    pub lent_to: Option<String>,
    pub lent_at: Option<String>,
    pub sigils: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// Entrada de un diccionario con cuántos libros (fuera de la papelera) la usan.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Dictionary {
    Categories,
    Authors,
    Series,
    Sigils,
}

impl Dictionary {
    pub fn table(self) -> &'static str {
        match self {
            Dictionary::Categories => "categories",
            Dictionary::Authors => "authors",
            Dictionary::Series => "series",
            Dictionary::Sigils => "sigils",
        }
    }
}
