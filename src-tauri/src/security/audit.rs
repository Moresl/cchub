use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecurityAuditResult {
    pub server_id: String,
    pub server_name: String,
    pub risk_level: String,
    pub findings: Vec<SecurityFinding>,
    pub scanned_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecurityFinding {
    pub category: String,
    pub severity: String,
    pub title: String,
    pub description: String,
}

pub fn audit_server(
    server_id: &str,
    server_name: &str,
    command: &str,
    args_json: &str,
    env_json: &str,
) -> SecurityAuditResult {
    let mut findings = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    // 1. Check for sensitive environment variables
    if let Ok(env) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(env_json) {
        let sensitive_patterns = ["API_KEY", "SECRET", "TOKEN", "PASSWORD", "CREDENTIAL", "PRIVATE_KEY", "AUTH"];
        for key in env.keys() {
            let upper = key.to_uppercase();
            for pattern in &sensitive_patterns {
                if upper.contains(pattern) {
                    findings.push(SecurityFinding {
                        category: "env_secrets".to_string(),
                        severity: "warning".to_string(),
                        title: format!("Sensitive env var: {}", key),
                        description: format!("Environment variable '{}' appears to contain sensitive credentials. Ensure this value is properly secured.", key),
                    });
                    break;
                }
            }
        }
    }

    // 2. Check for shell execution risk
    let shell_commands = ["bash", "sh", "cmd", "powershell", "pwsh"];
    let shell_args = ["-c", "/c", "/k", "-Command"];

    if shell_commands.iter().any(|sc| command.contains(sc)) {
        let args: Vec<String> = serde_json::from_str(args_json).unwrap_or_default();
        if args.iter().any(|a| shell_args.contains(&a.as_str())) {
            findings.push(SecurityFinding {
                category: "shell_exec".to_string(),
                severity: "warning".to_string(),
                title: "Shell command execution".to_string(),
                description: format!("Server uses shell execution via '{}'. This allows arbitrary command execution.", command),
            });
        }
    }

    // 3. Check for npx auto-install risk
    if command == "npx" || command.ends_with("/npx") || command.ends_with("\\npx") {
        let args: Vec<String> = serde_json::from_str(args_json).unwrap_or_default();
        if args.iter().any(|a| a == "-y" || a == "--yes") {
            findings.push(SecurityFinding {
                category: "npx_risk".to_string(),
                severity: "info".to_string(),
                title: "npx auto-install enabled".to_string(),
                description: "Server uses 'npx -y' which automatically installs packages without confirmation. This is common but means packages are fetched from npm on each run.".to_string(),
            });
        }
    }

    // 4. Check for network-accessing tools in args
    let args: Vec<String> = serde_json::from_str(args_json).unwrap_or_default();
    let args_str = args.join(" ");
    if args_str.contains("http://") || args_str.contains("https://") {
        findings.push(SecurityFinding {
            category: "network_access".to_string(),
            severity: "info".to_string(),
            title: "External URL in arguments".to_string(),
            description: "Server arguments contain external URLs. Verify these endpoints are trusted.".to_string(),
        });
    }

    // 5. Check for broad file access patterns
    let dangerous_paths = ["/*", "C:\\", "/etc", "/usr", "~", "%USERPROFILE%"];
    for arg in &args {
        for dp in &dangerous_paths {
            if arg.contains(dp) {
                findings.push(SecurityFinding {
                    category: "file_access".to_string(),
                    severity: "warning".to_string(),
                    title: format!("Broad file access: {}", arg),
                    description: "Server has access to a broad file path. Consider restricting to specific directories.".to_string(),
                });
                break;
            }
        }
    }

    // Determine overall risk level
    let risk_level = if findings.iter().any(|f| f.severity == "critical") {
        "high"
    } else if findings.iter().any(|f| f.severity == "warning") {
        "medium"
    } else if findings.is_empty() {
        "low"
    } else {
        "low"
    };

    SecurityAuditResult {
        server_id: server_id.to_string(),
        server_name: server_name.to_string(),
        risk_level: risk_level.to_string(),
        findings,
        scanned_at: now,
    }
}

pub fn audit_all_servers(
    servers: &[(String, String, String, String, String)],
) -> Vec<SecurityAuditResult> {
    servers
        .iter()
        .map(|(id, name, cmd, args, env)| audit_server(id, name, cmd, args, env))
        .collect()
}
