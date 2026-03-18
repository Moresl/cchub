use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;

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
    pub source_type: Option<String>,
    pub source_key: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

fn tool_config_file_name(tool_id: &str) -> Result<&'static str, String> {
    match tool_id {
        "claude" => Ok("settings.json"),
        "codex" => Ok("config.toml"),
        "gemini" => Ok("settings.json"),
        "opencode" => Ok("opencode.json"),
        "openclaw" => Ok("config.json"),
        _ => Err(format!("Unknown tool: {}", tool_id)),
    }
}

fn default_tool_config_dir(home: &std::path::Path, tool_id: &str) -> Result<PathBuf, String> {
    let dir = match tool_id {
        "claude" => ".claude",
        "codex" => ".codex",
        "gemini" => ".gemini",
        "opencode" => ".opencode",
        "openclaw" => ".openclaw",
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

    let custom_config_path: Option<String> = conn
        .query_row(
            "SELECT mcp_config_path FROM custom_paths WHERE tool_id = ?1",
            rusqlite::params![tool_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(path) = custom_config_path.filter(|path| !path.trim().is_empty()) {
        let path = PathBuf::from(path);
        if let Some(parent) = path.parent() {
            return Ok(parent.to_path_buf());
        }
    }

    default_tool_config_dir(&home, tool_id)
}

fn resolve_tool_config_path(conn: &rusqlite::Connection, tool_id: &str) -> Result<PathBuf, String> {
    Ok(resolve_tool_config_dir(conn, tool_id)?.join(tool_config_file_name(tool_id)?))
}

fn candidate_home_dirs() -> Vec<PathBuf> {
    let mut homes = Vec::new();

    if let Some(home) = dirs::home_dir() {
        homes.push(home);
    }

    for key in ["USERPROFILE", "HOME"] {
        if let Ok(value) = std::env::var(key) {
            let path = PathBuf::from(value);
            if !homes.iter().any(|item| item == &path) {
                homes.push(path);
            }
        }
    }

    if let (Ok(drive), Ok(path)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
        let home = PathBuf::from(format!("{}{}", drive, path));
        if !homes.iter().any(|item| item == &home) {
            homes.push(home);
        }
    }

    #[cfg(target_family = "unix")]
    {
        let mnt_root = PathBuf::from("/mnt");
        if mnt_root.exists() {
            if let Ok(drives) = std::fs::read_dir(&mnt_root) {
                for drive in drives.flatten() {
                    let users_dir = drive.path().join("Users");
                    if !users_dir.exists() {
                        continue;
                    }
                    if let Ok(users) = std::fs::read_dir(users_dir) {
                        for user in users.flatten() {
                            let home = user.path();
                            if !homes.iter().any(|item| item == &home) {
                                homes.push(home);
                            }
                        }
                    }
                }
            }
        }
    }

    homes
}

fn compatible_db_paths() -> Vec<PathBuf> {
    let compat_dir = [".cc", "switch"].join("-");
    let compat_db = ["cc", "switch.db"].join("-");

    candidate_home_dirs()
        .into_iter()
        .map(|home| home.join(&compat_dir).join(&compat_db))
        .filter(|path| path.exists())
        .collect()
}

fn current_profile_setting_key(tool_id: &str) -> String {
    format!("current_config_profile:{}", tool_id)
}

fn get_stored_current_profile_ids(conn: &rusqlite::Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings WHERE key LIKE 'current_config_profile:%'")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut current = HashMap::new();
    for row in rows {
        let (key, value) = row.map_err(|e| e.to_string())?;
        if let Some(tool_id) = key.strip_prefix("current_config_profile:") {
            current.insert(tool_id.to_string(), value);
        }
    }

    Ok(current)
}

fn get_compatible_current_profile_ids() -> Result<HashMap<String, String>, String> {
    let mut current = HashMap::new();

    for db_path in compatible_db_paths() {
        let external = rusqlite::Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = external
            .prepare(
                "SELECT id, app_type
                 FROM providers
                 WHERE is_current = 1 AND app_type IN ('claude', 'codex', 'gemini')",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (provider_id, tool_id) = row.map_err(|e| e.to_string())?;
            current.insert(tool_id.clone(), format!("compat-{}-{}", tool_id, provider_id));
        }
    }

    Ok(current)
}

fn normalize_external_profile_snapshot(tool_id: &str, settings_config: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(settings_config).ok()?;

    match tool_id {
        "claude" | "codex" | "gemini" => serde_json::to_string_pretty(&value).ok(),
        _ => None,
    }
}

fn upsert_synced_profile(
    conn: &rusqlite::Connection,
    id: &str,
    name: &str,
    tool_id: &str,
    config_snapshot: &str,
    source_type: &str,
    source_key: Option<&str>,
    now: &str,
) -> Result<(), String> {
    let existing_source_type: Option<String> = conn
        .query_row(
            "SELECT source_type FROM config_profiles WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok();

    if existing_source_type.as_deref() == Some("manual") {
        return Ok(());
    }

    if existing_source_type.is_some() {
        conn.execute(
            "UPDATE config_profiles
             SET name = ?1, tool_id = ?2, config_snapshot = ?3, source_type = ?4, source_key = ?5, updated_at = ?6
             WHERE id = ?7",
            rusqlite::params![name, tool_id, config_snapshot, source_type, source_key, now, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO config_profiles
             (id, name, tool_id, config_snapshot, source_type, source_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            rusqlite::params![id, name, tool_id, config_snapshot, source_type, source_key, now],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn sync_profiles_from_compatible_databases(
    conn: &rusqlite::Connection,
    now: &str,
) -> Result<HashMap<String, usize>, String> {
    let mut counts = HashMap::new();
    let mut seen_ids = std::collections::HashSet::new();

    for db_path in compatible_db_paths() {
        let external = rusqlite::Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| e.to_string())?;

        let mut stmt = external
            .prepare(
                "SELECT id, app_type, name, settings_config
                 FROM providers
                 WHERE app_type IN ('claude', 'codex', 'gemini')
                 ORDER BY app_type, name",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (provider_id, tool_id, name, settings_config) = row.map_err(|e| e.to_string())?;
            let Some(config_snapshot) = normalize_external_profile_snapshot(&tool_id, &settings_config) else {
                continue;
            };
            let id = format!("compat-{}-{}", tool_id, provider_id);
            let source_key = format!("{}#{}", db_path.display(), provider_id);

            upsert_synced_profile(
                conn,
                &id,
                &name,
                &tool_id,
                &config_snapshot,
                "compatible",
                Some(&source_key),
                now,
            )?;

            *counts.entry(tool_id).or_insert(0) += 1;
            seen_ids.insert(id);
        }
    }

    let mut stale_stmt = conn
        .prepare("SELECT id FROM config_profiles WHERE source_type = 'compatible'")
        .map_err(|e| e.to_string())?;
    let stale_ids: Vec<String> = stale_stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .filter(|id: &String| !seen_ids.contains(id))
        .collect();

    for id in stale_ids {
        conn.execute("DELETE FROM config_profiles WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
    }

    Ok(counts)
}

fn sync_live_profiles(
    conn: &rusqlite::Connection,
    imported_counts: &HashMap<String, usize>,
    now: &str,
) -> Result<(), String> {
    for tool_id in ["claude", "codex", "gemini", "opencode", "openclaw"] {
        let id = format!("live-{}", tool_id);

        if imported_counts.get(tool_id).copied().unwrap_or(0) > 0 {
            conn.execute("DELETE FROM config_profiles WHERE id = ?1", rusqlite::params![id])
                .map_err(|e| e.to_string())?;
            continue;
        }

        match read_tool_snapshot(conn, tool_id) {
            Ok(config_snapshot) => {
                let name = format!("{} 当前配置", tool_id);
                upsert_synced_profile(
                    conn,
                    &id,
                    &name,
                    tool_id,
                    &config_snapshot,
                    "live",
                    Some(tool_id),
                    now,
                )?;
            }
            Err(_) => {
                conn.execute("DELETE FROM config_profiles WHERE id = ?1", rusqlite::params![id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

fn config_contents_match(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }

    match (
        serde_json::from_str::<serde_json::Value>(left),
        serde_json::from_str::<serde_json::Value>(right),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => left.trim() == right.trim(),
    }
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
pub fn sync_config_profiles(db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let imported_counts = sync_profiles_from_compatible_databases(&conn, &now)?;
    sync_live_profiles(&conn, &imported_counts, &now)?;
    Ok(())
}

#[tauri::command]
pub fn get_config_profiles(db: State<'_, DbState>) -> Result<Vec<ConfigProfile>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, tool_id, config_snapshot, source_type, source_key, created_at, updated_at FROM config_profiles ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let profiles = stmt
        .query_map([], |row| {
            Ok(ConfigProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                tool_id: row.get(2)?,
                config_snapshot: row.get(3)?,
                source_type: row.get(4)?,
                source_key: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
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
        "INSERT INTO config_profiles (id, name, tool_id, config_snapshot, source_type, source_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'manual', NULL, ?5, ?5)",
        rusqlite::params![id, name, tool_id, config_snapshot, now],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn update_config_profile(
    id: String,
    name: String,
    config_snapshot: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE config_profiles SET name = ?1, config_snapshot = ?2, source_type = 'manual', source_key = NULL, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![name, config_snapshot, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
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

    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![current_profile_setting_key(&tool_id), id],
    ).map_err(|e| e.to_string())?;

    crate::db::record_activity(&conn, &tool_id, "profile_switch", "success", None);
    Ok(())
}

#[tauri::command]
pub fn delete_config_profile(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let tool_id: Option<String> = conn
        .query_row(
            "SELECT tool_id FROM config_profiles WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok();
    conn.execute("DELETE FROM config_profiles WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    if let Some(tool_id) = tool_id {
        let setting_key = current_profile_setting_key(&tool_id);
        let stored_id: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                rusqlite::params![setting_key],
                |row| row.get(0),
            )
            .ok();
        if stored_id.as_deref() == Some(&id) {
            conn.execute("DELETE FROM app_settings WHERE key = ?1", rusqlite::params![setting_key])
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_active_config_profile_ids(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, tool_id, config_snapshot, source_type, source_key, created_at, updated_at FROM config_profiles ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let profiles: Vec<ConfigProfile> = stmt
        .query_map([], |row| {
            Ok(ConfigProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                tool_id: row.get(2)?,
                config_snapshot: row.get(3)?,
                source_type: row.get(4)?,
                source_key: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let mut active_ids = Vec::new();
    let stored_current = get_stored_current_profile_ids(&conn)?;
    let compatible_current = get_compatible_current_profile_ids().unwrap_or_default();
    let mut cache: HashMap<String, Option<String>> = HashMap::new();
    let mut resolved_tools = std::collections::HashSet::new();

    for profile in &profiles {
        if resolved_tools.contains(&profile.tool_id) {
            continue;
        }

        let preferred_id = stored_current
            .get(&profile.tool_id)
            .or_else(|| compatible_current.get(&profile.tool_id));

        if let Some(preferred_id) = preferred_id {
            if profiles.iter().any(|item| item.tool_id == profile.tool_id && item.id == *preferred_id) {
                active_ids.push(preferred_id.clone());
                resolved_tools.insert(profile.tool_id.clone());
            }
        }
    }

    for profile in profiles {
        if resolved_tools.contains(&profile.tool_id) {
            continue;
        }

        if !cache.contains_key(&profile.tool_id) {
            let content = read_tool_snapshot(&conn, &profile.tool_id).ok();
            cache.insert(profile.tool_id.clone(), content);
        }

        if cache
            .get(&profile.tool_id)
            .and_then(|value| value.as_ref())
            .is_some_and(|value| config_contents_match(value, &profile.config_snapshot))
        {
            active_ids.push(profile.id);
            resolved_tools.insert(profile.tool_id.clone());
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

/// Read a tool's current config file content
#[tauri::command]
pub fn read_tool_config(tool_id: String, db: State<'_, DbState>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    read_tool_snapshot(&conn, &tool_id)
}

/// Get Claude Code permissions level (0=strict, 1=standard, 2=relaxed, 3=bypass)
#[tauri::command]
pub fn get_claude_permissions_level() -> Result<u32, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".claude").join("settings.json");
    if !path.exists() { return Ok(0); }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mode = settings.get("permissions")
        .and_then(|p| p.get("defaultMode"))
        .and_then(|m| m.as_str())
        .unwrap_or("");

    if mode == "bypassPermissions" {
        return Ok(3);
    }

    let allow = settings.get("permissions")
        .and_then(|p| p.get("allow"))
        .and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
        .unwrap_or_default();

    if allow.iter().any(|s| *s == "Bash(*)") && allow.iter().any(|s| *s == "Write(*)") {
        Ok(2)
    } else if allow.iter().any(|s| *s == "Read(*)") {
        Ok(1)
    } else {
        Ok(0)
    }
}

/// Set Claude Code permissions level (0=strict, 1=standard, 2=relaxed, 3=bypass)
#[tauri::command]
pub fn set_claude_permissions_level(level: u32) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".claude").join("settings.json");

    let mut settings: serde_json::Value = if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    } else {
        serde_json::json!({})
    };

    let (allow, mode, skip_prompt): (Vec<&str>, &str, bool) = match level {
        0 => (vec![], "normal", false),
        1 => (vec![
            "Read(*)", "Glob(*)", "Grep(*)", "WebSearch(*)",
        ], "normal", false),
        2 => (vec![
            "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
            "WebFetch(*)", "WebSearch(*)", "Agent(*)", "NotebookEdit(*)",
        ], "normal", false),
        3 => (vec![
            "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)",
            "WebFetch(*)", "WebSearch(*)", "Agent(*)", "NotebookEdit(*)",
            "Skill(*)", "mcp__*",
        ], "bypassPermissions", true),
        _ => return Err("Invalid level".to_string()),
    };

    let allow_arr: Vec<serde_json::Value> = allow.iter().map(|s| serde_json::json!(s)).collect();
    settings["permissions"] = serde_json::json!({
        "allow": allow_arr,
        "deny": [],
        "defaultMode": mode,
    });
    settings["skipDangerousModePermissionPrompt"] = serde_json::json!(skip_prompt);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_string(&path, &content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Get Claude Code auto-update channel
#[tauri::command]
pub fn get_claude_auto_update() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".claude").join("settings.json");
    if !path.exists() { return Ok("latest".to_string()); }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(settings.get("autoUpdatesChannel").and_then(|v| v.as_str()).unwrap_or("latest").to_string())
}

/// Set Claude Code auto-update channel
#[tauri::command]
pub fn set_claude_auto_update(channel: String) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".claude").join("settings.json");
    let mut settings: serde_json::Value = if path.exists() {
        let c = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&c).map_err(|e| e.to_string())?
    } else { serde_json::json!({}) };
    if channel == "disabled" {
        settings.as_object_mut().map(|o| o.remove("autoUpdatesChannel"));
    } else {
        settings["autoUpdatesChannel"] = serde_json::json!(channel);
    }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_string(&path, &content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Get Codex CLI settings (approval_mode, reasoning_effort, disable_response_storage)
#[tauri::command]
pub fn get_codex_settings() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".codex").join("config.toml");
    if !path.exists() {
        return Ok(serde_json::json!({ "approval_mode": "suggest", "reasoning_effort": "medium", "disable_response_storage": false }));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc: toml::Value = content.parse().map_err(|e: toml::de::Error| e.to_string())?;

    // Read approval mode from personality or dedicated field
    let personality = doc.get("personality").and_then(|v| v.as_str()).unwrap_or("pragmatic");
    let approval_mode = if personality == "full-auto" { "full-auto" }
        else if personality == "auto-edit" { "auto-edit" }
        else { "suggest" };

    let reasoning = doc.get("model_reasoning_effort").and_then(|v| v.as_str()).unwrap_or("medium");
    let disable_storage = doc.get("disable_response_storage").and_then(|v| v.as_bool()).unwrap_or(false);

    Ok(serde_json::json!({
        "approval_mode": approval_mode,
        "reasoning_effort": reasoning,
        "disable_response_storage": disable_storage,
    }))
}

/// Set a Codex CLI setting
#[tauri::command]
pub fn set_codex_setting(key: String, value: String) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let path = home.join(".codex").join("config.toml");

    let content = if path.exists() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else { String::new() };

    let mut doc: toml_edit::DocumentMut = content.parse().map_err(|e: toml_edit::TomlError| e.to_string())?;

    match key.as_str() {
        "approval_mode" => {
            // Codex doesn't have approval_mode directly, map to personality
            doc["personality"] = toml_edit::value(&value);
        }
        "reasoning_effort" => {
            doc["model_reasoning_effort"] = toml_edit::value(&value);
        }
        "disable_response_storage" => {
            doc["disable_response_storage"] = toml_edit::value(value == "true");
        }
        _ => return Err(format!("Unknown setting: {}", key)),
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    crate::utils::atomic_write_string(&path, &doc.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

// Legacy JSON backup structs (for backward-compatible import)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyBackupData {
    pub version: String,
    pub created_at: String,
    pub sql_dump: String,
    pub tools: HashMap<String, LegacyToolBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyToolBackup {
    pub config_content: Option<String>,
    pub config_path: String,
    pub skills: Vec<LegacySkillFileBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacySkillFileBackup {
    pub name: String,
    pub content: String,
}

/// Escape a string value for SQL: replace ' with ''
fn sql_escape(s: &str) -> String {
    s.replace('\'', "''")
}

/// Generate complete .sql backup content
fn generate_sql_backup(conn: &rusqlite::Connection, home: &std::path::Path) -> String {
    let mut sql = String::new();

    // Header
    sql.push_str("-- ═══════════════════════════════════════════════════════\n");
    sql.push_str("-- CCHub Database Backup (.sql)\n");
    sql.push_str(&format!("-- Version: {}\n", env!("CARGO_PKG_VERSION")));
    sql.push_str(&format!("-- Created: {}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    sql.push_str("-- ═══════════════════════════════════════════════════════\n\n");

    // Schema (CREATE TABLE IF NOT EXISTS)
    sql.push_str("-- ── Schema ──\n\n");
    sql.push_str(&crate::db::schema::get_schema_sql());
    sql.push_str("\n");

    // Backup metadata table
    sql.push_str("CREATE TABLE IF NOT EXISTS _backup_meta (key TEXT PRIMARY KEY, value TEXT);\n");
    sql.push_str(&format!("INSERT OR REPLACE INTO _backup_meta VALUES ('version', '{}');\n", env!("CARGO_PKG_VERSION")));
    sql.push_str(&format!("INSERT OR REPLACE INTO _backup_meta VALUES ('created_at', '{}');\n\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));

    // Tool configs table
    sql.push_str("CREATE TABLE IF NOT EXISTS _tool_configs (tool_id TEXT PRIMARY KEY, config_path TEXT, config_content TEXT);\n");

    // Skill files table
    sql.push_str("CREATE TABLE IF NOT EXISTS _skill_files (id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id TEXT, name TEXT, content TEXT);\n\n");

    // Data dump for all 12 business tables
    sql.push_str("-- ── Data ──\n\n");
    let tables = ["mcp_servers", "plugins", "skills", "hooks", "activity_logs", "mcp_clients",
                   "workspaces", "custom_paths", "config_profiles", "app_settings", "update_history", "metrics"];

    for table in tables {
        let query = format!("SELECT * FROM {}", table);
        if let Ok(mut stmt) = conn.prepare(&query) {
            let col_count = stmt.column_count();
            let col_names: Vec<String> = (0..col_count).map(|i| stmt.column_name(i).unwrap_or("").to_string()).collect();

            let mut has_rows = false;
            if let Ok(rows) = stmt.query_map([], |row| {
                let mut vals = Vec::new();
                for i in 0..col_count {
                    let val: rusqlite::Result<String> = row.get(i);
                    match val {
                        Ok(s) => vals.push(format!("'{}'", sql_escape(&s))),
                        Err(_) => {
                            let int_val: rusqlite::Result<i64> = row.get(i);
                            match int_val {
                                Ok(n) => vals.push(n.to_string()),
                                Err(_) => {
                                    let float_val: rusqlite::Result<f64> = row.get(i);
                                    match float_val {
                                        Ok(f) => vals.push(f.to_string()),
                                        Err(_) => vals.push("NULL".to_string()),
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(vals)
            }) {
                for row in rows.flatten() {
                    if !has_rows {
                        sql.push_str(&format!("-- Table: {}\n", table));
                        has_rows = true;
                    }
                    sql.push_str(&format!("INSERT OR REPLACE INTO {} ({}) VALUES ({});\n",
                        table, col_names.join(", "), row.join(", ")));
                }
            }
            if has_rows {
                sql.push('\n');
            }
        }
    }

    // Tool config files
    sql.push_str("-- ── Tool Configs ──\n\n");
    let tool_configs: Vec<(&str, std::path::PathBuf)> = vec![
        ("claude", home.join(".claude.json")),
        ("claude-settings", home.join(".claude").join("settings.json")),
        ("codex", home.join(".codex").join("config.toml")),
        ("gemini", home.join(".gemini").join("settings.json")),
        ("opencode", home.join(".opencode").join("opencode.json")),
        ("openclaw", home.join(".openclaw").join("config.json")),
    ];

    for (tool_id, config_path) in &tool_configs {
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(config_path) {
                sql.push_str(&format!(
                    "INSERT OR REPLACE INTO _tool_configs VALUES ('{}', '{}', '{}');\n",
                    tool_id,
                    sql_escape(&config_path.to_string_lossy()),
                    sql_escape(&content)
                ));
            }
        }
    }
    sql.push('\n');

    // Skill files
    sql.push_str("-- ── Skill Files ──\n\n");
    for (tool_id, config_path) in &tool_configs {
        let skills_dir = config_path.parent().unwrap_or(home).join("skills");
        if skills_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                            sql.push_str(&format!(
                                "INSERT INTO _skill_files (tool_id, name, content) VALUES ('{}', '{}', '{}');\n",
                                tool_id, sql_escape(&name), sql_escape(&content)
                            ));
                        }
                    }
                }
            }
        }
    }

    sql.push_str("\n-- ── End of Backup ──\n");
    sql
}

/// Export: generate .sql backup file
#[tauri::command]
pub async fn save_backup_to_file(db: State<'_, DbState>) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;

    let sql_content = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        generate_sql_backup(&conn, &home)
    };

    let file = rfd::AsyncFileDialog::new()
        .set_title("导出备份")
        .set_file_name(&format!("cchub-backup-{}.sql", chrono::Local::now().format("%Y%m%d-%H%M%S")))
        .add_filter("SQL Backup", &["sql"])
        .save_file()
        .await;

    match file {
        Some(f) => {
            let path = f.path();
            std::fs::write(path, &sql_content).map_err(|e| e.to_string())?;
            Ok(path.to_string_lossy().to_string())
        }
        None => Err("Cancelled".to_string()),
    }
}

/// Import backup: supports .sql (new) and .json (legacy)
#[tauri::command]
pub async fn import_backup_from_file(db: State<'_, DbState>) -> Result<String, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("导入备份")
        .add_filter("CCHub Backup", &["sql", "json"])
        .pick_file()
        .await;

    let file = file.ok_or("Cancelled")?;
    let file_path = file.path().to_path_buf();
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    let is_json = file_path.extension()
        .map(|ext| ext.to_string_lossy().to_lowercase() == "json")
        .unwrap_or(false);

    if is_json {
        // Legacy JSON import
        return import_legacy_json(&db, &content);
    }

    // .sql import
    let mut restored_count = 0;
    let mut tool_configs_restored = 0;
    let mut skills_restored = 0;

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        // Execute all SQL statements (CREATE TABLE + INSERT)
        // Split by semicolons and execute each statement
        for statement in content.split(";\n") {
            let stmt = statement.trim();
            if stmt.is_empty() || stmt.starts_with("--") {
                continue;
            }
            let stmt_with_semi = format!("{};", stmt);
            if conn.execute_batch(&stmt_with_semi).is_ok() {
                if stmt.starts_with("INSERT") {
                    restored_count += 1;
                }
            }
        }

        // Extract tool configs from _tool_configs table
        if let Ok(mut stmt) = conn.prepare("SELECT tool_id, config_path, config_content FROM _tool_configs") {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            }) {
                let home = dirs::home_dir().ok_or("Cannot find home directory").unwrap();
                for row in rows.flatten() {
                    let (tool_id, _config_path, config_content) = row;
                    let target_path = match tool_id.as_str() {
                        "claude" => home.join(".claude.json"),
                        "claude-settings" => home.join(".claude").join("settings.json"),
                        "codex" => home.join(".codex").join("config.toml"),
                        "gemini" => home.join(".gemini").join("settings.json"),
                        "opencode" => home.join(".opencode").join("opencode.json"),
                        "openclaw" => home.join(".openclaw").join("config.json"),
                        _ => continue,
                    };
                    if let Some(parent) = target_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if crate::utils::atomic_write_string(&target_path, &config_content).is_ok() {
                        tool_configs_restored += 1;
                    }
                }
            }
        }

        // Extract skill files from _skill_files table
        if let Ok(mut stmt) = conn.prepare("SELECT tool_id, name, content FROM _skill_files") {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            }) {
                let home = dirs::home_dir().ok_or("Cannot find home directory").unwrap();
                for row in rows.flatten() {
                    let (tool_id, name, file_content) = row;
                    let base_dir = match tool_id.as_str() {
                        "claude" | "claude-settings" => home.join(".claude"),
                        "codex" => home.join(".codex"),
                        "gemini" => home.join(".gemini"),
                        "opencode" => home.join(".opencode"),
                        "openclaw" => home.join(".openclaw"),
                        _ => continue,
                    };
                    let skills_dir = base_dir.join("skills");
                    let _ = std::fs::create_dir_all(&skills_dir);
                    if crate::utils::atomic_write_string(&skills_dir.join(&name), &file_content).is_ok() {
                        skills_restored += 1;
                    }
                }
            }
        }

        // Clean up temporary backup tables from main DB
        let _ = conn.execute_batch("DROP TABLE IF EXISTS _backup_meta;");
        let _ = conn.execute_batch("DROP TABLE IF EXISTS _tool_configs;");
        let _ = conn.execute_batch("DROP TABLE IF EXISTS _skill_files;");
    }

    Ok(format!("已恢复 {} 条数据记录, {} 个工具配置, {} 个技能文件",
        restored_count - tool_configs_restored - skills_restored - 2, // subtract meta/config/skill inserts
        tool_configs_restored, skills_restored))
}

/// Import legacy .json backup format
fn import_legacy_json(db: &State<'_, DbState>, content: &str) -> Result<String, String> {
    let backup: LegacyBackupData = serde_json::from_str(content).map_err(|e| format!("Invalid backup: {}", e))?;
    let mut restored_count = 0;

    if !backup.sql_dump.is_empty() {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        for line in backup.sql_dump.lines() {
            let line = line.trim();
            if line.starts_with("INSERT") {
                let _ = conn.execute_batch(line);
                restored_count += 1;
            }
        }
    }

    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    for (tool_id, tool_backup) in &backup.tools {
        let config_path = match tool_id.as_str() {
            "claude" => home.join(".claude.json"),
            "claude-settings" => home.join(".claude").join("settings.json"),
            "codex" => home.join(".codex").join("config.toml"),
            "gemini" => home.join(".gemini").join("settings.json"),
            "opencode" => home.join(".opencode").join("opencode.json"),
            "openclaw" => home.join(".openclaw").join("config.json"),
            _ => continue,
        };

        if let Some(config_content) = &tool_backup.config_content {
            if let Some(parent) = config_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = crate::utils::atomic_write_string(&config_path, config_content);
            restored_count += 1;
        }

        if !tool_backup.skills.is_empty() {
            let skills_dir = config_path.parent().unwrap_or(&home).join("skills");
            let _ = std::fs::create_dir_all(&skills_dir);
            for skill in &tool_backup.skills {
                let _ = crate::utils::atomic_write_string(&skills_dir.join(&skill.name), &skill.content);
                restored_count += 1;
            }
        }
    }

    Ok(format!("已从旧版备份恢复 {} 项 ({})", restored_count, backup.created_at))
}
