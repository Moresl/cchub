use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default, rename = "type")]
    pub transport_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScannedMcpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub transport: String,
    pub source: String,
    pub config_path: String,
}

/// Get the Claude plugins directory
fn get_claude_plugins_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("plugins"))
}

/// Get Claude Code settings.json path
fn get_claude_settings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
}

/// Get Claude Desktop config path (Windows)
fn get_claude_desktop_config_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("Claude").join("claude_desktop_config.json"))
}

/// Scan all MCP servers from all known locations
pub fn scan_all_mcp_servers() -> Vec<ScannedMcpServer> {
    let mut servers = Vec::new();

    // 1. Scan ~/.claude/settings.json (Claude Code main config)
    if let Some(claude_settings) = get_claude_settings_path() {
        if claude_settings.exists() {
            scan_wrapped_mcp_json(&claude_settings, "local", &mut servers);
        }
    }

    // 2. Scan ~/.claude/plugins/**/.mcp.json
    if let Some(plugins_dir) = get_claude_plugins_dir() {
        if plugins_dir.exists() {
            scan_mcp_json_recursive(&plugins_dir, &mut servers);
        }
    }

    // 3. Scan Claude Desktop config
    if let Some(desktop_config) = get_claude_desktop_config_path() {
        if desktop_config.exists() {
            scan_claude_desktop_config(&desktop_config, &mut servers);
        }
    }

    // 4. Scan Cursor config
    if let Some(cursor_config) = get_cursor_config_path() {
        if cursor_config.exists() {
            scan_wrapped_mcp_json(&cursor_config, "cursor", &mut servers);
        }
    }

    // Deduplicate by name (keep first found)
    let mut seen = std::collections::HashSet::new();
    servers.retain(|s| seen.insert(s.name.clone()));

    servers
}

fn get_cursor_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".cursor").join("mcp.json"))
}

/// Recursively scan a directory for .mcp.json files
fn scan_mcp_json_recursive(dir: &PathBuf, servers: &mut Vec<ScannedMcpServer>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().map(|n| n == ".mcp.json").unwrap_or(false) {
            parse_mcp_json_file(&path, servers);
        } else if path.is_dir() {
            let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !dir_name.starts_with('.') || dir_name == ".mcp.json" {
                scan_mcp_json_recursive(&path, servers);
            }
        }
    }
}

/// Parse a .mcp.json file (handles both wrapped and bare formats)
fn parse_mcp_json_file(path: &PathBuf, servers: &mut Vec<ScannedMcpServer>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return,
    };

    let config_path = path.to_string_lossy().to_string();

    // Determine source from path
    let source = if config_path.contains("external_plugins") {
        "official-plugin"
    } else if config_path.contains("plugins") {
        "community-plugin"
    } else {
        "local"
    };

    // Try wrapped format first: { "mcpServers": { ... } }
    if let Some(mcp_servers) = value.get("mcpServers") {
        if let Some(obj) = mcp_servers.as_object() {
            for (name, cfg) in obj {
                if let Some(server) = parse_server_entry(name, cfg, source, &config_path) {
                    servers.push(server);
                }
            }
            return;
        }
    }

    // Try bare format: { "server-name": { "command": "...", "args": [...] } }
    if let Some(obj) = value.as_object() {
        for (name, cfg) in obj {
            // Skip non-server keys
            if name == "mcpServers" || name == "$schema" {
                continue;
            }
            if let Some(server) = parse_server_entry(name, cfg, source, &config_path) {
                servers.push(server);
            }
        }
    }
}

fn parse_server_entry(name: &str, cfg: &serde_json::Value, source: &str, config_path: &str) -> Option<ScannedMcpServer> {
    let command = cfg.get("command").and_then(|v| v.as_str())?.to_string();

    let args: Vec<String> = cfg.get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let env: HashMap<String, String> = cfg.get("env")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let transport = cfg.get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("stdio")
        .to_string();

    Some(ScannedMcpServer {
        name: name.to_string(),
        command,
        args,
        env,
        transport,
        source: source.to_string(),
        config_path: config_path.to_string(),
    })
}

fn scan_wrapped_mcp_json(path: &PathBuf, source: &str, servers: &mut Vec<ScannedMcpServer>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return,
    };

    let config_path = path.to_string_lossy().to_string();

    if let Some(mcp_servers) = value.get("mcpServers") {
        if let Some(obj) = mcp_servers.as_object() {
            for (name, cfg) in obj {
                if let Some(server) = parse_server_entry(name, cfg, source, &config_path) {
                    servers.push(server);
                }
            }
        }
    }
}

fn scan_claude_desktop_config(path: &PathBuf, servers: &mut Vec<ScannedMcpServer>) {
    scan_wrapped_mcp_json(path, "claude-desktop", servers);
}

/// Write MCP server config to a specific config file (writes back to the original source)
pub fn write_mcp_server_to_config(name: &str, config: &McpServerConfig, config_path: &str) -> Result<(), String> {
    let path = PathBuf::from(config_path);

    let mut settings: serde_json::Value = if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if settings.get("mcpServers").is_none() {
        settings["mcpServers"] = serde_json::json!({});
    }
    settings["mcpServers"][name] = serde_json::to_value(config).map_err(|e| e.to_string())?;

    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_string(&path, &content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Remove MCP server from a specific config file
pub fn remove_mcp_server_from_config(name: &str, config_path: &str) -> Result<(), String> {
    let path = PathBuf::from(config_path);

    if !path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut settings: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if let Some(servers) = settings.get_mut("mcpServers") {
        if let Some(obj) = servers.as_object_mut() {
            obj.remove(name);
        }
    }

    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    crate::utils::atomic_write_string(&path, &content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Write MCP server config to Claude settings
pub fn write_claude_mcp_server(name: &str, config: &McpServerConfig) -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".claude")
        .join("settings.json");
    write_mcp_server_to_config(name, config, &path.to_string_lossy())
}

/// Remove MCP server from Claude settings
pub fn remove_claude_mcp_server(name: &str) -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or("Cannot find home directory")?
        .join(".claude")
        .join("settings.json");
    remove_mcp_server_from_config(name, &path.to_string_lossy())
}
