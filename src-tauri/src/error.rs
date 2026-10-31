use serde::Serialize;
use serde::ser::SerializeStruct;

/// Error de un campo concreto del formulario. `field` usa el mismo nombre
/// (camelCase) que la entrada que envía el frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FieldError {
    pub field: &'static str,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Revisa los campos marcados")]
    Validation(Vec<FieldError>),
    #[error("No se ha encontrado {0}")]
    NotFound(&'static str),
    #[error("La base de datos es de una versión más nueva de Grimoire (esquema {found}, esta versión entiende hasta {supported})")]
    NewerSchema { found: i64, supported: i64 },
    #[error("La base de datos está dañada: {0}")]
    Corrupt(String),
    #[error("La biblioteca no está disponible: {0}")]
    Unavailable(String),
    #[error("Error de base de datos: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Error de archivo: {0}")]
    Io(#[from] std::io::Error),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Validation(_) => "validation",
            AppError::NotFound(_) => "not_found",
            AppError::NewerSchema { .. } => "newer_schema",
            AppError::Corrupt(_) => "corrupt",
            AppError::Unavailable(_) => "unavailable",
            AppError::Db(_) => "db",
            AppError::Io(_) => "io",
        }
    }
}

/// Se serializa como `{ kind, message, fields }` para que el frontend pueda
/// mostrar el mensaje general y marcar cada campo con su error.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let fields: &[FieldError] = match self {
            AppError::Validation(fields) => fields,
            _ => &[],
        };
        let mut s = serializer.serialize_struct("AppError", 3)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("fields", fields)?;
        s.end()
    }
}
