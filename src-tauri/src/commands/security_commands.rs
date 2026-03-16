use crate::db::DbState;
use crate::security::audit;
use tauri::State;

#[tauri::command]
pub fn run_security_audit(db: State<'_, DbState>) -> Result<Vec<audit::SecurityAuditResult>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, command, args, env FROM mcp_servers")
        .map_err(|e| e.to_string())?;

    let servers: Vec<(String, String, String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(audit::audit_all_servers(&servers))
}

#[tauri::command]
pub fn get_server_audit(
    server_id: String,
    db: State<'_, DbState>,
) -> Result<audit::SecurityAuditResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let (name, command, args, env): (String, String, String, String) = conn
        .query_row(
            "SELECT name, command, args, env FROM mcp_servers WHERE id = ?1",
            rusqlite::params![server_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    Ok(audit::audit_server(&server_id, &name, &command, &args, &env))
}
