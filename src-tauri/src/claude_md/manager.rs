use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeMdFile {
    pub path: String,
    pub project_name: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
    pub content_preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeMdTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
}

pub fn scan_claude_md_files() -> Vec<ClaudeMdFile> {
    let mut results = Vec::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return results,
    };

    // Check global CLAUDE.md
    let global_claude_md = home.join(".claude").join("CLAUDE.md");
    if global_claude_md.exists() {
        if let Some(entry) = read_claude_md_entry(&global_claude_md, "Global (.claude)") {
            results.push(entry);
        }
    }

    // Scan common project directories
    let scan_dirs = vec![
        home.clone(),
        home.join("Documents"),
        home.join("Projects"),
        home.join("repos"),
        home.join("code"),
        home.join("dev"),
        home.join("Desktop"),
        home.join("workspace"),
        home.join("src"),
    ];

    for dir in scan_dirs {
        if dir.exists() && dir.is_dir() {
            walk_for_claude_md(&dir, 0, 3, &mut results);
        }
    }

    // Deduplicate by path
    results.sort_by(|a, b| a.path.cmp(&b.path));
    results.dedup_by(|a, b| a.path == b.path);
    results
}

fn walk_for_claude_md(dir: &Path, depth: usize, max_depth: usize, results: &mut Vec<ClaudeMdFile>) {
    if depth > max_depth {
        return;
    }

    let claude_md_path = dir.join("CLAUDE.md");
    if claude_md_path.exists() {
        let project_name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| dir.to_string_lossy().to_string());
        if let Some(entry) = read_claude_md_entry(&claude_md_path, &project_name) {
            results.push(entry);
        }
    }

    // Also check .claude/CLAUDE.md within projects
    let nested_claude_md = dir.join(".claude").join("CLAUDE.md");
    if nested_claude_md.exists() {
        let project_name = dir
            .file_name()
            .map(|n| format!("{} (.claude)", n.to_string_lossy()))
            .unwrap_or_else(|| dir.to_string_lossy().to_string());
        if let Some(entry) = read_claude_md_entry(&nested_claude_md, &project_name) {
            results.push(entry);
        }
    }

    if depth >= max_depth {
        return;
    }

    // Skip common non-project directories
    let skip_dirs = [
        "node_modules", ".git", "target", "dist", "build", ".next",
        "__pycache__", ".venv", "venv", ".tox", ".cache", ".npm",
        "AppData", "Application Data", ".local", ".config",
    ];

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                if !name.starts_with('.') || name == ".claude" {
                    if !skip_dirs.contains(&name.as_str()) {
                        walk_for_claude_md(&path, depth + 1, max_depth, results);
                    }
                }
            }
        }
    }
}

fn read_claude_md_entry(path: &Path, project_name: &str) -> Option<ClaudeMdFile> {
    let metadata = fs::metadata(path).ok()?;
    let content = fs::read_to_string(path).ok()?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|t| {
            let datetime: chrono::DateTime<chrono::Local> = t.into();
            Some(datetime.format("%Y-%m-%d %H:%M").to_string())
        });

    let preview = if content.len() > 200 {
        // Find a valid UTF-8 char boundary at or before byte 200
        let end = content.floor_char_boundary(200);
        format!("{}...", &content[..end])
    } else {
        content.clone()
    };

    Some(ClaudeMdFile {
        path: path.to_string_lossy().to_string(),
        project_name: project_name.to_string(),
        size_bytes: metadata.len(),
        modified_at,
        content_preview: preview,
    })
}

pub fn read_claude_md(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

pub fn write_claude_md(path: &str, content: &str) -> Result<(), String> {
    // Create parent directories if needed
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    crate::utils::atomic_write_string(Path::new(path), content)
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

pub fn create_claude_md(dir_path: &str, content: &str) -> Result<String, String> {
    let path = PathBuf::from(dir_path).join("CLAUDE.md");
    if path.exists() {
        return Err("CLAUDE.md already exists in this directory".to_string());
    }
    write_claude_md(&path.to_string_lossy(), content)?;
    Ok(path.to_string_lossy().to_string())
}

pub fn get_claude_md_templates() -> Vec<ClaudeMdTemplate> {
    vec![
        ClaudeMdTemplate {
            id: "generic".to_string(),
            name: "Generic Project".to_string(),
            description: "A general-purpose CLAUDE.md template".to_string(),
            content: r#"# CLAUDE.md

## Project Overview
<!-- Describe what this project does -->

## Tech Stack
<!-- List the main technologies used -->

## Development Commands
```bash
# Install dependencies
# Run dev server
# Run tests
# Build for production
```

## Code Style
<!-- Describe coding conventions -->

## Important Notes
<!-- Any special instructions for Claude -->
"#.to_string(),
        },
        ClaudeMdTemplate {
            id: "rust".to_string(),
            name: "Rust Project".to_string(),
            description: "Template for Rust/Cargo projects".to_string(),
            content: r#"# CLAUDE.md

## Project Overview
This is a Rust project managed with Cargo.

## Development Commands
```bash
cargo build          # Build the project
cargo test           # Run tests
cargo run            # Run the project
cargo clippy         # Lint
cargo fmt            # Format code
```

## Code Style
- Follow Rust idioms and conventions
- Use `Result<T, E>` for error handling
- Prefer `impl Trait` over `dyn Trait` when possible
- Write doc comments for public APIs

## Architecture
<!-- Describe the module structure -->
"#.to_string(),
        },
        ClaudeMdTemplate {
            id: "typescript".to_string(),
            name: "TypeScript Project".to_string(),
            description: "Template for TypeScript/Node.js projects".to_string(),
            content: r#"# CLAUDE.md

## Project Overview
This is a TypeScript project.

## Development Commands
```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm test             # Run tests
npm run lint         # Lint code
```

## Code Style
- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over raw promises
- Follow ESLint configuration

## Architecture
<!-- Describe the project structure -->
"#.to_string(),
        },
        ClaudeMdTemplate {
            id: "python".to_string(),
            name: "Python Project".to_string(),
            description: "Template for Python projects".to_string(),
            content: r#"# CLAUDE.md

## Project Overview
This is a Python project.

## Development Commands
```bash
pip install -e .     # Install in dev mode
pytest               # Run tests
python -m mypy .     # Type check
ruff check .         # Lint
ruff format .        # Format
```

## Code Style
- Follow PEP 8
- Use type hints
- Prefer dataclasses for data structures
- Use virtual environments

## Architecture
<!-- Describe the package structure -->
"#.to_string(),
        },
    ]
}
