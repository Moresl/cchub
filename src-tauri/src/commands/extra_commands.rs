use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpClient {
    pub id: String,
    pub name: String,
    pub config_path: String,
    pub server_access: HashMap<String, bool>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityItem {
    pub id: i64,
    pub server_id: String,
    pub server_name: String,
    pub request_type: String,
    pub status: String,
    pub latency_ms: Option<i64>,
    pub recorded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapDay {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub base_path: Option<String>,
    pub is_active: bool,
    pub created_at: Option<String>,
}

// ── MCP Clients ──

#[tauri::command]
pub fn get_mcp_clients(db: State<'_, DbState>) -> Result<Vec<McpClient>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, config_path, server_access, created_at FROM mcp_clients ORDER BY name")
        .map_err(|e| e.to_string())?;

    let clients = stmt
        .query_map([], |row| {
            let access_json: String = row.get(3)?;
            let server_access: HashMap<String, bool> =
                serde_json::from_str(&access_json).unwrap_or_default();
            Ok(McpClient {
                id: row.get(0)?,
                name: row.get(1)?,
                config_path: row.get(2)?,
                server_access,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(clients)
}

#[tauri::command]
pub fn create_mcp_client(
    name: String,
    config_path: Option<String>,
    db: State<'_, DbState>,
) -> Result<McpClient, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = format!("client-{}", chrono::Utc::now().timestamp_millis());
    let now = chrono::Utc::now().to_rfc3339();
    let path = config_path.unwrap_or_default();

    conn.execute(
        "INSERT INTO mcp_clients (id, name, config_path, server_access, created_at) VALUES (?1, ?2, ?3, '{}', ?4)",
        rusqlite::params![id, name, path, now],
    ).map_err(|e| e.to_string())?;

    Ok(McpClient {
        id,
        name,
        config_path: path,
        server_access: HashMap::new(),
        created_at: Some(now),
    })
}

#[tauri::command]
pub fn update_mcp_client_access(
    id: String,
    server_access: HashMap<String, bool>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let access_json = serde_json::to_string(&server_access).unwrap_or_else(|_| "{}".to_string());
    conn.execute(
        "UPDATE mcp_clients SET server_access = ?1 WHERE id = ?2",
        rusqlite::params![access_json, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_mcp_client(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM mcp_clients WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Activity Logs ──

#[tauri::command]
pub fn get_activity_logs(date: String, db: State<'_, DbState>) -> Result<Vec<ActivityItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.server_id, COALESCE(s.name, a.server_id), a.request_type, a.status, a.latency_ms, a.recorded_at
             FROM activity_logs a LEFT JOIN mcp_servers s ON a.server_id = s.id
             WHERE a.recorded_at LIKE ?1
             ORDER BY a.recorded_at DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([format!("{}%", date)], |row| {
            Ok(ActivityItem {
                id: row.get(0)?,
                server_id: row.get(1)?,
                server_name: row.get(2)?,
                request_type: row.get(3)?,
                status: row.get(4)?,
                latency_ms: row.get(5)?,
                recorded_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[tauri::command]
pub fn get_activity_heatmap(days: i64, db: State<'_, DbState>) -> Result<Vec<HeatmapDay>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT substr(recorded_at, 1, 10) as day, COUNT(*) as cnt
             FROM activity_logs
             WHERE recorded_at >= date('now', ?1)
             GROUP BY day ORDER BY day",
        )
        .map_err(|e| e.to_string())?;

    let offset = format!("-{} days", days);
    let heatmap = stmt
        .query_map([offset], |row| {
            Ok(HeatmapDay {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(heatmap)
}

// ── Workspaces ──

#[tauri::command]
pub fn get_workspaces(db: State<'_, DbState>) -> Result<Vec<Workspace>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, base_path, is_active, created_at FROM workspaces ORDER BY name")
        .map_err(|e| e.to_string())?;

    let workspaces = stmt
        .query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                base_path: row.get(3)?,
                is_active: row.get::<_, i32>(4)? == 1,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(workspaces)
}

#[tauri::command]
pub fn create_workspace(
    name: String,
    description: Option<String>,
    base_path: Option<String>,
    db: State<'_, DbState>,
) -> Result<Workspace, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = format!("ws-{}", chrono::Utc::now().timestamp_millis());
    let now = chrono::Utc::now().to_rfc3339();

    // Check if any workspaces exist, if not make this one active
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
        .unwrap_or(0);
    let is_active = count == 0;

    conn.execute(
        "INSERT INTO workspaces (id, name, description, base_path, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, name, description, base_path, is_active as i32, now],
    ).map_err(|e| e.to_string())?;

    Ok(Workspace {
        id,
        name,
        description,
        base_path,
        is_active,
        created_at: Some(now),
    })
}

#[tauri::command]
pub fn switch_workspace(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE workspaces SET is_active = 0", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE workspaces SET is_active = 1 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_workspace(
    id: String,
    name: String,
    description: Option<String>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE workspaces SET name = ?1, description = ?2 WHERE id = ?3",
        rusqlite::params![name, description, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_workspace(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // Cannot delete active workspace
    let is_active: i32 = conn
        .query_row(
            "SELECT is_active FROM workspaces WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if is_active == 1 {
        return Err("Cannot delete active workspace".to_string());
    }

    conn.execute("DELETE FROM workspaces WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Custom Paths ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomPath {
    pub tool_id: String,
    pub config_dir: Option<String>,
    pub mcp_config_path: Option<String>,
    pub skills_dir: Option<String>,
}

#[tauri::command]
pub fn get_custom_paths(db: State<'_, DbState>) -> Result<Vec<CustomPath>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT tool_id, config_dir, mcp_config_path, skills_dir FROM custom_paths")
        .map_err(|e| e.to_string())?;

    let paths = stmt
        .query_map([], |row| {
            Ok(CustomPath {
                tool_id: row.get(0)?,
                config_dir: row.get(1)?,
                mcp_config_path: row.get(2)?,
                skills_dir: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(paths)
}

#[tauri::command]
pub fn save_custom_path(
    tool_id: String,
    config_dir: Option<String>,
    mcp_config_path: Option<String>,
    skills_dir: Option<String>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO custom_paths (tool_id, config_dir, mcp_config_path, skills_dir) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![tool_id, config_dir, mcp_config_path, skills_dir],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_custom_path(tool_id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM custom_paths WHERE tool_id = ?1", rusqlite::params![tool_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Config Profiles ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub tool_id: String,
    pub config_snapshot: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

fn tool_config_file_name(tool_id: &str) -> Result<&'static str, String> {
    match tool_id {
        "claude" => Ok("settings.json"),
        "codex" => Ok("config.toml"),
        "gemini" => Ok("settings.json"),
        "cursor" => Ok("mcp.json"),
        "windsurf" => Ok("mcp.json"),
        "opencode" => Ok("opencode.json"),
        _ => Err(format!("Unknown tool: {}", tool_id)),
    }
}

fn default_tool_config_dir(home: &std::path::Path, tool_id: &str) -> Result<PathBuf, String> {
    let dir = match tool_id {
        "claude" => ".claude",
        "codex" => ".codex",
        "gemini" => ".gemini",
        "cursor" => ".cursor",
        "windsurf" => ".windsurf",
        "opencode" => ".opencode",
        _ => return Err(format!("Unknown tool: {}", tool_id)),
    };
    Ok(home.join(dir))
}

fn resolve_tool_config_dir(conn: &rusqlite::Connection, tool_id: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;

    let custom_dir: Option<String> = conn
        .query_row(
            "SELECT config_dir FROM custom_paths WHERE tool_id = ?1",
            rusqlite::params![tool_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(dir) = custom_dir.filter(|dir| !dir.trim().is_empty()) {
        return Ok(PathBuf::from(dir));
    }

    default_tool_config_dir(&home, tool_id)
}

fn resolve_tool_config_path(conn: &rusqlite::Connection, tool_id: &str) -> Result<PathBuf, String> {
    Ok(resolve_tool_config_dir(conn, tool_id)?.join(tool_config_file_name(tool_id)?))
}

fn read_tool_snapshot(conn: &rusqlite::Connection, tool_id: &str) -> Result<String, String> {
    match tool_id {
        "codex" => {
            let dir = resolve_tool_config_dir(conn, tool_id)?;
            let auth_path = dir.join("auth.json");
            if !auth_path.exists() {
                return Err(format!("Config file not found: {}", auth_path.display()));
            }
            let auth: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(&auth_path).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let config_path = dir.join("config.toml");
            let config = if config_path.exists() {
                std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?
            } else {
                String::new()
            };
            serde_json::to_string_pretty(&serde_json::json!({
                "auth": auth,
                "config": config,
            }))
            .map_err(|e| e.to_string())
        }
        "gemini" => {
            let dir = resolve_tool_config_dir(conn, tool_id)?;
            let env_path = dir.join(".env");
            if !env_path.exists() {
                return Err(format!("Config file not found: {}", env_path.display()));
            }
            let env_text = std::fs::read_to_string(&env_path).map_err(|e| e.to_string())?;
            let env: HashMap<String, String> = env_text.lines()
                .filter(|l| !l.trim().is_empty() && !l.trim().starts_with('#'))
                .filter_map(|l| l.split_once('=').map(|(k,v)| (k.trim().to_string(), v.trim().to_string())))
                .collect();
            let settings_path = dir.join("settings.json");
            let config = if settings_path.exists() {
                serde_json::from_str::<serde_json::Value>(
                    &std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?
            } else {
                serde_json::json!({})
            };
            serde_json::to_string_pretty(&serde_json::json!({
                "env": env,
                "config": config,
            }))
            .map_err(|e| e.to_string())
        }
        "claude" => {
            let home = dirs::home_dir().ok_or("Cannot find home directory")?;
            let claude_json = home.join(".claude.json");
            let settings_json = home.join(".claude").join("settings.json");
            let mut combined = serde_json::Map::new();
            if claude_json.exists() {
                if let Ok(content) = std::fs::read_to_string(&claude_json) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(obj) = val.as_object() {
                            for (k, v) in obj { combined.insert(k.clone(), v.clone()); }
                        }
                    }
                }
            }
            if settings_json.exists() {
                if let Ok(content) = std::fs::read_to_string(&settings_json) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(obj) = val.as_object() {
                            for (k, v) in obj {
                                if !combined.contains_key(k) { combined.insert(k.clone(), v.clone()); }
                            }
                        }
                    }
                }
            }
            if combined.is_empty() {
                return Err("No Claude config found".to_string());
            }
            serde_json::to_string_pretty(&serde_json::Value::Object(combined)).map_err(|e| e.to_string())
        }
        _ => {
            let config_path = resolve_tool_config_path(conn, tool_id)?;
            if !config_path.exists() {
                return Err(format!("Config file not found: {}", config_path.display()));
            }
            std::fs::read_to_string(&config_path).map_err(|e| e.to_string())
        }
    }
}

fn apply_tool_snapshot(conn: &rusqlite::Connection, tool_id: &str, snapshot: &str) -> Result<(), String> {
    match tool_id {
        "codex" => {
            let dir = resolve_tool_config_dir(conn, tool_id)?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let auth_path = dir.join("auth.json");
            let config_path = dir.join("config.toml");

            if let Ok(value) = serde_json::from_str::<serde_json::Value>(snapshot) {
                if let (Some(auth), Some(config)) = (value.get("auth"), value.get("config").and_then(|v| v.as_str())) {
                    let auth_text = serde_json::to_string_pretty(auth).map_err(|e| e.to_string())?;
                    crate::utils::atomic_write_string(&auth_path, &auth_text).map_err(|e| e.to_string())?;
                    crate::utils::atomic_write_string(&config_path, config).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }

            crate::utils::atomic_write_string(&config_path, snapshot).map_err(|e| e.to_string())
        }
        "gemini" => {
            let dir = resolve_tool_config_dir(conn, tool_id)?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let env_path = dir.join(".env");
            let settings_path = dir.join("settings.json");

            if let Ok(value) = serde_json::from_str::<serde_json::Value>(snapshot) {
                if let (Some(env), Some(config)) = (value.get("env").and_then(|v| v.as_object()), value.get("config")) {
                    let env_map: std::collections::HashMap<String, String> = env
                        .iter()
                        .filter_map(|(key, value)| value.as_str().map(|v| (key.clone(), v.to_string())))
                        .collect();
                    let env_text = env_map.iter()
                        .map(|(k, v)| format!("{}={}", k, v))
                        .collect::<Vec<_>>()
                        .join("\n");
                    let config_text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
                    crate::utils::atomic_write_string(&env_path, &env_text).map_err(|e| e.to_string())?;
                    crate::utils::atomic_write_string(&settings_path, &config_text).map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }

            crate::utils::atomic_write_string(&settings_path, snapshot).map_err(|e| e.to_string())
        }
        _ => {
            let config_path = resolve_tool_config_path(conn, tool_id)?;
            if let Some(parent) = config_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            crate::utils::atomic_write_string(&config_path, snapshot).map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub fn get_config_profiles(db: State<'_, DbState>) -> Result<Vec<ConfigProfile>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, tool_id, config_snapshot, created_at, updated_at FROM config_profiles ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let profiles = stmt
        .query_map([], |row| {
            Ok(ConfigProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                tool_id: row.get(2)?,
                config_snapshot: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(profiles)
}

#[tauri::command]
pub fn save_config_profile(
    name: String,
    tool_id: String,
    config_snapshot: String,
    db: State<'_, DbState>,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO config_profiles (id, name, tool_id, config_snapshot, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![id, name, tool_id, config_snapshot, now],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn apply_config_profile(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let (tool_id, snapshot): (String, String) = conn
        .query_row(
            "SELECT tool_id, config_snapshot FROM config_profiles WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Profile not found: {}", e))?;

    apply_tool_snapshot(&conn, &tool_id, &snapshot)?;

    // Update timestamp
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE config_profiles SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    ).map_err(|e| e.to_string())?;

    crate::db::record_activity(&conn, &tool_id, "profile_switch", "success", None);
    Ok(())
}

#[tauri::command]
pub fn delete_config_profile(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM config_profiles WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_active_config_profile_ids(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, tool_id, config_snapshot, created_at, updated_at FROM config_profiles ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let profiles: Vec<ConfigProfile> = stmt
        .query_map([], |row| {
            Ok(ConfigProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                tool_id: row.get(2)?,
                config_snapshot: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let mut active_ids = Vec::new();
    let mut cache: HashMap<String, Option<String>> = HashMap::new();

    for profile in profiles {
        if !cache.contains_key(&profile.tool_id) {
            let content = read_tool_snapshot(&conn, &profile.tool_id).ok();
            cache.insert(profile.tool_id.clone(), content);
        }

        if cache.get(&profile.tool_id).and_then(|value| value.as_ref()) == Some(&profile.config_snapshot) {
            active_ids.push(profile.id);
        }
    }

    Ok(active_ids)
}

// ── Proxy Settings ──

/// Set HTTP/HTTPS proxy for all network requests (persisted to database)
#[tauri::command]
pub fn set_proxy(proxy_url: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    if proxy_url.trim().is_empty() {
        std::env::remove_var("HTTP_PROXY");
        std::env::remove_var("HTTPS_PROXY");
        std::env::remove_var("http_proxy");
        std::env::remove_var("https_proxy");
        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('proxy_url', '')", [])
            .map_err(|e| e.to_string())?;
    } else {
        let url = proxy_url.trim().to_string();
        std::env::set_var("HTTP_PROXY", &url);
        std::env::set_var("HTTPS_PROXY", &url);
        std::env::set_var("http_proxy", &url);
        std::env::set_var("https_proxy", &url);
        conn.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('proxy_url', ?1)", rusqlite::params![url])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Get current proxy setting
#[tauri::command]
pub fn get_proxy(db: State<'_, DbState>) -> String {
    // Read from database first (persisted), fallback to env
    if let Ok(conn) = db.0.lock() {
        if let Ok(proxy) = conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'proxy_url'",
            [],
            |row| row.get::<_, String>(0),
        ) {
            if !proxy.is_empty() {
                return proxy;
            }
        }
    }
    std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("https_proxy"))
        .unwrap_or_default()
}

/// Open a native folder picker dialog and return the selected path
#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Select folder")
        .pick_folder()
        .await;
    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

/// Open a native file picker dialog and return the selected path
#[tauri::command]
pub async fn pick_file() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Select file")
        .add_filter("Config", &["json", "toml", "yaml", "yml"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().to_string()))
}

/// Read a tool's current config file content (for saving as profile snapshot)
#[tauri::command]
pub fn read_tool_config(tool_id: String, db: State<'_, DbState>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    read_tool_snapshot(&conn, &tool_id)
}

// ── Backup / Export / Import ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub version: String,
    pub created_at: String,
    pub tools: HashMap<String, ToolBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolBackup {
    pub config_content: Option<String>,
    pub config_path: String,
    pub skills: Vec<SkillFileBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFileBackup {
    pub name: String,
    pub content: String,
}

/// Generate SQL dump from database
fn generate_sql_dump(conn: &rusqlite::Connection) -> String {
    let mut sql_dump = String::new();
    sql_dump.push_str("-- CCHub Database Backup\n");
    sql_dump.push_str(&format!("-- Created: {}\n\n", chrono::Utc::now().to_rfc3339()));

    let tables = ["mcp_servers", "plugins", "skills", "hooks", "activity_logs", "mcp_clients",
                   "workspaces", "custom_paths", "config_profiles", "app_settings", "update_history", "metrics"];
    for table in tables {
        let query = format!("SELECT * FROM {}", table);
        if let Ok(mut stmt) = conn.prepare(&query) {
            let col_count = stmt.column_count();
            let col_names: Vec<String> = (0..col_count).map(|i| stmt.column_name(i).unwrap_or("").to_string()).collect();

            if let Ok(rows) = stmt.query_map([], |row| {
                let mut vals = Vec::new();
                for i in 0..col_count {
                    let val: rusqlite::Result<String> = row.get(i);
                    match val {
                        Ok(s) => vals.push(format!("'{}'", s.replace('\'', "''"))),
                        Err(_) => {
                            let int_val: rusqlite::Result<i64> = row.get(i);
                            match int_val {
                                Ok(n) => vals.push(n.to_string()),
                                Err(_) => vals.push("NULL".to_string()),
                            }
                        }
                    }
                }
                Ok(vals)
            }) {
                for row in rows.flatten() {
                    sql_dump.push_str(&format!("INSERT OR REPLACE INTO {} ({}) VALUES ({});\n",
                        table, col_names.join(", "), row.join(", ")));
                }
            }
        }
    }
    sql_dump
}

/// Export: database SQL dump + tool config files
#[tauri::command]
pub async fn save_backup_to_file(db: State<'_, DbState>) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;

    // 1. SQL dump
    let sql_dump = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        generate_sql_dump(&conn)
    };

    // 2. Collect tool config files
    let mut tools_backup: HashMap<String, ToolBackup> = HashMap::new();
    let tool_configs: Vec<(&str, std::path::PathBuf, &str)> = vec![
        ("claude", home.join(".claude.json"), "skills"),
        ("claude-settings", home.join(".claude").join("settings.json"), "skills"),
        ("codex", home.join(".codex").join("config.toml"), "skills"),
        ("gemini", home.join(".gemini").join("settings.json"), "skills"),
        ("cursor", home.join(".cursor").join("mcp.json"), "skills"),
        ("windsurf", home.join(".windsurf").join("mcp.json"), "skills"),
        ("opencode", home.join(".opencode").join("opencode.json"), "skills"),
    ];

    for (tool_id, config_path, skills_subdir) in tool_configs {
        let config_content = if config_path.exists() {
            std::fs::read_to_string(&config_path).ok()
        } else { None };

        let mut skill_files = Vec::new();
        let skills_dir = config_path.parent().unwrap_or(&home).join(skills_subdir);
        if skills_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                            skill_files.push(SkillFileBackup { name, content });
                        }
                    }
                }
            }
        }

        if config_content.is_some() || !skill_files.is_empty() {
            tools_backup.insert(tool_id.to_string(), ToolBackup {
                config_content,
                config_path: config_path.to_string_lossy().to_string(),
                skills: skill_files,
            });
        }
    }

    // 3. Combine into backup
    let backup = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "created_at": chrono::Utc::now().to_rfc3339(),
        "sql_dump": sql_dump,
        "tools": tools_backup,
    });
    let backup_json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;

    // 4. Save file dialog
    let file = rfd::AsyncFileDialog::new()
        .set_title("Save Backup")
        .set_file_name(&format!("cchub-backup-{}.json", chrono::Local::now().format("%Y%m%d-%H%M%S")))
        .add_filter("CCHub Backup", &["json"])
        .save_file()
        .await;

    match file {
        Some(f) => {
            let path = f.path();
            std::fs::write(path, &backup_json).map_err(|e| e.to_string())?;
            Ok(path.to_string_lossy().to_string())
        }
        None => Err("Cancelled".to_string()),
    }
}

/// Import backup: restore database + tool configs
#[tauri::command]
pub async fn import_backup_from_file(db: State<'_, DbState>) -> Result<String, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Import Backup")
        .add_filter("CCHub Backup", &["json"])
        .pick_file()
        .await;

    let file = file.ok_or("Cancelled")?;
    let content = std::fs::read_to_string(file.path()).map_err(|e| e.to_string())?;
    let backup: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("Invalid backup: {}", e))?;

    let mut restored_count = 0;

    // 1. Restore SQL dump
    if let Some(sql_dump) = backup.get("sql_dump").and_then(|v| v.as_str()) {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        for line in sql_dump.lines() {
            let line = line.trim();
            if line.starts_with("INSERT") {
                let _ = conn.execute_batch(line);
                restored_count += 1;
            }
        }
    }

    // 2. Restore tool configs
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    if let Some(tools) = backup.get("tools").and_then(|v| v.as_object()) {
        for (tool_id, tool_backup) in tools {
            let config_path = match tool_id.as_str() {
                "claude" => home.join(".claude.json"),
                "claude-settings" => home.join(".claude").join("settings.json"),
                "codex" => home.join(".codex").join("config.toml"),
                "gemini" => home.join(".gemini").join("settings.json"),
                "cursor" => home.join(".cursor").join("mcp.json"),
                "windsurf" => home.join(".windsurf").join("mcp.json"),
                "opencode" => home.join(".opencode").join("opencode.json"),
                _ => continue,
            };

            if let Some(config_content) = tool_backup.get("config_content").and_then(|v| v.as_str()) {
                if let Some(parent) = config_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = crate::utils::atomic_write_string(&config_path, config_content);
                restored_count += 1;
            }

            if let Some(skills) = tool_backup.get("skills").and_then(|v| v.as_array()) {
                let skills_dir = config_path.parent().unwrap_or(&home).join("skills");
                let _ = std::fs::create_dir_all(&skills_dir);
                for skill in skills {
                    if let (Some(name), Some(content)) = (
                        skill.get("name").and_then(|v| v.as_str()),
                        skill.get("content").and_then(|v| v.as_str()),
                    ) {
                        let _ = crate::utils::atomic_write_string(&skills_dir.join(name), content);
                        restored_count += 1;
                    }
                }
            }
        }
    }

    let created = backup.get("created_at").and_then(|v| v.as_str()).unwrap_or("unknown");
    Ok(format!("Restored {} items from backup ({})", restored_count, created))
}
