mod commands;
mod covers;
mod db;
mod error;
mod models;
mod normalize;
mod paths;
mod repo;
mod search;
mod validate;

use std::fs;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = paths::data_dir(app.path().app_data_dir().ok());
            fs::create_dir_all(&data_dir)?;
            let conn = db::open(&data_dir.join(db::DB_FILE))?;
            // Una copia fallida no debe impedir usar la app: se avisa y se sigue.
            if let Err(err) = db::backup_if_changed(&conn, &data_dir.join(db::BACKUP_DIR), db::BACKUPS_KEPT) {
                eprintln!("No se pudo hacer la copia de seguridad: {err}");
            }
            let db = commands::Db::new(conn, data_dir);
            // La interfaz solo puede leer archivos de la carpeta de portadas.
            fs::create_dir_all(db.covers_dir())?;
            app.asset_protocol_scope().allow_directory(db.covers_dir(), false)?;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
