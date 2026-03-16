use serde::{Deserialize, Serialize};
use crate::mcp::config;

/// Build an HTTP client that respects proxy settings (env vars + system proxy)
fn build_http_client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent("CCHub")
        .timeout(std::time::Duration::from_secs(30));

    // Check for proxy from env vars (set by our set_proxy command)
    let proxy_url = std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("https_proxy"))
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .or_else(|_| std::env::var("http_proxy"))
        .ok();

    if let Some(ref url) = proxy_url {
        if !url.trim().is_empty() {
            match reqwest::Proxy::all(url) {
                Ok(proxy) => { builder = builder.proxy(proxy); }
                Err(e) => { eprintln!("Invalid proxy URL '{}': {}", url, e); }
            }
        }
    }

    builder.build().map_err(|e| format!("Failed to build HTTP client: {}", e))
}

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

// ── SkillHub API Integration ──

/// Fetch skills from the SkillHub catalog API (https://www.skillhub.club)
pub async fn fetch_skillhub_catalog(page: u32, limit: u32, category: &str) -> Result<(Vec<SkillRegistryEntry>, usize), String> {
    let client = build_http_client()?;

    let mut url = format!("https://www.skillhub.club/api/v1/desktop/catalog?page={}&limit={}", page, limit);
    if !category.is_empty() && category != "all" {
        url.push_str(&format!("&category={}", category));
    }

    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub API error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("SkillHub API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

    let total = body.get("total").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let skills_arr = body.get("skills").and_then(|v| v.as_array());

    let mut entries = Vec::new();
    if let Some(skills) = skills_arr {
        for skill in skills {
            let id = skill.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = skill.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let description = skill.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let description_zh = skill.get("description_zh").and_then(|v| v.as_str()).map(String::from);
            let category = skill.get("category").and_then(|v| v.as_str()).unwrap_or("development").to_string();
            let author = skill.get("author").and_then(|v| v.as_str()).map(String::from);
            let repo_url = skill.get("repo_url").and_then(|v| v.as_str()).map(String::from);
            let slug = skill.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let stars = skill.get("github_stars").and_then(|v| v.as_i64()).unwrap_or(0);

            entries.push(SkillRegistryEntry {
                id: if id.is_empty() { slug.clone() } else { id },
                name,
                description,
                description_zh,
                category,
                author,
                github_url: repo_url,
                cover_url: None,
                tags: if stars > 0 { vec![format!("{}stars", stars)] } else { vec![] },
                content: slug, // Store slug for later fetching full content
            });
        }
    }

    Ok((entries, total))
}

/// Search skills via SkillHub API
pub async fn search_skillhub(query: &str, limit: u32) -> Result<Vec<SkillRegistryEntry>, String> {
    let client = build_http_client()?;

    let url = format!("https://www.skillhub.club/api/v1/desktop/search?q={}&limit={}", urlencoding::encode(query), limit);
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub search error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("SkillHub search returned {}", resp.status()));
    }

    let skills: Vec<serde_json::Value> = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

    let mut entries = Vec::new();
    for skill in skills {
        let name = skill.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let slug = skill.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let description = skill.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let category = skill.get("category").and_then(|v| v.as_str()).unwrap_or("development").to_string();
        let author = skill.get("author").and_then(|v| v.as_str()).map(String::from);
        let repo_url = skill.get("repo_url").and_then(|v| v.as_str()).map(String::from);

        entries.push(SkillRegistryEntry {
            id: slug.clone(),
            name,
            description,
            description_zh: None,
            category,
            author,
            github_url: repo_url,
            cover_url: None,
            tags: vec![],
            content: slug,
        });
    }

    Ok(entries)
}

