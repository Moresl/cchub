use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HealthCheckResult {
    pub server_id: String,
    pub server_name: String,
    pub status: String,
    pub command_exists: bool,
    pub can_start: bool,
    pub error_message: Option<String>,
    pub latency_ms: Option<u64>,
    pub checked_at: String,
}

pub fn check_command_exists(command: &str) -> bool {
    if command.is_empty() {
        return false;
    }

    // For npx, node, python etc, check with where.exe on Windows
    let check_cmd = if cfg!(windows) { "where.exe" } else { "which" };

    // Extract the actual command (first part, ignore arguments)
    let cmd = command.split_whitespace().next().unwrap_or(command);

    std::process::Command::new(check_cmd)
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn try_spawn_server(
    command: &str,
    args: &[String],
    env: &HashMap<String, String>,
) -> (bool, Option<u64>, Option<String>) {
    let start = Instant::now();

    let mut cmd = std::process::Command::new(command);
    cmd.args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    match cmd.spawn() {
        Ok(mut child) => {
            let elapsed = start.elapsed().as_millis() as u64;
            // Wait briefly to see if it crashes immediately
            match child.try_wait() {
                Ok(Some(status)) => {
                    if status.success() {
                        (true, Some(elapsed), None)
                    } else {
                        (false, Some(elapsed), Some(format!("Process exited with code {}", status)))
                    }
                }
                Ok(None) => {
                    // Process is still running — that's good, kill it
                    let _ = child.kill();
                    let _ = child.wait();
                    (true, Some(elapsed), None)
                }
                Err(e) => {
                    let _ = child.kill();
                    (false, Some(elapsed), Some(format!("Error checking process: {}", e)))
                }
            }
        }
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as u64;
            (false, Some(elapsed), Some(format!("Failed to spawn: {}", e)))
        }
    }
}

pub fn check_server_health(
    server_id: &str,
    server_name: &str,
    command: &str,
    args_json: &str,
    env_json: &str,
) -> HealthCheckResult {
    let now = chrono::Utc::now().to_rfc3339();

    if command.is_empty() {
        return HealthCheckResult {
            server_id: server_id.to_string(),
            server_name: server_name.to_string(),
            status: "unknown".to_string(),
            command_exists: false,
            can_start: false,
            error_message: Some("No command configured".to_string()),
            latency_ms: None,
            checked_at: now,
        };
    }

    let cmd_exists = check_command_exists(command);

    if !cmd_exists {
        return HealthCheckResult {
            server_id: server_id.to_string(),
            server_name: server_name.to_string(),
            status: "unhealthy".to_string(),
            command_exists: false,
            can_start: false,
            error_message: Some(format!("Command '{}' not found", command)),
            latency_ms: None,
            checked_at: now,
        };
    }

    let args: Vec<String> = serde_json::from_str(args_json).unwrap_or_default();
    let env: HashMap<String, String> = serde_json::from_str(env_json).unwrap_or_default();

    let (can_start, latency, error) = try_spawn_server(command, &args, &env);

    let status = if can_start { "healthy" } else { "unhealthy" };

    HealthCheckResult {
        server_id: server_id.to_string(),
        server_name: server_name.to_string(),
        status: status.to_string(),
        command_exists: true,
        can_start,
        error_message: error,
        latency_ms: latency,
        checked_at: now,
    }
}
