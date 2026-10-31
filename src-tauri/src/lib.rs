mod commands;
mod covers;
mod db;
mod error;
mod models;
mod normalize;
mod paths;
mod repo;
mod search;
mod transfer;
mod validate;

use std::fs;
use std::path::Path;

use rusqlite::Connection;
use tauri::Manager;

use crate::error::AppResult;

/// Abre (o crea) la base de datos y hace la copia de seguridad del arranque.
fn open_library(data_dir: &Path) -> AppResult<Connection> {
    fs::create_dir_all(data_dir)?;
    let conn = db::open(&data_dir.join(db::DB_FILE))?;
    // Una copia fallida no debe impedir usar la app: se avisa y se sigue.
    if let Err(err) = db::backup_if_changed(&conn, &data_dir.join(db::BACKUP_DIR), db::BACKUPS_KEPT) {
        eprintln!("No se pudo hacer la copia de seguridad: {err}");
    }
    Ok(conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = paths::data_dir(app.path().app_data_dir().ok());
            // Si la base de datos no se puede abrir, la app arranca igual y
            // la interfaz explica qué ha pasado y dónde están las copias.
            let db = match open_library(&data_dir) {
                Ok(conn) => commands::Db::new(conn, data_dir),
                Err(err) => {
                    eprintln!("No se pudo abrir la biblioteca: {err}");
                    commands::Db::failed(err.to_string(), data_dir)
                }
            };
            // La interfaz solo puede leer archivos de la carpeta de portadas.
            if fs::create_dir_all(db.covers_dir()).is_ok() {
                if let Err(err) = app.asset_protocol_scope().allow_directory(db.covers_dir(), false) {
                    eprintln!("No se pudo dar acceso a las portadas: {err}");
                }
            }
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::list_books,
            commands::get_book,
            commands::create_book,
            commands::update_book,
            commands::trash_book,
            commands::restore_book,
            commands::list_trash,
            commands::purge_book,
            commands::empty_trash,
            commands::list_dictionary,
            commands::set_cover,
            commands::remove_cover,
            commands::search_books,
            commands::library_stats,
            commands::distinct_values,
            commands::rename_entry,
            commands::delete_entry,
            commands::export_books,
            commands::import_books,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
