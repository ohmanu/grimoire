use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::covers;
use crate::error::AppResult;
use crate::models::{Book, BookInput, Dictionary, NamedCount};
use crate::{repo, search};

pub struct Db {
    conn: Mutex<Connection>,
    pub data_dir: PathBuf,
}

impl Db {
    pub fn new(conn: Connection, data_dir: PathBuf) -> Self {
        Self { conn: Mutex::new(conn), data_dir }
    }

    /// Si un comando anterior falló con pánico, la conexión sigue siendo
    /// válida (las transacciones sin commit se deshacen solas), así que se
    /// recupera en lugar de dejar la app inservible.
    fn lock(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn covers_dir(&self) -> PathBuf {
        self.data_dir.join(covers::COVERS_DIR)
    }

    fn delete_covers(&self, names: &[String]) {
        for name in names {
            covers::delete_file(&self.covers_dir(), name);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: &'static str,
    data_dir: String,
    covers_dir: String,
}

// Los comandos son `async` para que Tauri los ejecute fuera del hilo de la
// ventana: una consulta lenta nunca congela la interfaz.

#[tauri::command]
pub async fn app_info(db: State<'_, Db>) -> AppResult<AppInfo> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        data_dir: db.data_dir.display().to_string(),
        covers_dir: db.covers_dir().display().to_string(),
    })
}

#[tauri::command]
pub async fn list_books(db: State<'_, Db>) -> AppResult<Vec<Book>> {
    repo::list_books(&db.lock())
}

#[tauri::command]
pub async fn get_book(db: State<'_, Db>, id: i64) -> AppResult<Book> {
    repo::get_book(&db.lock(), id)
}

#[tauri::command]
pub async fn create_book(db: State<'_, Db>, input: BookInput) -> AppResult<Book> {
    repo::create_book(&mut db.lock(), input)
}

#[tauri::command]
pub async fn update_book(db: State<'_, Db>, id: i64, input: BookInput) -> AppResult<Book> {
    repo::update_book(&mut db.lock(), id, input)
}

#[tauri::command]
pub async fn trash_book(db: State<'_, Db>, id: i64) -> AppResult<()> {
    repo::trash_book(&db.lock(), id)
}

#[tauri::command]
pub async fn restore_book(db: State<'_, Db>, id: i64) -> AppResult<Book> {
    repo::restore_book(&db.lock(), id)
}

#[tauri::command]
pub async fn list_trash(db: State<'_, Db>) -> AppResult<Vec<Book>> {
    repo::list_trash(&db.lock())
}

#[tauri::command]
pub async fn purge_book(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let covers = repo::purge_book(&mut db.lock(), id)?;
    db.delete_covers(&covers);
    Ok(())
}

#[tauri::command]
pub async fn empty_trash(db: State<'_, Db>) -> AppResult<usize> {
    let (removed, covers) = repo::empty_trash(&mut db.lock())?;
    db.delete_covers(&covers);
    Ok(removed)
}

#[tauri::command]
pub async fn search_books(db: State<'_, Db>, query: search::SearchQuery) -> AppResult<search::SearchResult> {
    search::search(&db.lock(), &query)
}

#[tauri::command]
pub async fn library_stats(db: State<'_, Db>) -> AppResult<search::Stats> {
    search::stats(&db.lock())
}

#[tauri::command]
pub async fn distinct_values(db: State<'_, Db>, field: search::TextField) -> AppResult<Vec<String>> {
    search::distinct_values(&db.lock(), field)
}

#[tauri::command]
pub async fn set_cover(db: State<'_, Db>, id: i64, data: String) -> AppResult<Book> {
    covers::set_cover(&db.lock(), &db.covers_dir(), id, &data)
}

#[tauri::command]
pub async fn remove_cover(db: State<'_, Db>, id: i64) -> AppResult<Book> {
    covers::remove_cover(&db.lock(), &db.covers_dir(), id)
}

#[tauri::command]
pub async fn list_dictionary(db: State<'_, Db>, kind: Dictionary) -> AppResult<Vec<NamedCount>> {
    repo::list_dictionary(&db.lock(), kind)
}
