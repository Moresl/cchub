use crate::db::models::McpServer;
use crate::db::{DbState, record_activity};
use crate::mcp::registry;
use crate::skills::scanner;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn get_marketplace_entries() -> Result<Vec<registry::RegistryEntry>, String> {
    Ok(registry::get_curated_registry())
}

#[tauri::command]
pub async fn search_marketplace(query: String) -> Result<Vec<registry::RegistryEntry>, String> {
    let mut results = Vec::new();

    // Include matching curated entries
    let curated = registry::get_curated_registry();
    let q = query.to_lowercase();
    for entry in curated {
        if entry.name.to_lowercase().contains(&q)
            || entry.description.to_lowercase().contains(&q)
            || entry.category.to_lowercase().contains(&q)
        {
            results.push(entry);
        }
    }

    // Search npm if query is not empty
    if !query.trim().is_empty() {
        match registry::search_npm_registry(&query).await {
            Ok(npm_results) => {
                let existing_ids: Vec<String> = results.iter().map(|r| r.id.clone()).collect();
                for entry in npm_results {
                    if !existing_ids.contains(&entry.id) {
                        results.push(entry);
                    }
                }
            }
            Err(e) => {
                eprintln!("npm search failed: {}", e);
                // Don't fail the whole search if npm is unreachable
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn install_from_marketplace(
    name: String,
    command: String,
    args: Vec<String>,
    env_values: HashMap<String, String>,
    db: State<'_, DbState>,
) -> Result<McpServer, String> {
    // Write to Claude Code settings.json
    registry::install_from_registry(&name, &command, &args, &env_values)?;

    // Save to DB
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let args_json = serde_json::to_string(&args).unwrap_or_else(|_| "[]".to_string());
    let env_json = serde_json::to_string(&env_values).unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO mcp_servers (id, name, command, args, env, transport, source, status, installed_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'stdio', 'marketplace', 'active', ?6, ?6)",
        rusqlite::params![name, name, command, args_json, env_json, now],
    ).map_err(|e| e.to_string())?;

    record_activity(&conn, &name, "marketplace_install", "success", None);

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
        source: "marketplace".to_string(),
        config_path: dirs::home_dir().map(|h| h.join(".claude").join("settings.json").to_string_lossy().to_string()),
        installed_at: Some(now.clone()),
        updated_at: Some(now),
    })
}

// ── Skills Marketplace ──

#[tauri::command]
pub fn get_skills_marketplace() -> Vec<registry::SkillRegistryEntry> {
    registry::get_skills_registry()
}

#[tauri::command]
pub async fn fetch_custom_skill_source(url: String) -> Result<Vec<registry::SkillRegistryEntry>, String> {
    registry::fetch_custom_source(&url).await
}

#[tauri::command]
pub async fn fetch_skills_from_repo(owner: String, repo: String, branch: String) -> Result<Vec<registry::SkillRegistryEntry>, String> {
    registry::fetch_skills_from_github_repo(&owner, &repo, &branch).await
}

// ── SkillHub API ──

#[tauri::command]
pub async fn get_skillhub_catalog(page: u32, limit: u32, category: String) -> Result<serde_json::Value, String> {
    let (entries, total) = registry::fetch_skillhub_catalog(page, limit, &category).await?;
    Ok(serde_json::json!({
        "skills": entries,
        "total": total,
    }))
}

#[tauri::command]
pub async fn search_skillhub_skills(query: String, limit: u32) -> Result<Vec<registry::SkillRegistryEntry>, String> {
    registry::search_skillhub(query.trim(), limit).await
}

#[tauri::command]
pub async fn get_skillhub_skill_content(slug: String) -> Result<String, String> {
    registry::fetch_skillhub_skill_content(&slug).await
}

#[tauri::command]
pub fn install_skill_from_marketplace(
    name: String,
    content: String,
    target_dir: Option<String>,
    db: State<'_, DbState>,
) -> Result<String, String> {
    let skills_dir = if let Some(dir) = target_dir {
        std::path::PathBuf::from(dir)
    } else {
        scanner::get_skills_dir().ok_or("Cannot find skills directory")?
    };

    // Ensure directory exists
    std::fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    // Sanitize filename
    let safe_name = name.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "-");
    let file_path = skills_dir.join(format!("{}.md", safe_name));

    crate::utils::atomic_write_string(&file_path, &content)
        .map_err(|e| format!("Failed to write skill file: {}", e))?;

    if let Ok(conn) = db.0.lock() {
        record_activity(&conn, &name, "skill_install", "success", None);
    }

    Ok(file_path.to_string_lossy().to_string())
}
