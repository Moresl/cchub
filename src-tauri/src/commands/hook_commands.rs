use crate::db::models::Hook;
use crate::db::DbState;
use crate::hooks::manager;
use tauri::State;

#[tauri::command]
pub fn scan_hooks() -> Result<Vec<Hook>, String> {
    Ok(manager::read_hooks_from_settings())
}

#[tauri::command]
pub fn get_hooks(db: State<'_, DbState>) -> Result<Vec<Hook>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, event, matcher, command, scope, project_path, enabled FROM hooks")
        .map_err(|e| e.to_string())?;

    let hooks = stmt
        .query_map([], |row| {
            Ok(Hook {
                id: row.get(0)?,
                event: row.get(1)?,
                matcher: row.get(2)?,
                command: row.get(3)?,
                scope: row.get(4)?,
                project_path: row.get(5)?,
                enabled: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(hooks)
}

#[tauri::command]
pub fn create_hook(
    event: String,
    matcher: Option<String>,
    command: String,
    scope: String,
    project_path: Option<String>,
    db: State<'_, DbState>,
) -> Result<Hook, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO hooks (id, event, matcher, command, scope, project_path, enabled) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
        rusqlite::params![id, event, matcher, command, scope, project_path],
    ).map_err(|e| e.to_string())?;

    Ok(Hook {
        id,
        event,
        matcher,
        command,
        scope,
        project_path,
        enabled: true,
    })
}

#[tauri::command]
pub fn update_hook(
    id: String,
    event: Option<String>,
    matcher: Option<String>,
    command: Option<String>,
    enabled: Option<bool>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    if let Some(event) = event {
        conn.execute("UPDATE hooks SET event = ?1 WHERE id = ?2", rusqlite::params![event, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(matcher) = matcher {
        conn.execute("UPDATE hooks SET matcher = ?1 WHERE id = ?2", rusqlite::params![matcher, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(command) = command {
        conn.execute("UPDATE hooks SET command = ?1 WHERE id = ?2", rusqlite::params![command, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(enabled) = enabled {
        conn.execute("UPDATE hooks SET enabled = ?1 WHERE id = ?2", rusqlite::params![enabled, id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_hook(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM hooks WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
