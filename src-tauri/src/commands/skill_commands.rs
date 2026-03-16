use crate::db::models::{Plugin, Skill};
use crate::db::DbState;
use crate::skills::{scanner, tools, installer};
use tauri::State;

#[tauri::command]
pub fn scan_skills(_db: State<'_, DbState>) -> Result<Vec<Skill>, String> {
    Ok(scanner::scan_local_skills())
}

#[tauri::command]
pub fn get_skills(db: State<'_, DbState>) -> Result<Vec<Skill>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, plugin_id, trigger_command, file_path, version, installed_at FROM skills")
        .map_err(|e| e.to_string())?;

    let skills = stmt
        .query_map([], |row| {
            Ok(Skill {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                plugin_id: row.get(3)?,
                trigger_command: row.get(4)?,
                file_path: row.get(5)?,
                version: row.get(6)?,
                installed_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(skills)
}

#[tauri::command]
pub fn get_plugins(db: State<'_, DbState>) -> Result<Vec<Plugin>, String> {
    let plugins = scanner::scan_local_plugins();
    if !plugins.is_empty() {
        return Ok(plugins);
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, source_url, version, installed_at, updated_at FROM plugins")
        .map_err(|e| e.to_string())?;

    let plugins = stmt
        .query_map([], |row| {
            Ok(Plugin {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                source_url: row.get(3)?,
                version: row.get(4)?,
                installed_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(plugins)
}

#[tauri::command]
pub fn install_plugin(source_url: String) -> Result<String, String> {
    Err(format!("Plugin installation from {} not yet implemented", source_url))
}

#[tauri::command]
pub fn read_skill_content(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {}: {}", file_path, e))
}

#[tauri::command]
pub fn uninstall_plugin(plugin_id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM skills WHERE plugin_id = ?1", rusqlite::params![plugin_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM plugins WHERE id = ?1", rusqlite::params![plugin_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── New commands for enhanced skill management ──

#[tauri::command]
pub fn detect_tools() -> Vec<tools::DetectedTool> {
    tools::detect_tools()
}

#[tauri::command]
pub fn get_skill_folder_tree(base_dir: String) -> Result<scanner::FolderNode, String> {
    scanner::get_folder_tree(&base_dir)
}

#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    scanner::check_path_exists(&path)
}

#[tauri::command]
pub fn get_skill_categories(_db: State<'_, DbState>) -> Result<scanner::CategoryCounts, String> {
    let skills = scanner::scan_local_skills();
    Ok(scanner::get_category_counts(&skills))
}

#[tauri::command]
pub fn install_skill_file(source: String, target_skills_dir: String) -> Result<String, String> {
    installer::install_skill_file(&source, &target_skills_dir)
}

#[tauri::command]
pub fn uninstall_skill_file(path: String) -> Result<(), String> {
    installer::uninstall_skill_file(&path)
}

#[tauri::command]
pub fn copy_skill_between_tools(path: String, target_skills_dir: String) -> Result<String, String> {
    installer::copy_skill_between_tools(&path, &target_skills_dir)
}

#[tauri::command]
pub fn write_skill_content(file_path: String, content: String) -> Result<(), String> {
    crate::utils::atomic_write_string(std::path::Path::new(&file_path), &content)
        .map_err(|e| format!("Failed to write {}: {}", file_path, e))
}

#[tauri::command]
pub fn toggle_skill_file(file_path: String, enabled: bool) -> Result<String, String> {
    let disabled_suffix = ".disabled";

    if enabled {
        // Remove .disabled suffix
        if file_path.ends_with(disabled_suffix) {
            let new_path = &file_path[..file_path.len() - disabled_suffix.len()];
            std::fs::rename(&file_path, new_path)
                .map_err(|e| format!("Failed to enable: {}", e))?;
            Ok(new_path.to_string())
        } else {
            Ok(file_path) // Already enabled
        }
    } else {
        // Add .disabled suffix
        if !file_path.ends_with(disabled_suffix) {
            let new_path = format!("{}{}", file_path, disabled_suffix);
            std::fs::rename(&file_path, &new_path)
                .map_err(|e| format!("Failed to disable: {}", e))?;
            Ok(new_path)
        } else {
            Ok(file_path) // Already disabled
        }
    }
}

#[tauri::command]
pub fn delete_plugin_dir(plugin_name: String) -> Result<(), String> {
    let plugins_dir = scanner::get_plugins_dir().ok_or("Cannot find plugins directory")?;
    let plugin_path = plugins_dir.join(&plugin_name);
    if plugin_path.exists() && plugin_path.is_dir() {
        std::fs::remove_dir_all(&plugin_path)
            .map_err(|e| format!("Failed to delete plugin directory: {}", e))?;
    }
    Ok(())
}
