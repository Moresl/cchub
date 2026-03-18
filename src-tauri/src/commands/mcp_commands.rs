use crate::db::models::McpServer;
use crate::db::{DbState, record_activity};
use crate::mcp::config;
use crate::mcp::health;
use tauri::State;
use std::collections::HashMap;

#[tauri::command]
pub fn scan_mcp_servers(db: State<'_, DbState>) -> Result<Vec<McpServer>, String> {
    let scanned = config::scan_all_mcp_servers();

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let mut all_servers = Vec::new();

    for s in scanned {
        let args_json = serde_json::to_string(&s.args).unwrap_or_else(|_| "[]".to_string());
        let env_json = serde_json::to_string(&s.env).unwrap_or_else(|_| "{}".to_string());

        // Check if disabled in our DB
        let existing_status: Option<String> = conn
            .query_row(
                "SELECT status FROM mcp_servers WHERE id = ?1",
                rusqlite::params![s.name],
                |row| row.get(0),
            )
            .ok();

        let status = existing_status.unwrap_or_else(|| "active".to_string());

        conn.execute(
            "INSERT OR REPLACE INTO mcp_servers (id, name, command, args, env, transport, source, config_path, status, installed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, COALESCE((SELECT installed_at FROM mcp_servers WHERE id = ?1), ?10), ?10)",
            rusqlite::params![s.name, s.name, s.command, args_json, env_json, s.transport, s.source, s.config_path, status, now],
        ).map_err(|e| e.to_string())?;

        all_servers.push(McpServer {
            id: s.name.clone(),
            name: s.name,
            package_name: None,
            version: None,
            transport: s.transport,
            command: Some(s.command),
            args: args_json,
            env: env_json,
            status,
            source: s.source,
            config_path: Some(s.config_path),
            installed_at: Some(now.clone()),
            updated_at: Some(now.clone()),
        });
    }

    Ok(all_servers)
}

