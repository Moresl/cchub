use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use toml_edit::DocumentMut;

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

/// Get Claude Code MCP config path (~/.claude.json - the actual MCP storage location)
fn get_claude_mcp_json_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude.json"))
}

/// Get Claude Desktop config path (Windows)
fn get_claude_desktop_config_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("Claude").join("claude_desktop_config.json"))
}

/// Scan all MCP servers from all known locations
pub fn scan_all_mcp_servers() -> Vec<ScannedMcpServer> {
    let mut servers = Vec::new();

    // 1. Scan ~/.claude.json (Claude Code primary MCP config)
    if let Some(claude_mcp) = get_claude_mcp_json_path() {
        if claude_mcp.exists() {
            scan_wrapped_mcp_json(&claude_mcp, "local", &mut servers);
        }
    }

    // 2. Scan ~/.claude/settings.json (Claude Code settings, may also contain mcpServers)
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

    // 4. Scan Codex config.toml
    if let Some(codex_config) = get_codex_config_path() {
        if codex_config.exists() {
            scan_codex_mcp_toml(&codex_config, &mut servers);
        }
    }

    // 6. Scan Gemini settings.json
    if let Some(gemini_config) = get_gemini_config_path() {
        if gemini_config.exists() {
            scan_wrapped_mcp_json(&gemini_config, "gemini", &mut servers);
        }
    }

    // 7. Scan OpenCode opencode.json
    if let Some(opencode_config) = get_opencode_config_path() {
        if opencode_config.exists() {
            scan_wrapped_mcp_json(&opencode_config, "opencode", &mut servers);
        }
    }

    // 8. Scan OpenClaw config.json
    if let Some(openclaw_config) = get_openclaw_config_path() {
        if openclaw_config.exists() {
            scan_wrapped_mcp_json(&openclaw_config, "openclaw", &mut servers);
        }
    }

    // Deduplicate by name (keep first found)
    let mut seen = std::collections::HashSet::new();
    servers.retain(|s| seen.insert(s.name.clone()));

    servers
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

/// Write MCP server config to Claude settings (~/.claude.json)
pub fn write_claude_mcp_server(name: &str, config: &McpServerConfig) -> Result<(), String> {
    // Prefer ~/.claude.json (primary MCP location), fallback to ~/.claude/settings.json
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let claude_json = home.join(".claude.json");
    let path = if claude_json.exists() {
        claude_json
    } else {
        home.join(".claude").join("settings.json")
    };
    write_mcp_server_to_config(name, config, &path.to_string_lossy())
}

/// Remove MCP server from Claude settings
pub fn remove_claude_mcp_server(name: &str) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let claude_json = home.join(".claude.json");
    let path = if claude_json.exists() {
        claude_json
    } else {
        home.join(".claude").join("settings.json")
    };
    remove_mcp_server_from_config(name, &path.to_string_lossy())
}

// ── Tool config paths ──

fn get_codex_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex").join("config.toml"))
}

fn get_gemini_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".gemini").join("settings.json"))
}

fn get_opencode_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".opencode").join("opencode.json"))
}

fn get_openclaw_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".openclaw").join("config.json"))
}

// ── Codex TOML scanning ──

fn scan_codex_mcp_toml(path: &PathBuf, servers: &mut Vec<ScannedMcpServer>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let table: toml::Table = match toml::from_str(&content) {
        Ok(t) => t,
        Err(_) => return,
    };

    let config_path = path.to_string_lossy().to_string();

    // Codex TOML uses [mcp_servers.name] sections
    if let Some(mcp_servers) = table.get("mcp_servers").and_then(|v| v.as_table()) {
        for (name, cfg) in mcp_servers {
            let cfg_table = match cfg.as_table() {
                Some(t) => t,
                None => continue,
            };

            let command = match cfg_table.get("command").and_then(|v| v.as_str()) {
                Some(c) => c.to_string(),
                None => continue,
            };

            let args: Vec<String> = cfg_table
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            let mut env = HashMap::new();
            if let Some(env_table) = cfg_table.get("env").and_then(|v| v.as_table()) {
                for (k, v) in env_table {
                    if let Some(s) = v.as_str() {
                        env.insert(k.clone(), s.to_string());
                    }
                }
            }

            servers.push(ScannedMcpServer {
                name: name.clone(),
                command,
                args,
                env,
                transport: "stdio".to_string(),
                source: "codex".to_string(),
                config_path: config_path.clone(),
            });
        }
    }
}

// ── Write MCP to different tools ──

