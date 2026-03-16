use crate::db::models::UpdateInfo;
use crate::db::DbState;
use crate::updater::migrator;
use tauri::State;

#[tauri::command]
pub async fn check_updates(db: State<'_, DbState>) -> Result<Vec<UpdateInfo>, String> {
    let servers: Vec<(String, String, String, String)> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, package_name, version FROM mcp_servers WHERE package_name IS NOT NULL")
            .map_err(|e| e.to_string())?;

        let result = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    let mut updates = Vec::new();

    for (id, name, package_name, current_version) in servers {
        if let Ok(latest) = crate::updater::checker::check_npm_version(&package_name).await {
            if latest != current_version && !current_version.is_empty() {
                updates.push(UpdateInfo {
                    item_type: "mcp_server".to_string(),
                    item_id: id,
                    item_name: name,
                    current_version,
                    latest_version: latest,
                });
            }
        }
    }

    Ok(updates)
}

#[tauri::command]
pub fn get_update_history(db: State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT item_type, item_id, old_version, new_version, status, updated_at FROM update_history ORDER BY updated_at DESC LIMIT 50")
        .map_err(|e| e.to_string())?;

    let history = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "item_type": row.get::<_, String>(0)?,
                "item_id": row.get::<_, String>(1)?,
                "old_version": row.get::<_, Option<String>>(2)?,
                "new_version": row.get::<_, Option<String>>(3)?,
                "status": row.get::<_, Option<String>>(4)?,
                "updated_at": row.get::<_, Option<String>>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(history)
}

#[tauri::command]
pub fn get_app_version() -> String {
    migrator::get_current_version()
}