/// Get full skill content from SkillHub API
pub async fn fetch_skillhub_skill_content(slug: &str) -> Result<String, String> {
    let client = build_http_client()?;
    let url = format!("https://www.skillhub.club/api/v1/desktop/skills/{}", slug);
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub detail error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("SkillHub detail returned {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
    let skill_md = body.get("skill")
        .and_then(|s| s.get("skill_md_raw"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if skill_md.is_empty() {
        return Err("No skill content available".to_string());
    }

    Ok(skill_md)
}

pub async fn fetch_custom_source(url: &str) -> Result<Vec<SkillRegistryEntry>, String> {
    let client = build_http_client()?;
    let resp = client.get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch custom source: {}", e))?;

    let entries: Vec<SkillRegistryEntry> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse custom source: {}", e))?;

    Ok(entries)
}

/// Fetch skills from a GitHub repository by downloading ZIP and scanning for SKILL.md files
pub async fn fetch_skills_from_github_repo(owner: &str, repo: &str, branch: &str) -> Result<Vec<SkillRegistryEntry>, String> {
    let client = build_http_client()?;
    let mut all_skills = Vec::new();

    // Try branches in order: specified branch, main, master
    let mut branches = Vec::new();
    if !branch.is_empty() && branch != "HEAD" {
        branches.push(branch.to_string());
    }
    if !branches.iter().any(|b| b == "main") { branches.push("main".to_string()); }
    if !branches.iter().any(|b| b == "master") { branches.push("master".to_string()); }

    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let mut download_ok = false;
    let mut resolved_branch = branch.to_string();
    for b in &branches {
        let url = format!("https://github.com/{}/{}/archive/refs/heads/{}.zip", owner, repo, b);
        match download_and_extract_zip(&client, &url, temp_dir.path()).await {
            Ok(_) => { download_ok = true; resolved_branch = b.clone(); break; }
            Err(_) => continue,
        }
    }

    if !download_ok {
        return Err(format!("Failed to download {}/{} (tried branches: {:?})", owner, repo, branches));
    }

    // Recursively scan for SKILL.md files
    scan_skills_recursive(temp_dir.path(), temp_dir.path(), owner, repo, &resolved_branch, &mut all_skills);

    // If no SKILL.md found, fall back to scanning .md files
    if all_skills.is_empty() {
        scan_md_files_recursive(temp_dir.path(), temp_dir.path(), owner, repo, &resolved_branch, &mut all_skills);
    }

    if all_skills.is_empty() {
        return Err(format!("No skills found in {}/{}", owner, repo));
    }

    Ok(all_skills)
}

async fn download_and_extract_zip(client: &reqwest::Client, url: &str, dest: &std::path::Path) -> Result<(), String> {
    let response = client.get(url)
        .send().await.map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("ZIP error: {}", e))?;

    // Find root directory name in ZIP (e.g., "repo-main/")
    let root_name = if !archive.is_empty() {
        let first = archive.by_index(0).map_err(|e| e.to_string())?;
        let name = first.name().to_string();
        name.split('/').next().unwrap_or("").to_string()
    } else {
        String::new()
    };

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        // Strip root directory prefix
        let relative = if !root_name.is_empty() && name.starts_with(&root_name) {
            name[root_name.len()..].trim_start_matches('/')
        } else {
            &name
        };

        if relative.is_empty() { continue; }

        let out_path = dest.join(relative);

        // Security: skip paths with ..
        if relative.contains("..") { continue; }

        if file.is_dir() {
            let _ = std::fs::create_dir_all(&out_path);
        } else {
            if let Some(parent) = out_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let mut outfile = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Recursively scan for directories containing SKILL.md
fn scan_skills_recursive(
    current: &std::path::Path,
    base: &std::path::Path,
    owner: &str,
    repo: &str,
    branch: &str,
    skills: &mut Vec<SkillRegistryEntry>,
) {
    let skill_md = current.join("SKILL.md");
    if skill_md.exists() {
        if let Ok(content) = std::fs::read_to_string(&skill_md) {
            let dir_name = current.strip_prefix(base)
                .unwrap_or(current)
                .to_string_lossy()
                .to_string();

            let (name, desc) = parse_skill_frontmatter(&content, &dir_name.replace('\\', "/").split('/').last().unwrap_or(&dir_name));

            // Read all .md files in this skill directory as the content
            let mut full_content = content.clone();
            for entry in std::fs::read_dir(current).into_iter().flatten().flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map(|e| e == "md").unwrap_or(false) && path.file_name().map(|n| n != "SKILL.md").unwrap_or(false) {
                    if let Ok(extra) = std::fs::read_to_string(&path) {
                        full_content.push_str("\n\n---\n\n");
                        full_content.push_str(&extra);
                    }
                }
            }

            skills.push(SkillRegistryEntry {
                id: format!("{}/{}:{}", owner, repo, dir_name),
                name,
                description: desc.clone(),
                description_zh: None,
                category: guess_category(&desc),
                author: Some(format!("{}/{}", owner, repo)),
                github_url: Some(format!("https://github.com/{}/{}/tree/{}/{}", owner, repo, branch, dir_name)),
                cover_url: None,
                tags: vec![],
                content: full_content,
            });
        }
        return; // Don't recurse into skill subdirectories
    }

    // Recurse into subdirectories
    let entries = match std::fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            // Skip hidden dirs and common non-skill dirs
            if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target" {
                continue;
            }
            scan_skills_recursive(&path, base, owner, repo, branch, skills);
        }
    }
}

/// Fallback: scan for individual .md files when no SKILL.md found
fn scan_md_files_recursive(
    current: &std::path::Path,
    base: &std::path::Path,
    owner: &str,
    repo: &str,
    branch: &str,
    skills: &mut Vec<SkillRegistryEntry>,
) {
    let entries = match std::fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if !name.starts_with('.') && name != "node_modules" && name != "__pycache__" {
                scan_md_files_recursive(&path, base, owner, repo, branch, skills);
            }
        } else if path.is_file() {
            let fname = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if !fname.ends_with(".md") { continue; }
            // Skip common non-skill files
            let lower = fname.to_lowercase();
            if lower == "readme.md" || lower == "changelog.md" || lower == "contributing.md"
                || lower == "license.md" || lower == "code_of_conduct.md" { continue; }

            if let Ok(content) = std::fs::read_to_string(&path) {
                let stem = fname.trim_end_matches(".md");
                let rel_path = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                let (name, desc) = parse_skill_frontmatter(&content, stem);

                skills.push(SkillRegistryEntry {
                    id: format!("{}/{}:{}", owner, repo, stem),
                    name,
                    description: desc.clone(),
                    description_zh: None,
                    category: guess_category(&desc),
                    author: Some(format!("{}/{}", owner, repo)),
                    github_url: Some(format!("https://github.com/{}/{}/tree/{}/{}", owner, repo, branch, rel_path)),
                    cover_url: None,
                    tags: vec![],
                    content,
                });
            }
        }
    }
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

    let client = build_http_client()?;
    let resp = client.get(&url)
        .send()
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
