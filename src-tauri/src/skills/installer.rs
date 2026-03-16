use std::path::PathBuf;

/// Install a skill file to a target tool's skills directory
pub fn install_skill_file(source: &str, target_skills_dir: &str) -> Result<String, String> {
    let source_path = PathBuf::from(source);
    if !source_path.exists() {
        return Err(format!("Source file does not exist: {}", source));
    }

    let target_dir = PathBuf::from(target_skills_dir);
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create directory {}: {}", target_skills_dir, e))?;
    }

    let file_name = source_path
        .file_name()
        .ok_or("Invalid source file name")?;
    let target_path = target_dir.join(file_name);

    std::fs::copy(&source_path, &target_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

/// Uninstall (delete) a skill file
pub fn uninstall_skill_file(path: &str) -> Result<(), String> {
    let file_path = PathBuf::from(path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete {}: {}", path, e))
}

/// Copy a skill file to another tool's skills directory
pub fn copy_skill_between_tools(source_path: &str, target_skills_dir: &str) -> Result<String, String> {
    install_skill_file(source_path, target_skills_dir)
}
