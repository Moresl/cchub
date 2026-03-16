use serde::{Deserialize, Serialize};
use crate::mcp::config;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub install_type: String,
    pub package_name: Option<String>,
    pub github_url: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub env_keys: Vec<String>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillRegistryEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub description_zh: Option<String>,
    pub category: String,
    pub author: Option<String>,
    pub github_url: Option<String>,
    pub cover_url: Option<String>,
    pub tags: Vec<String>,
    pub content: String,
}

pub fn get_curated_registry() -> Vec<RegistryEntry> {
    let json = include_str!("registry_data.json");
    serde_json::from_str(json).unwrap_or_default()
}

pub fn get_skills_registry() -> Vec<SkillRegistryEntry> {
    let json = include_str!("skills_registry_data.json");
    serde_json::from_str(json).unwrap_or_default()
}

pub async fn fetch_custom_source(url: &str) -> Result<Vec<SkillRegistryEntry>, String> {
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch custom source: {}", e))?;

    let entries: Vec<SkillRegistryEntry> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse custom source: {}", e))?;

    Ok(entries)
}

pub async fn search_npm_registry(query: &str) -> Result<Vec<RegistryEntry>, String> {
    let url = format!(
        "https://registry.npmjs.org/-/v1/search?text=mcp+server+{}&size=20",
        query
    );

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch npm: {}", e))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse npm response: {}", e))?;

    let entries = body["objects"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|obj| {
            let pkg = &obj["package"];
            let name = pkg["name"].as_str()?;
            let desc = pkg["description"].as_str().unwrap_or("");

            // Only include packages that look like MCP servers
            if !name.contains("mcp") && !desc.to_lowercase().contains("mcp") {
                return None;
            }

            Some(RegistryEntry {
                id: format!("npm-{}", name),
                name: name.to_string(),
                description: desc.to_string(),
                category: "npm".to_string(),
                install_type: "npm".to_string(),
                package_name: Some(name.to_string()),
                github_url: pkg["links"]["repository"].as_str().map(|s| s.to_string()),
                command: "npx".to_string(),
                args: vec!["-y".to_string(), name.to_string()],
                env_keys: vec![],
                source: "npm-search".to_string(),
            })
        })
        .collect();

    Ok(entries)
}

pub fn install_from_registry(
    name: &str,
    command: &str,
    args: &[String],
    env: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let server_config = config::McpServerConfig {
        command: command.to_string(),
        args: args.to_vec(),
        env: env.clone(),
        transport_type: None,
    };

    config::write_claude_mcp_server(name, &server_config)
}
