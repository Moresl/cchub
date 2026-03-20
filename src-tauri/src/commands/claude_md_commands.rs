use crate::claude_md::manager;
use tauri::command;

#[command]
pub fn scan_claude_md() -> Result<Vec<manager::ClaudeMdFile>, String> {
    Ok(manager::scan_claude_md_files())
}

#[command]
pub fn read_claude_md_content(path: String) -> Result<String, String> {
    manager::read_claude_md(&path)
}

#[command]
pub fn write_claude_md_content(path: String, content: String) -> Result<(), String> {
    manager::write_claude_md(&path, &content)
}

#[command]
pub fn get_claude_md_templates() -> Result<Vec<manager::ClaudeMdTemplate>, String> {
    Ok(manager::get_claude_md_templates())
}

#[command]
pub fn create_new_claude_md(dir_path: String, content: String) -> Result<String, String> {
    manager::create_claude_md(&dir_path, &content)
}

#[command]
pub fn delete_claude_md_file(path: String) -> Result<(), String> {
    manager::delete_claude_md(&path)
}

#[command]
pub fn disable_claude_md_file(path: String) -> Result<String, String> {
    manager::disable_claude_md(&path)
}

#[command]
pub fn enable_claude_md_file(path: String) -> Result<String, String> {
    manager::enable_claude_md(&path)
}
