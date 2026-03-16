use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub package_name: Option<String>,
    pub version: Option<String>,
    pub transport: String,
    pub command: Option<String>,
    pub args: String,
    pub env: String,
    pub status: String,
    pub source: String,
    pub config_path: Option<String>,
    pub installed_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub source_url: Option<String>,
    pub version: Option<String>,
    pub installed_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub plugin_id: Option<String>,
    pub trigger_command: Option<String>,
    pub file_path: Option<String>,
    pub version: Option<String>,
    pub installed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Hook {
    pub id: String,
    pub event: String,
    pub matcher: Option<String>,
    pub command: String,
    pub scope: String,
    pub project_path: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub item_type: String,
    pub item_id: String,
    pub item_name: String,
    pub current_version: String,
    pub latest_version: String,
}
