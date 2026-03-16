import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Plus, Trash2, X, Save, Shield } from "lucide-react";
import { getLocale } from "../lib/i18n";

interface McpClient {
  id: string;
  name: string;
  config_path: string;
  server_access: Record<string, boolean>;
  created_at: string | null;
}

interface McpServer {
  id: string;
  name: string;
  status: string;
}

export default function McpClients() {
  const [clients, setClients] = useState<McpClient[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<McpClient | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConfigPath, setNewConfigPath] = useState("");
  const [editing, setEditing] = useState(false);
  const [editAccess, setEditAccess] = useState<Record<string, boolean>>({});
  const locale = getLocale();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        invoke<McpClient[]>("get_mcp_clients"),
        invoke<McpServer[]>("scan_mcp_servers"),
      ]);
      setClients(c);
      setServers(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await invoke("create_mcp_client", { name: newName.trim(), configPath: newConfigPath.trim() || null });
      setShowCreate(false);
      setNewName("");
      setNewConfigPath("");
      await load();
    } catch (e) { console.error(e); }
  }

  async function handleDelete(client: McpClient) {
    if (!confirm(locale === "zh" ? `确定删除客户端 "${client.name}"？` : `Delete client "${client.name}"?`)) return;
    try {
      await invoke("delete_mcp_client", { id: client.id });
      if (selected?.id === client.id) setSelected(null);
      await load();
    } catch (e) { console.error(e); }
  }

  function startEdit(client: McpClient) {
    setEditing(true);
    const access: Record<string, boolean> = {};
    for (const s of servers) {
      access[s.id] = client.server_access[s.id] ?? true;
    }
    setEditAccess(access);
  }

  async function handleSaveAccess() {
    if (!selected) return;
    try {
      await invoke("update_mcp_client_access", { id: selected.id, serverAccess: editAccess });
      setEditing(false);
      await load();
      // Re-select updated client
      const updated = (await invoke<McpClient[]>("get_mcp_clients")).find(c => c.id === selected.id);
      if (updated) setSelected(updated);
    } catch (e) { console.error(e); }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{locale === "zh" ? "加载中..." : "Loading..."}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{locale === "zh" ? "MCP 客户端" : "MCP Clients"}</h2>
          <p className="page-subtitle">{locale === "zh" ? `管理 ${clients.length} 个 AI 客户端应用的 MCP 访问权限` : `Manage MCP access for ${clients.length} AI client apps`}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ gap: 6 }}>
          <Plus size={14} />{locale === "zh" ? "添加客户端" : "Add Client"}
        </button>
      </div>

      {clients.length === 0 && !showCreate ? (
        <div className="card empty-state" style={{ flex: 1 }}>
          <div className="empty-icon"><Monitor size={28} style={{ color: "var(--text-muted)" }} /></div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
            {locale === "zh" ? "尚未添加客户端" : "No clients added"}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>
            {locale === "zh" ? "添加 AI 客户端应用以管理其对 MCP 服务器的访问权限" : "Add AI client apps to manage their MCP server access"}
          </p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
            <Plus size={14} />{locale === "zh" ? "添加客户端" : "Add Client"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1, minHeight: 0 }}>
          {/* Client List */}
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }} className="stagger">
            {/* Create form */}
            {showCreate && (
              <div className="section-card" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>{locale === "zh" ? "新建客户端" : "New Client"}</h3>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowCreate(false)}><X size={14} /></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="input" placeholder={locale === "zh" ? "客户端名称（如 Claude Desktop）" : "Client name (e.g. Claude Desktop)"} value={newName} onChange={e => setNewName(e.target.value)} />
                  <input className="input" placeholder={locale === "zh" ? "配置文件路径（可选）" : "Config file path (optional)"} value={newConfigPath} onChange={e => setNewConfigPath(e.target.value)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                  <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName.trim()} style={{ alignSelf: "flex-end" }}>
                    <Plus size={14} />{locale === "zh" ? "创建" : "Create"}
                  </button>
                </div>
              </div>
            )}

            {clients.map(client => {
              const accessCount = Object.values(client.server_access).filter(Boolean).length;
              return (
                <div
                  key={client.id}
                  className={`card card-interactive ${selected?.id === client.id ? "selected" : ""}`}
                  style={{ padding: "16px 20px" }}
                  onClick={() => { setSelected(client); setEditing(false); }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div className="icon-box" style={{ background: "var(--bg-elevated)", width: 36, height: 36, borderRadius: 6 }}>
                        <Monitor size={16} style={{ color: "var(--text-secondary)" }} />
                      </div>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{client.name}</span>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {locale === "zh" ? `可访问 ${accessCount}/${servers.length} 个服务器` : `${accessCount}/${servers.length} servers accessible`}
                        </p>
                      </div>
                    </div>
                    <button className="btn btn-danger-ghost btn-icon-sm" onClick={e => { e.stopPropagation(); handleDelete(client); }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail Panel */}
          <div style={{ overflowY: "auto" }}>
            {selected ? (
              <div className="section-card" style={{ position: "sticky", top: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Monitor size={18} style={{ color: "var(--text-secondary)" }} />
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{selected.name}</h3>
                  </div>
                  {editing ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}><X size={14} />{locale === "zh" ? "取消" : "Cancel"}</button>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveAccess}><Save size={14} />{locale === "zh" ? "保存" : "Save"}</button>
                    </div>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(selected)}>
                      <Shield size={14} />{locale === "zh" ? "管理权限" : "Manage Access"}
                    </button>
                  )}
                </div>

                {selected.config_path && (
                  <div style={{ marginBottom: 18 }}>
                    <span className="field-label">{locale === "zh" ? "配置路径" : "Config Path"}</span>
                    <div className="code-block" style={{ fontSize: 11 }}>{selected.config_path}</div>
                  </div>
                )}

                <div>
                  <span className="field-label">{locale === "zh" ? "服务器访问权限" : "Server Access"}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {servers.map(server => {
                      const hasAccess = editing ? (editAccess[server.id] ?? true) : (selected.server_access[server.id] ?? true);
                      return (
                        <div key={server.id} className="list-row" style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span className={`dot ${server.status === "active" ? "dot-active" : "dot-disabled"}`} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{server.name}</span>
                          </div>
                          {editing ? (
                            <button
                              className={`toggle ${hasAccess ? "on" : "off"}`}
                              onClick={() => setEditAccess(prev => ({ ...prev, [server.id]: !hasAccess }))}
                              style={{ width: 36, height: 20 }}
                            >
                              <div className="toggle-knob" style={{ width: 14, height: 14, top: 3 }} />
                            </button>
                          ) : (
                            <span className={`badge ${hasAccess ? "badge-success" : "badge-muted"}`} style={{ fontSize: 10 }}>
                              {hasAccess ? (locale === "zh" ? "允许" : "Allowed") : (locale === "zh" ? "拒绝" : "Denied")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{locale === "zh" ? "选择一个客户端查看详情" : "Select a client to view details"}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