/// Write MCP server config to Codex config.toml
pub fn write_mcp_to_codex(name: &str, config: &McpServerConfig) -> Result<(), String> {
    let path = get_codex_config_path().ok_or("Cannot find Codex config path")?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = if path.exists() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };

    let mut doc: DocumentMut = content.parse().map_err(|e: toml_edit::TomlError| e.to_string())?;

    // Ensure [mcp_servers] table exists
    if doc.get("mcp_servers").is_none() {
        doc["mcp_servers"] = toml_edit::table();
    }

    if let Some(mcp_servers) = doc["mcp_servers"].as_table_mut() {
        mcp_servers[name] = toml_edit::table();
        if let Some(server_table) = mcp_servers[name].as_table_mut() {
            server_table["command"] = toml_edit::value(&config.command);

            let mut args_arr = toml_edit::Array::new();
            for arg in &config.args {
                args_arr.push(arg.as_str());
            }
            server_table["args"] = toml_edit::value(args_arr);

            if !config.env.is_empty() {
                server_table["env"] = toml_edit::table();
                if let Some(env_table) = server_table["env"].as_table_mut() {
                    for (k, v) in &config.env {
                        env_table[k.as_str()] = toml_edit::value(v.as_str());
                    }
                }
            }
        }
    }

    crate::utils::atomic_write_string(&path, &doc.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write MCP server config to Gemini settings.json
pub fn write_mcp_to_gemini(name: &str, config: &McpServerConfig) -> Result<(), String> {
    let path = get_gemini_config_path().ok_or("Cannot find Gemini config path")?;
    write_mcp_server_to_config(name, config, &path.to_string_lossy())
}

/// Write MCP server config to OpenCode opencode.json
pub fn write_mcp_to_opencode(name: &str, config: &McpServerConfig) -> Result<(), String> {
    let path = get_opencode_config_path().ok_or("Cannot find OpenCode config path")?;
    write_mcp_server_to_config(name, config, &path.to_string_lossy())
}

/// Write MCP server config to OpenClaw config.json
pub fn write_mcp_to_openclaw(name: &str, config: &McpServerConfig) -> Result<(), String> {
    let path = get_openclaw_config_path().ok_or("Cannot find OpenClaw config path")?;
    write_mcp_server_to_config(name, config, &path.to_string_lossy())
}

/// Sync MCP server config to a target tool by tool ID
pub fn sync_mcp_to_tool(name: &str, config: &McpServerConfig, tool_id: &str) -> Result<(), String> {
    match tool_id {
        "claude" => write_claude_mcp_server(name, config),
        "codex" => write_mcp_to_codex(name, config),
        "gemini" => write_mcp_to_gemini(name, config),
        "opencode" => write_mcp_to_opencode(name, config),
        "openclaw" => write_mcp_to_openclaw(name, config),
        _ => Err(format!("Unknown tool: {}", tool_id)),
    }
}

// ── Remove MCP from different tools ──

/// Remove MCP server from Codex config.toml
pub fn remove_mcp_from_codex(name: &str) -> Result<(), String> {
    let path = match get_codex_config_path() {
        Some(p) if p.exists() => p,
        _ => return Ok(()),
    };

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut doc: DocumentMut = content.parse().map_err(|e: toml_edit::TomlError| e.to_string())?;

    if let Some(mcp_servers) = doc.get_mut("mcp_servers").and_then(|v| v.as_table_mut()) {
        mcp_servers.remove(name);
    }

    crate::utils::atomic_write_string(&path, &doc.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove MCP server from Gemini settings.json
pub fn remove_mcp_from_gemini(name: &str) -> Result<(), String> {
    let path = match get_gemini_config_path() {
        Some(p) if p.exists() => p,
        _ => return Ok(()),
    };
    remove_mcp_server_from_config(name, &path.to_string_lossy())
}

/// Remove MCP server from OpenCode opencode.json
pub fn remove_mcp_from_opencode(name: &str) -> Result<(), String> {
    let path = match get_opencode_config_path() {
        Some(p) if p.exists() => p,
        _ => return Ok(()),
    };
    remove_mcp_server_from_config(name, &path.to_string_lossy())
}

/// Remove MCP server from OpenClaw config.json
pub fn remove_mcp_from_openclaw(name: &str) -> Result<(), String> {
    let path = match get_openclaw_config_path() {
        Some(p) if p.exists() => p,
        _ => return Ok(()),
    };
    remove_mcp_server_from_config(name, &path.to_string_lossy())
}

/// Unsync MCP server from a target tool by tool ID
pub fn unsync_mcp_from_tool(name: &str, tool_id: &str) -> Result<(), String> {
    match tool_id {
        "claude" => remove_claude_mcp_server(name),
        "codex" => remove_mcp_from_codex(name),
        "gemini" => remove_mcp_from_gemini(name),
        "opencode" => remove_mcp_from_opencode(name),
        "openclaw" => remove_mcp_from_openclaw(name),
        _ => Err(format!("Unknown tool: {}", tool_id)),
    }
}

// ── Check if MCP server exists in tool config ──

fn check_server_in_json_config(name: &str, path: &std::path::Path) -> bool {
    if !path.exists() { return false; }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let settings: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return false,
    };
    settings.get("mcpServers")
        .and_then(|s| s.as_object())
        .map(|obj| obj.contains_key(name))
        .unwrap_or(false)
}

fn check_server_in_codex(name: &str) -> bool {
    let path = match get_codex_config_path() {
        Some(p) if p.exists() => p,
        _ => return false,
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let doc: DocumentMut = match content.parse() {
        Ok(d) => d,
        Err(_) => return false,
    };
    doc.get("mcp_servers")
        .and_then(|v| v.as_table())
        .map(|t| t.contains_key(name))
        .unwrap_or(false)
}

/// Check if a server exists in a specific tool's config
pub fn check_server_in_tool(name: &str, tool_id: &str) -> bool {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return false,
    };
    match tool_id {
        "claude" => {
            let claude_json = home.join(".claude.json");
            let claude_settings = home.join(".claude").join("settings.json");
            check_server_in_json_config(name, &claude_json)
                || check_server_in_json_config(name, &claude_settings)
        }
        "codex" => check_server_in_codex(name),
        "gemini" => {
            let p = home.join(".gemini").join("settings.json");
            check_server_in_json_config(name, &p)
        }
        "opencode" => {
            let p = home.join(".opencode").join("opencode.json");
            check_server_in_json_config(name, &p)
        }
        "openclaw" => {
            let p = home.join(".openclaw").join("config.json");
            check_server_in_json_config(name, &p)
        }
        _ => false,
    }
}
