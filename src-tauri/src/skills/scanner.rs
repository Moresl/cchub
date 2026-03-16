use crate::db::models::{Plugin, Skill};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct FolderNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FolderNode>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryCounts {
    pub skills: u32,
    pub prompts: u32,
    pub commands: u32,
    pub plugins: u32,
    pub total: u32,
}

/// Build a folder tree from a base directory
pub fn get_folder_tree(base_dir: &str) -> Result<FolderNode, String> {
    let path = PathBuf::from(base_dir);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", base_dir));
    }
    Ok(build_tree(&path, 3, 0))
}

fn build_tree(path: &PathBuf, max_depth: usize, depth: usize) -> FolderNode {
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut node = FolderNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: path.is_dir(),
        children: Vec::new(),
    };

    if path.is_dir() && depth < max_depth {
        if let Ok(entries) = std::fs::read_dir(path) {
            let mut children: Vec<FolderNode> = entries
                .flatten()
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    !n.starts_with('.') && n != "node_modules"
                })
                .map(|e| build_tree(&e.path(), max_depth, depth + 1))
                .collect();
            // Directories first, then files, alphabetical within each
            children.sort_by(|a, b| {
                b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            });
            node.children = children;
        }
    }

    node
}

/// Categorize skills by examining file content/path patterns
pub fn get_category_counts(skills: &[Skill]) -> CategoryCounts {
    let mut counts = CategoryCounts {
        skills: 0,
        prompts: 0,
        commands: 0,
        plugins: 0,
        total: skills.len() as u32,
    };

    for skill in skills {
        let category = categorize_skill(skill);
        match category.as_str() {
            "prompt" => counts.prompts += 1,
            "command" => counts.commands += 1,
            "plugin" => counts.plugins += 1,
            _ => counts.skills += 1,
        }
    }

    counts
}

/// Determine skill category from metadata
pub fn categorize_skill(skill: &Skill) -> String {
    // If it belongs to a plugin, mark as plugin-skill
    if skill.plugin_id.is_some() {
        return "plugin".to_string();
    }

    let name_lower = skill.name.to_lowercase();
    let desc_lower = skill.description.as_deref().unwrap_or("").to_lowercase();

    // Check for prompt patterns
    if name_lower.contains("prompt") || desc_lower.contains("prompt") || desc_lower.contains("template") {
        return "prompt".to_string();
    }

    // Check for command patterns
    if skill.trigger_command.is_some() && (name_lower.contains("command") || desc_lower.contains("command") || desc_lower.contains("slash")) {
        return "command".to_string();
    }

    "skill".to_string()
}

/// Check if a path exists
pub fn check_path_exists(path: &str) -> bool {
    PathBuf::from(path).exists()
}

/// Get the Claude Code plugins directory
pub fn get_plugins_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("plugins"))
}

/// Get the Claude Code skills directory (user-level)
pub fn get_skills_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("skills"))
}

/// Scan locally installed plugins from ~/.claude/plugins/
pub fn scan_local_plugins() -> Vec<Plugin> {
    let plugins_dir = match get_plugins_dir() {
        Some(d) if d.exists() => d,
        _ => return Vec::new(),
    };

    let mut plugins = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&plugins_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

            // Try to read package.json or plugin metadata
            let (description, version, source_url) = read_plugin_metadata(&path);

            plugins.push(Plugin {
                id: name.clone(),
                name,
                description,
                source_url,
                version,
                installed_at: get_dir_created_time(&path),
                updated_at: get_dir_modified_time(&path),
            });
        }
    }

    plugins
}

/// Scan skills from plugins and standalone skills directory
pub fn scan_local_skills() -> Vec<Skill> {
    let mut skills = Vec::new();

    // Scan skills within plugins
    if let Some(plugins_dir) = get_plugins_dir() {
        if plugins_dir.exists() {
            scan_skills_in_dir(&plugins_dir, &mut skills, true);
        }
    }

    // Scan standalone skills
    if let Some(skills_dir) = get_skills_dir() {
        if skills_dir.exists() {
            scan_skills_in_dir(&skills_dir, &mut skills, false);
        }
    }

    skills
}

fn scan_skills_in_dir(dir: &PathBuf, skills: &mut Vec<Skill>, is_plugin_dir: bool) {
    let walker = walkdir(dir, is_plugin_dir);
    for skill_file in walker {
        if let Some(skill) = parse_skill_file(&skill_file, is_plugin_dir) {
            skills.push(skill);
        }
    }
}

fn walkdir(dir: &PathBuf, deep: bool) -> Vec<PathBuf> {
    let mut results = Vec::new();
    walk_recursive(dir, &mut results, if deep { 4 } else { 2 }, 0);
    results
}

fn walk_recursive(dir: &PathBuf, results: &mut Vec<PathBuf>, max_depth: usize, current_depth: usize) {
    if current_depth > max_depth {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                let name = path.file_stem().and_then(|n| n.to_str()).unwrap_or("");
                // Skill files are typically .md files with frontmatter
                if ext == "md" && name != "README" && name != "CHANGELOG" {
                    results.push(path);
                }
            } else if path.is_dir() {
                let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !dir_name.starts_with('.') && dir_name != "node_modules" {
                    walk_recursive(&path, results, max_depth, current_depth + 1);
                }
            }
        }
    }
}

fn parse_skill_file(path: &PathBuf, is_plugin_dir: bool) -> Option<Skill> {
    let content = std::fs::read_to_string(path).ok()?;
    let file_name = path.file_stem()?.to_string_lossy().to_string();

    // Extract frontmatter metadata
    let (name, description, trigger) = if content.starts_with("---") {
        parse_frontmatter(&content, &file_name)
    } else {
        (file_name.clone(), None, None)
    };

    // Determine plugin_id from path
    let plugin_id = if is_plugin_dir {
        path.ancestors()
            .nth(2)
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
    } else {
        None
    };

    Some(Skill {
        id: format!("{}:{}", plugin_id.as_deref().unwrap_or("standalone"), &file_name),
        name,
        description,
        plugin_id,
        trigger_command: trigger.or(Some(format!("/{}", file_name))),
        file_path: Some(path.to_string_lossy().to_string()),
        version: None,
        installed_at: get_file_created_time(path),
    })
}

fn parse_frontmatter(content: &str, default_name: &str) -> (String, Option<String>, Option<String>) {
    let mut name = default_name.to_string();
    let mut description = None;
    let mut trigger = None;

    if let Some(end) = content[3..].find("---") {
        let frontmatter = &content[3..3 + end];
        for line in frontmatter.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("name:") {
                name = val.trim().trim_matches('"').trim_matches('\'').to_string();
            } else if let Some(val) = line.strip_prefix("description:") {
                description = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
            } else if let Some(val) = line.strip_prefix("trigger:") {
                trigger = Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
            }
        }
    }

    (name, description, trigger)
}

fn read_plugin_metadata(path: &PathBuf) -> (Option<String>, Option<String>, Option<String>) {
    let pkg_json = path.join("package.json");
    if pkg_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_json) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                return (
                    pkg.get("description").and_then(|v| v.as_str()).map(String::from),
                    pkg.get("version").and_then(|v| v.as_str()).map(String::from),
                    pkg.get("repository")
                        .and_then(|v| v.get("url").or(Some(v)))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                );
            }
        }
    }
    (None, None, None)
}

fn get_dir_created_time(path: &PathBuf) -> Option<String> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        })
}

fn get_dir_modified_time(path: &PathBuf) -> Option<String> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        })
}

fn get_file_created_time(path: &PathBuf) -> Option<String> {
    get_dir_created_time(path)
}
