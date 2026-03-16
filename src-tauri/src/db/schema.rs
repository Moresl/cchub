use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            package_name TEXT,
            version TEXT,
            transport TEXT DEFAULT 'stdio',
            command TEXT,
            args TEXT DEFAULT '[]',
            env TEXT DEFAULT '{}',
            status TEXT DEFAULT 'stopped',
            source TEXT DEFAULT 'local',
            config_path TEXT,
            installed_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS plugins (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            source_url TEXT,
            version TEXT,
            installed_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            plugin_id TEXT,
            trigger_command TEXT,
            file_path TEXT,
            version TEXT,
            installed_at TEXT,
            FOREIGN KEY (plugin_id) REFERENCES plugins(id)
        );

        CREATE TABLE IF NOT EXISTS hooks (
            id TEXT PRIMARY KEY,
            event TEXT NOT NULL,
            matcher TEXT,
            command TEXT NOT NULL,
            scope TEXT DEFAULT 'global',
            project_path TEXT,
            enabled INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS update_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            old_version TEXT,
            new_version TEXT,
            status TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL,
            request_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            avg_latency_ms REAL,
            recorded_at TEXT,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id)
        );

        CREATE TABLE IF NOT EXISTS mcp_clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            config_path TEXT DEFAULT '',
            server_access TEXT DEFAULT '{}',
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL,
            request_type TEXT DEFAULT 'request',
            status TEXT DEFAULT 'success',
            latency_ms INTEGER,
            recorded_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            base_path TEXT,
            is_active INTEGER DEFAULT 0,
            created_at TEXT
        );
    ")?;

    // Migration: add config_path column if not exists
    let _ = conn.execute_batch("ALTER TABLE mcp_servers ADD COLUMN config_path TEXT;");

    Ok(())
}
