use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DetectedTool {
    pub id: String,
    pub name: String,
    pub config_path: String,
    pub skills_dir: String,
    pub installed: bool,
}

/// Detect AI coding tools installed on the system
pub fn detect_tools() -> Vec<DetectedTool> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };

    let candidates = vec![
        ("claude", "Claude Code", ".claude", "settings.json", "skills"),
        ("cursor", "Cursor", ".cursor", "mcp.json", "skills"),
        ("windsurf", "Windsurf", ".windsurf", "mcp.json", "skills"),
        ("codex", "Codex CLI", ".codex", "config.json", "skills"),
    ];

    candidates
        .into_iter()
        .map(|(id, name, dir, config_file, skills_subdir)| {
            let base = home.join(dir);
            let config_path = base.join(config_file);
            let skills_dir = base.join(skills_subdir);
            let installed = base.exists();

            DetectedTool {
                id: id.to_string(),
                name: name.to_string(),
                config_path: config_path.to_string_lossy().to_string(),
                skills_dir: skills_dir.to_string_lossy().to_string(),
                installed,
            }
        })
        .collect()
}

