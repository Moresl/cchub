use crate::skills::scanner::FolderNode;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct ConfigRoot {
    pub id: String,
    pub name: String,
    pub path: String,
    pub exists: bool,
}

struct ConfigRootCandidate {
    id: &'static str,
    name: &'static str,
    dir: &'static str,
}

const CONFIG_ROOTS: &[ConfigRootCandidate] = &[
    ConfigRootCandidate {
        id: "claude",
        name: "Claude",
        dir: ".claude",
    },
    ConfigRootCandidate {
        id: "codex",
        name: "Codex",
        dir: ".codex",
    },
    ConfigRootCandidate {
        id: "gemini",
        name: "Gemini",
        dir: ".gemini",
    },
    ConfigRootCandidate {
        id: "opencode",
        name: "OpenCode",
        dir: ".opencode",
    },
    ConfigRootCandidate {
        id: "openclaw",
        name: "OpenClaw",
        dir: ".openclaw",
    },
];

fn config_root_paths() -> Result<Vec<(String, String, PathBuf)>, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(CONFIG_ROOTS
        .iter()
        .map(|root| {
            (
                root.id.to_string(),
                root.name.to_string(),
                home.join(root.dir),
            )
        })
        .collect())
}

fn resolve_root_path(root_id: &str) -> Result<PathBuf, String> {
    let (_, _, path) = config_root_paths()?
        .into_iter()
        .find(|(id, _, _)| id == root_id)
        .ok_or_else(|| format!("Unknown config root: {}", root_id))?;
    Ok(path)
}

fn is_allowed_path(path: &Path) -> Result<bool, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path {}: {}", path.display(), e))?;
    let roots = config_root_paths()?;
    for (_, _, root) in roots {
        if !root.exists() {
            continue;
        }
        if let Ok(canonical_root) = root.canonicalize() {
            if canonical.starts_with(&canonical_root) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn ensure_allowed_file(path: &str) -> Result<PathBuf, String> {
    let file_path = PathBuf::from(path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    if !is_allowed_path(&file_path)? {
        return Err(format!("Access denied: {}", path));
    }
    Ok(file_path)
}

fn build_tree(path: &Path, max_depth: usize, depth: usize) -> FolderNode {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    let mut node = FolderNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: path.is_dir(),
        children: Vec::new(),
    };

    if !path.is_dir() || depth >= max_depth {
        return node;
    }

    let mut children = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let Ok(meta) = std::fs::symlink_metadata(&entry_path) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name == "node_modules" || file_name == "target" || file_name == ".git" {
                continue;
            }
            children.push(build_tree(&entry_path, max_depth, depth + 1));
        }
    }

    children.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    node.children = children;
    node
}

#[tauri::command]
pub fn get_config_roots() -> Result<Vec<ConfigRoot>, String> {
    Ok(config_root_paths()?
        .into_iter()
        .map(|(id, name, path)| ConfigRoot {
            id,
            name,
            exists: path.exists(),
            path: path.to_string_lossy().to_string(),
        })
        .collect())
}

#[tauri::command]
pub fn get_config_file_tree(root_id: String) -> Result<FolderNode, String> {
    let root = resolve_root_path(&root_id)?;
    if !root.exists() {
        return Err(format!("Directory does not exist: {}", root.display()));
    }
    Ok(build_tree(&root, 8, 0))
}

#[tauri::command]
pub fn read_config_file_content(path: String) -> Result<String, String> {
    let file_path = ensure_allowed_file(&path)?;
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))
}

#[tauri::command]
pub fn write_config_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = ensure_allowed_file(&path)?;
    crate::utils::atomic_write_string(&file_path, &content)
        .map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))
}
