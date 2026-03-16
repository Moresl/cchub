pub mod schema;
pub mod models;

use rusqlite::Connection;
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

pub struct DbState(pub Mutex<Connection>);

pub fn get_db_path(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
    app_dir.join("cchub.db")
}

pub fn init_db(app_handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_db_path(app_handle);
    let db_exists = db_path.exists();
    let conn = Connection::open(&db_path)?;

    // SQLite PRAGMA optimizations (inspired by cc-switch)
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;       // Write-Ahead Logging for better concurrency
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;        // Enforce foreign key constraints
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;      // Wait up to 5s on locked DB instead of failing immediately
    conn.execute_batch("PRAGMA synchronous = NORMAL;")?;     // Good balance of safety vs performance with WAL

    if !db_exists {
        conn.execute_batch("PRAGMA auto_vacuum = INCREMENTAL;")?;  // Enable incremental vacuum for new DBs
    }

    schema::run_migrations(&conn)?;
    app_handle.manage(DbState(Mutex::new(conn)));
    Ok(())
}
