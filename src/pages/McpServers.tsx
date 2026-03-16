import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Trash2, Edit3, X, Save, Plug, Copy, Check, Activity, FileText } from "lucide-react";
import { t, tReplace, getLocale } from "../lib/i18n";
import CodeEditor from "../components/CodeEditor";

interface McpServer {
  id: string; name: string; command: string | null; args: string; env: string;
  status: string; transport: string; source: string; package_name: string | null;
  version: string | null; config_path: string | null;
}

interface HealthCheckResult {
  server_id: string; server_name: string; status: string;
  command_exists: boolean; can_start: boolean;
  error_message: string | null; latency_ms: number | null; checked_at: string;
}

export default function McpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<McpServer | null>(null);
  const [editing, setEditing] = useState(false);
  const [editCommand, setEditCommand] = useState("");
  const [editArgs, setEditArgs] = useState("");
  const [editEnv, setEditEnv] = useState("");
  const [copied, setCopied] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<string, HealthCheckResult>>({});
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const i = t();

  useEffect(() => { loadServers(); }, []);

  async function loadServers() {
    setLoading(true);
    try { setServers(await invoke<McpServer[]>("scan_mcp_servers")); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function checkHealth() {
    setCheckingHealth(true);
    try {
      const results = await invoke<HealthCheckResult[]>("check_all_mcp_health");
      const map: Record<string, HealthCheckResult> = {};
      for (const r of results) { map[r.server_id] = r; }
      setHealthResults(map);
    } catch (e) { console.error(e); }
    finally { setCheckingHealth(false); }
  }

  async function handleToggle(server: McpServer) {
    const newEnabled = server.status === "disabled";
    try {
      await invoke("toggle_mcp_server", { id: server.id, enabled: newEnabled });
      const newStatus = newEnabled ? "active" : "disabled";
      setServers((prev) => prev.map((s) => s.id === server.id ? { ...s, status: newStatus } : s));
      if (selected?.id === server.id) setSelected({ ...server, status: newStatus });
    } catch (e) { console.error(e); }
  }

  async function handleDelete(server: McpServer) {
    if (!confirm(tReplace(i.mcp.confirmRemove, { name: server.name }))) return;
    try {
      await invoke("uninstall_mcp_server", { name: server.name });
      setServers((prev) => prev.filter((s) => s.id !== server.id));
      if (selected?.id === server.id) setSelected(null);
    } catch (e) { console.error(e); }
  }

  function formatJson(raw: string): string {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }

  function startEdit(server: McpServer) {
    setEditing(true);
    setSaveSuccess(false);
    setEditCommand(server.command || "");
    setEditArgs(formatJson(server.args));
    setEditEnv(formatJson(server.env));
  }

  async function handleSave() {
    if (!selected) return;
    try {
      const args = JSON.parse(editArgs);
      const env = JSON.parse(editEnv);
      await invoke("update_mcp_server_config", { name: selected.name, command: editCommand, args, env });
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadServers();
    } catch (e) {
      console.error(e);
      alert(getLocale() === "zh" ? "JSON 格式错误，请检查参数和环境变量" : "Invalid JSON format");
    }
  }

  function copyConfig() {
    if (!selected) return;
    const config = {
      command: selected.command,
      args: (() => { try { return JSON.parse(selected.args); } catch { return selected.args; } })(),
      env: (() => { try { return JSON.parse(selected.env); } catch { return selected.env; } })(),
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getHealthDot(serverId: string) {
    const h = healthResults[serverId];
    if (!h) return null;
    const color = h.status === "healthy" ? "var(--success)" : h.status === "unhealthy" ? "var(--danger)" : "var(--text-muted)";
    return (
      <span
        title={h.status === "healthy" ? i.mcp.healthy : h.status === "unhealthy" ? i.mcp.unhealthy : i.mcp.unknown}
        style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }}
      />
    );
  }

  function getSourceLabel(source: string) {
    switch (source) {
      case "official-plugin": return i.mcp.officialPlugin;
      case "community-plugin": return i.mcp.communityPlugin;
      case "claude-desktop": return i.mcp.claudeDesktop;
      case "cursor": return i.mcp.cursor;
      default: return i.mcp.local;
    }
  }

  function getSourceBadge(source: string) {
    switch (source) {
      case "official-plugin": return "badge-accent";
      case "community-plugin": return "badge-success";
      case "claude-desktop": return "badge-warning";
      case "cursor": return "badge-accent";
      default: return "badge-muted";
    }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.mcp.loading}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.mcp.title}</h2>
          <p className="page-subtitle">{tReplace(i.mcp.serverCount, { count: servers.length })}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={checkHealth} disabled={checkingHealth}>
            <Activity size={14} />{checkingHealth ? i.mcp.checking : i.mcp.checkHealth}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadServers}>
            <RefreshCw size={14} />{i.mcp.refresh}
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="card empty-state" style={{ flex: 1 }}>
          <div className="empty-icon"><Plug size={28} style={{ color: "var(--text-muted)" }} /></div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>{i.mcp.noServers}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>{i.mcp.noServersTip}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24, flex: 1, minHeight: 0 }}>
          {/* Server List */}
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }} className="stagger">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`card card-interactive ${selected?.id === server.id ? "selected" : ""}`}
                style={{ padding: "16px 20px", opacity: server.status === "disabled" ? 0.5 : 1 }}
                onClick={() => { setSelected(server); setEditing(false); setSaveSuccess(false); }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className={`dot ${server.status === "active" ? "dot-active" : server.status === "error" ? "dot-error" : "dot-disabled"}`} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{server.name}</span>
                        {server.version && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>v{server.version}</span>}
                        {getHealthDot(server.id)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`badge ${getSourceBadge(server.source)}`}>
                      {getSourceLabel(server.source)}
                    </span>
                    <div className="btn btn-ghost btn-icon-sm" onClick={(e) => { e.stopPropagation(); handleToggle(server); }} title={server.status === "disabled" ? i.mcp.enable : i.mcp.disable} style={{ cursor: "pointer" }}>
                      <div className={`toggle toggle-sm ${server.status === "disabled" ? "off" : "on"}`}><div className="toggle-knob" /></div>
                    </div>
                    <button className="btn btn-ghost btn-icon-sm" onClick={(e) => { e.stopPropagation(); setSelected(server); startEdit(server); }} title={i.mcp.edit}>
                      <Edit3 size={15} />
                    </button>
                    <button className="btn btn-danger-ghost btn-icon-sm" onClick={(e) => { e.stopPropagation(); handleDelete(server); }} title={i.mcp.remove}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {server.command && (
                  <p style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {server.command} {(() => { try { return JSON.parse(server.args).join(" "); } catch { return ""; } })()}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Detail Panel */}
          <div style={{ overflowY: "auto" }}>
            {selected ? (
              <div className="section-card" style={{ position: "sticky", top: 0 }}>
                {/* Panel Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`dot ${selected.status === "active" ? "dot-active" : selected.status === "error" ? "dot-error" : "dot-disabled"}`} />
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{selected.name}</h3>
                    {selected.version && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>v{selected.version}</span>}
                  </div>
                  {editing ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}><X size={14} />{i.mcp.cancel}</button>
                      <button className="btn btn-primary btn-sm" onClick={handleSave}><Save size={14} />{i.mcp.save}</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost btn-icon-sm" onClick={copyConfig} title="Copy config">
                        {copied ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEdit(selected)}>
                        <Edit3 size={14} />{i.mcp.editConfig}
                      </button>
                    </div>
                  )}
                </div>

                {/* Save success indicator */}
                {saveSuccess && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", borderRadius: 6, background: "var(--success-subtle)" }}>
                    <Check size={14} style={{ color: "var(--success)" }} />
                    <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 500 }}>
                      {getLocale() === "zh" ? "已保存到配置文件" : "Saved to config file"}
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {/* Status badges */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className={`badge ${selected.status === "active" ? "badge-success" : selected.status === "error" ? "badge-danger" : "badge-muted"}`}>
                      {selected.status === "active" ? i.mcp.active : i.mcp.disabled}
                    </span>
                    <span className="badge badge-muted">{selected.transport}</span>
                    <span className={`badge ${getSourceBadge(selected.source)}`}>
                      {getSourceLabel(selected.source)}
                    </span>
                  </div>

                  {/* Config Path */}
                  {selected.config_path && (
                    <div>
                      <span className="field-label">{i.mcp.configPath}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selected.config_path}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Health Status */}
                  {healthResults[selected.id] && (() => {
                    const h = healthResults[selected.id];
                    return (
                      <div>
                        <span className="field-label">{i.mcp.healthStatus}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span className={`badge ${h.status === "healthy" ? "badge-success" : h.status === "unhealthy" ? "badge-danger" : "badge-muted"}`}>
                              {h.status === "healthy" ? i.mcp.healthy : h.status === "unhealthy" ? i.mcp.unhealthy : i.mcp.unknown}
                            </span>
                            <span className={`badge ${h.command_exists ? "badge-success" : "badge-danger"}`}>
                              {i.mcp.commandExists}: {h.command_exists ? "✓" : "✗"}
                            </span>
                            {h.latency_ms != null && (
                              <span className="badge badge-muted">{i.mcp.latency}: {h.latency_ms}ms</span>
                            )}
                          </div>
                          {h.error_message && (
                            <div className="code-block" style={{ fontSize: 11, color: "var(--danger)" }}>{h.error_message}</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Command */}
                  <div>
                    <span className="field-label">{i.mcp.command}</span>
                    {editing ? (
                      <input
                        className="input"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                        value={editCommand}
                        onChange={(e) => setEditCommand(e.target.value)}
                        placeholder="npx, node, python..."
                      />
                    ) : (
                      <div className="code-block">{selected.command || i.common.na}</div>
                    )}
                  </div>

                  {/* Arguments */}
                  <div>
                    <span className="field-label">{i.mcp.arguments}</span>
                    {editing ? (
                      <CodeEditor
                        value={editArgs}
                        onChange={setEditArgs}
                        language="json"
                        minHeight={120}
                        placeholder='["arg1", "arg2"]'
                      />
                    ) : (
                      <div className="code-block" style={{ maxHeight: 180, overflowY: "auto" }}>{formatJson(selected.args)}</div>
                    )}
                  </div>

                  {/* Environment */}
                  <div>
                    <span className="field-label">{i.mcp.environment}</span>
                    {editing ? (
                      <CodeEditor
                        value={editEnv}
                        onChange={setEditEnv}
                        language="json"
                        minHeight={120}
                        placeholder='{"KEY": "value"}'
                      />
                    ) : (
                      <div className="code-block" style={{ maxHeight: 180, overflowY: "auto" }}>
                        {(() => { try { const e = JSON.parse(selected.env); return Object.keys(e).length ? JSON.stringify(e, null, 2) : i.common.na; } catch { return selected.env; } })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.mcp.selectServer}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
