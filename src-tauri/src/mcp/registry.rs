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

/// Fetch skills from a GitHub repository by scanning for .md files in common skill directories
pub async fn fetch_skills_from_github_repo(owner: &str, repo: &str, branch: &str) -> Result<Vec<SkillRegistryEntry>, String> {
    let client = reqwest::Client::new();
    let mut all_skills = Vec::new();

    // Try common skill directory patterns
    let search_paths = vec!["", "skills", "src/skills", "claude-skills", "custom-skills"];

    for path in search_paths {
        let api_url = if path.is_empty() {
            format!("https://api.github.com/repos/{}/{}/git/trees/{}?recursive=1", owner, repo, branch)
        } else {
            format!("https://api.github.com/repos/{}/{}/contents/{}?ref={}", owner, repo, path, branch)
        };

        let resp = client.get(&api_url)
            .header("User-Agent", "CCHub")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await;

        let resp = match resp {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };

        let body: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Handle recursive tree response (root path)
        if path.is_empty() {
            if let Some(tree) = body.get("tree").and_then(|t| t.as_array()) {
                for item in tree {
                    let file_path = item.get("path").and_then(|p| p.as_str()).unwrap_or("");
                    if !file_path.ends_with(".md") || file_path.starts_with('.') || file_path.eq_ignore_ascii_case("README.md") || file_path.eq_ignore_ascii_case("CHANGELOG.md") || file_path.eq_ignore_ascii_case("CONTRIBUTING.md") || file_path.eq_ignore_ascii_case("LICENSE.md") {
                        continue;
                    }
                    // Only consider .md files that look like skills (in skills-like dirs or root)
                    let is_skill_dir = file_path.contains("skill") || file_path.contains("prompt") || file_path.contains("agent")
                        || !file_path.contains('/'); // root-level .md files
                    if !is_skill_dir { continue; }

                    let raw_url = format!("https://raw.githubusercontent.com/{}/{}/{}/{}", owner, repo, branch, file_path);
                    if let Ok(content) = fetch_raw_content(&client, &raw_url).await {
                        let name = std::path::Path::new(file_path)
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();

                        let (parsed_name, desc) = parse_skill_frontmatter(&content, &name);

                        all_skills.push(SkillRegistryEntry {
                            id: format!("{}/{}/{}", owner, repo, name),
                            name: parsed_name,
                            description: desc.clone(),
                            description_zh: None,
                            category: guess_category(&desc),
                            author: Some(format!("{}/{}", owner, repo)),
                            github_url: Some(format!("https://github.com/{}/{}", owner, repo)),
                            cover_url: None,
                            tags: vec![],
                            content,
                        });
                    }
                }
                if !all_skills.is_empty() { break; }
            }
            continue;
        }

        // Handle contents API response (specific directory)
        if let Some(files) = body.as_array() {
            for file in files {
                let name = file.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if !name.ends_with(".md") || name.eq_ignore_ascii_case("README.md") {
                    continue;
                }
                let download_url = file.get("download_url").and_then(|u| u.as_str()).unwrap_or("");
                if download_url.is_empty() { continue; }

                if let Ok(content) = fetch_raw_content(&client, download_url).await {
                    let stem = name.trim_end_matches(".md").to_string();
                    let (parsed_name, desc) = parse_skill_frontmatter(&content, &stem);

                    all_skills.push(SkillRegistryEntry {
                        id: format!("{}/{}/{}", owner, repo, stem),
                        name: parsed_name,
                        description: desc.clone(),
                        description_zh: None,
                        category: guess_category(&desc),
                        author: Some(format!("{}/{}", owner, repo)),
                        github_url: Some(format!("https://github.com/{}/{}", owner, repo)),
                        cover_url: None,
                        tags: vec![],
                        content,
                    });
                }
            }
            if !all_skills.is_empty() { break; }
        }
    }

    if all_skills.is_empty() {
        return Err(format!("No skills found in {}/{}", owner, repo));
    }

    Ok(all_skills)
}

async fn fetch_raw_content(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let resp = client.get(url)
        .header("User-Agent", "CCHub")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

/// Parse skill name and description from markdown frontmatter or first heading
fn parse_skill_frontmatter(content: &str, fallback_name: &str) -> (String, String) {
    let mut name = fallback_name.replace('-', " ").replace('_', " ");
    let mut desc = String::new();

    // Try frontmatter (---\nname: xxx\ndescription: xxx\n---)
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let fm = &content[3..3+end];
            for line in fm.lines() {
                let line = line.trim();
                if let Some(v) = line.strip_prefix("name:") {
                    name = v.trim().trim_matches('"').trim_matches('\'').to_string();
                } else if let Some(v) = line.strip_prefix("description:") {
                    desc = v.trim().trim_matches('"').trim_matches('\'').to_string();
                }
            }
        }
    }

    // Fallback: first # heading as name
    if name == fallback_name.replace('-', " ").replace('_', " ") {
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix("# ") {
                name = heading.trim().to_string();
                break;
            }
        }
    }

    // Fallback: first non-empty non-heading line as description
    if desc.is_empty() {
        let skip_fm = if content.starts_with("---") {
            content[3..].find("---").map(|i| 3 + i + 3).unwrap_or(0)
        } else { 0 };
        for line in content[skip_fm..].lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') || trimmed == "---" { continue; }
            desc = if trimmed.len() > 120 { format!("{}...", &trimmed[..117]) } else { trimmed.to_string() };
            break;
        }
    }

    (name, desc)
}

fn guess_category(desc: &str) -> String {
    let d = desc.to_lowercase();
    if d.contains("test") { "testing".to_string() }
    else if d.contains("doc") || d.contains("readme") { "documentation".to_string() }
    else if d.contains("secur") || d.contains("audit") { "security".to_string() }
    else if d.contains("deploy") || d.contains("ci") || d.contains("docker") { "devops".to_string() }
    else if d.contains("api") || d.contains("backend") || d.contains("server") { "backend".to_string() }
    else if d.contains("ai") || d.contains("ml") || d.contains("model") { "ai-ml".to_string() }
    else { "development".to_string() }
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