#[tauri::command]
pub fn get_mcp_servers(db: State<'_, DbState>) -> Result<Vec<McpServer>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, package_name, version, transport, command, args, env, status, source, config_path, installed_at, updated_at FROM mcp_servers")
        .map_err(|e| e.to_string())?;

    let servers = stmt
        .query_map([], |row| {
            Ok(McpServer {
                id: row.get(0)?,
                name: row.get(1)?,
                package_name: row.get(2)?,
                version: row.get(3)?,
                transport: row.get(4)?,
                command: row.get(5)?,
                args: row.get(6)?,
                env: row.get(7)?,
                status: row.get(8)?,
                source: row.get(9)?,
                config_path: row.get(10)?,
                installed_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(servers)
}

#[tauri::command]
pub fn toggle_mcp_server(id: String, enabled: bool, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let status = if enabled { "active" } else { "disabled" };
    conn.execute(
        "UPDATE mcp_servers SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![status, chrono::Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    record_activity(&conn, &id, if enabled { "enable" } else { "disable" }, "success", None);
    Ok(())
}

#[tauri::command]
pub fn install_mcp_server(
    name: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    db: State<'_, DbState>,
) -> Result<McpServer, String> {
    let server_config = config::McpServerConfig {
        command: command.clone(),
        args: args.clone(),
        env: env.clone(),
        transport_type: None,
    };

    config::write_claude_mcp_server(&name, &server_config)?;

    let config_path = dirs::home_dir()
        .map(|h| h.join(".claude").join("settings.json").to_string_lossy().to_string())
        .unwrap_or_default();

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let args_json = serde_json::to_string(&args).unwrap_or_else(|_| "[]".to_string());
    let env_json = serde_json::to_string(&env).unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO mcp_servers (id, name, command, args, env, transport, source, config_path, status, installed_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'stdio', 'local', ?6, 'active', ?7, ?7)",
        rusqlite::params![name, name, command, args_json, env_json, config_path, now],
    ).map_err(|e| e.to_string())?;

    record_activity(&conn, &name, "install", "success", None);

    Ok(McpServer {
        id: name.clone(),
        name,
        package_name: None,
        version: None,
        transport: "stdio".to_string(),
        command: Some(command),
        args: args_json,
        env: env_json,
        status: "active".to_string(),
        source: "local".to_string(),
        config_path: Some(config_path),
        installed_at: Some(now.clone()),
        updated_at: Some(now),
    })
}

#[tauri::command]
pub fn uninstall_mcp_server(name: String, db: State<'_, DbState>) -> Result<(), String> {
    // Get config_path from DB to know which file to edit
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let config_path: Option<String> = conn
        .query_row(
            "SELECT config_path FROM mcp_servers WHERE id = ?1",
            rusqlite::params![name],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(ref path) = config_path {
        config::remove_mcp_server_from_config(&name, path)?;
    } else {
        config::remove_claude_mcp_server(&name)?;
    }

    conn.execute("DELETE FROM mcp_servers WHERE id = ?1", rusqlite::params![name])
        .map_err(|e| e.to_string())?;
    record_activity(&conn, &name, "uninstall", "success", None);
    Ok(())
}

#[tauri::command]
pub fn update_mcp_server_config(
    name: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let server_config = config::McpServerConfig {
        command: command.clone(),
        args: args.clone(),
        env: env.clone(),
        transport_type: None,
    };

    // Get config_path from DB to write back to the correct file
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let config_path: Option<String> = conn
        .query_row(
            "SELECT config_path FROM mcp_servers WHERE id = ?1",
            rusqlite::params![name],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(ref path) = config_path {
        config::write_mcp_server_to_config(&name, &server_config, path)?;
    } else {
        config::write_claude_mcp_server(&name, &server_config)?;
    }

    let now = chrono::Utc::now().to_rfc3339();
    let args_json = serde_json::to_string(&args).unwrap_or_else(|_| "[]".to_string());
    let env_json = serde_json::to_string(&env).unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "UPDATE mcp_servers SET command = ?1, args = ?2, env = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![command, args_json, env_json, now, name],
    ).map_err(|e| e.to_string())?;

    record_activity(&conn, &name, "config_update", "success", None);

    Ok(())
}

#[tauri::command]
pub fn check_mcp_server_health(name: String, db: State<'_, DbState>) -> Result<health::HealthCheckResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let server: McpServer = conn
        .query_row(
            "SELECT id, name, package_name, version, transport, command, args, env, status, source, config_path, installed_at, updated_at FROM mcp_servers WHERE id = ?1",
            rusqlite::params![name],
            |row| {
                Ok(McpServer {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    package_name: row.get(2)?,
                    version: row.get(3)?,
                    transport: row.get(4)?,
                    command: row.get(5)?,
                    args: row.get(6)?,
                    env: row.get(7)?,
                    status: row.get(8)?,
                    source: row.get(9)?,
                    config_path: row.get(10)?,
                    installed_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            },
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let command = server.command.unwrap_or_default();
    Ok(health::check_server_health(&server.id, &server.name, &command, &server.args, &server.env))
}

#[tauri::command]
pub fn check_all_mcp_health(db: State<'_, DbState>) -> Result<Vec<health::HealthCheckResult>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, command, args, env FROM mcp_servers WHERE status != 'disabled'")
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

    drop(stmt);
    drop(conn);

    let results: Vec<health::HealthCheckResult> = servers
        .iter()
        .map(|(id, name, cmd, args, env)| {
            health::check_server_health(id, name, cmd, args, env)
        })
        .collect();

    // Log health check results
    let conn2 = db.0.lock().map_err(|e| e.to_string())?;
    for r in &results {
        let status = if r.status == "healthy" { "success" } else { "error" };
        record_activity(&conn2, &r.server_id, "health_check", status, r.latency_ms.map(|v| v as i64));
    }

    Ok(results)
}

#[tauri::command]
pub fn sync_mcp_server_to_tool(
    server_name: String,
    target_tool: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let (command, args_json, env_json): (String, String, String) = conn
        .query_row(
            "SELECT COALESCE(command,''), args, env FROM mcp_servers WHERE id = ?1",
            rusqlite::params![server_name],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let args: Vec<String> = serde_json::from_str(&args_json).unwrap_or_default();
    let env: std::collections::HashMap<String, String> = serde_json::from_str(&env_json).unwrap_or_default();

    let mcp_config = config::McpServerConfig {
        command: command.clone(),
        args,
        env,
        transport_type: None,
    };

    config::sync_mcp_to_tool(&server_name, &mcp_config, &target_tool)?;
    record_activity(&conn, &server_name, &format!("sync_to_{}", target_tool), "success", None);
    Ok(())
}

#[tauri::command]
pub fn unsync_mcp_server_from_tool(
    server_name: String,
    target_tool: String,
) -> Result<(), String> {
    config::unsync_mcp_from_tool(&server_name, &target_tool)
}

#[tauri::command]
pub fn check_mcp_server_in_tools(
    server_name: String,
) -> std::collections::HashMap<String, bool> {
    let tools = ["claude", "codex", "gemini", "opencode", "openclaw"];
    let mut result = std::collections::HashMap::new();
    for tool in tools {
        result.insert(tool.to_string(), config::check_server_in_tool(&server_name, tool));
    }
    result
}
