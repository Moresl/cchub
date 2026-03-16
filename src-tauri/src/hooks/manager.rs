use crate::db::models::Hook;

/// Read hooks from Claude Code settings.json
pub fn read_hooks_from_settings() -> Vec<Hook> {
    let path = match dirs::home_dir() {
        Some(h) => h.join(".claude").join("settings.json"),
        None => return Vec::new(),
    };

    if !path.exists() {
        return Vec::new();
    }

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let settings: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut hooks = Vec::new();

    if let Some(hooks_obj) = settings.get("hooks") {
        if let Some(obj) = hooks_obj.as_object() {
            for (event, hook_configs) in obj {
                if let Some(arr) = hook_configs.as_array() {
                    for (i, hook_config) in arr.iter().enumerate() {
                        let matcher = hook_config.get("matcher")
                            .and_then(|v| v.as_str())
                            .map(String::from);
                        let command = hook_config.get("command")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        if command.is_empty() {
                            continue;
                        }

                        hooks.push(Hook {
                            id: format!("{}-{}", event, i),
                            event: event.clone(),
                            matcher,
                            command,
                            scope: "global".to_string(),
                            project_path: None,
                            enabled: true,
                        });
                    }
                }
            }
        }
    }

    hooks
}
