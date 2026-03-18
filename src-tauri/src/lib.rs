mod commands;
mod db;
mod error;
mod mcp;
mod skills;
mod hooks;
mod claude_md;
mod updater;
mod security;
mod utils;

use commands::mcp_commands;
use commands::skill_commands;
use commands::hook_commands;
use commands::update_commands;
use commands::claude_md_commands;
use commands::security_commands;
use commands::marketplace_commands;
use commands::extra_commands;

pub fn run() {
    utils::install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            db::init_db(&app_handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // MCP commands
            mcp_commands::scan_mcp_servers,
            mcp_commands::get_mcp_servers,
            mcp_commands::install_mcp_server,
            mcp_commands::uninstall_mcp_server,
            mcp_commands::update_mcp_server_config,
            mcp_commands::toggle_mcp_server,
            mcp_commands::check_mcp_server_health,
            mcp_commands::check_all_mcp_health,
            mcp_commands::sync_mcp_server_to_tool,
            mcp_commands::unsync_mcp_server_from_tool,
            mcp_commands::check_mcp_server_in_tools,
            // Skill commands
            skill_commands::scan_skills,
            skill_commands::get_skills,
            skill_commands::get_plugins,
            skill_commands::install_plugin,
            skill_commands::uninstall_plugin,
            skill_commands::read_skill_content,
            skill_commands::detect_tools,
            skill_commands::get_skill_folder_tree,
            skill_commands::check_path_exists,
            skill_commands::get_skill_categories,
            skill_commands::install_skill_file,
            skill_commands::uninstall_skill_file,
            skill_commands::copy_skill_between_tools,
            skill_commands::remove_synced_skill,
            skill_commands::write_skill_content,
            skill_commands::toggle_skill_file,
            skill_commands::delete_plugin_dir,
            // Hook commands
            hook_commands::scan_hooks,
            hook_commands::get_hooks,
            hook_commands::create_hook,
            hook_commands::update_hook,
            hook_commands::delete_hook,
            // Update commands
            update_commands::check_updates,
            update_commands::get_update_history,
            update_commands::get_app_version,
            // CLAUDE.md commands
            claude_md_commands::scan_claude_md,
            claude_md_commands::read_claude_md_content,
            claude_md_commands::write_claude_md_content,
            claude_md_commands::get_claude_md_templates,
            claude_md_commands::create_new_claude_md,
            // Security commands
            security_commands::run_security_audit,
            security_commands::get_server_audit,
            // Marketplace commands
            marketplace_commands::get_marketplace_entries,
            marketplace_commands::search_marketplace,
            marketplace_commands::install_from_marketplace,
            marketplace_commands::get_skills_marketplace,
            marketplace_commands::fetch_custom_skill_source,
            marketplace_commands::install_skill_from_marketplace,
            marketplace_commands::fetch_skills_from_repo,
            marketplace_commands::get_skillhub_catalog,
            marketplace_commands::search_skillhub_skills,
            marketplace_commands::get_skillhub_skill_content,
            // Extra commands (clients, logs, workspaces)
            extra_commands::get_mcp_clients,
            extra_commands::create_mcp_client,
            extra_commands::update_mcp_client_access,
            extra_commands::delete_mcp_client,
            extra_commands::get_activity_logs,
            extra_commands::get_activity_heatmap,
            extra_commands::get_workspaces,
            extra_commands::create_workspace,
            extra_commands::switch_workspace,
            extra_commands::update_workspace,
            extra_commands::delete_workspace,
            // Custom paths
            extra_commands::get_custom_paths,
            extra_commands::save_custom_path,
            extra_commands::delete_custom_path,
            // Config profiles
            extra_commands::sync_config_profiles,
            extra_commands::get_config_profiles,
            extra_commands::get_active_config_profile_ids,
            extra_commands::save_config_profile,
            extra_commands::update_config_profile,
            extra_commands::apply_config_profile,
            extra_commands::delete_config_profile,
            extra_commands::read_tool_config,
            extra_commands::get_claude_permissions_level,
            extra_commands::set_claude_permissions_level,
            extra_commands::get_claude_auto_update,
            extra_commands::set_claude_auto_update,
            extra_commands::get_codex_settings,
            extra_commands::set_codex_setting,
            extra_commands::pick_folder,
            extra_commands::pick_file,
            extra_commands::set_proxy,
            extra_commands::get_proxy,
            extra_commands::save_backup_to_file,
            extra_commands::import_backup_from_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
