import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Plus, Trash2, Edit3, X, Check, FolderOpen } from "lucide-react";
import { getLocale } from "../lib/i18n";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  base_path: string | null;
  is_active: boolean;
  created_at: string | null;
}

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPath, setNewPath] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const locale = getLocale();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setWorkspaces(await invoke<Workspace[]>("get_workspaces"));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await invoke("create_workspace", {
        name: newName.trim(),
        description: newDesc.trim() || null,
        basePath: newPath.trim() || null,
      });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewPath("");
      await load();
    } catch (e) { console.error(e); }
  }

  async function handleSwitch(id: string) {
    try {
      await invoke("switch_workspace", { id });
      await load();
    } catch (e) { console.error(e); }
  }

  async function handleDelete(ws: Workspace) {
    if (ws.is_active) return;
    if (!confirm(locale === "zh" ? `确定删除工作区 "${ws.name}"？` : `Delete workspace "${ws.name}"?`)) return;
    try {
      await invoke("delete_workspace", { id: ws.id });
      await load();
    } catch (e) { console.error(e); }
  }

  async function handleSaveEdit(ws: Workspace) {
    try {
      await invoke("update_workspace", { id: ws.id, name: editName.trim(), description: editDesc.trim() || null });
      setEditing(null);
      await load();
    } catch (e) { console.error(e); }
  }

  function startEdit(ws: Workspace) {
    setEditing(ws.id);
    setEditName(ws.name);
    setEditDesc(ws.description || "");
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{locale === "zh" ? "加载中..." : "Loading..."}</span></div>;
  }

  const activeWs = workspaces.find(w => w.is_active);

  return (
    <div className="animate-in" style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{locale === "zh" ? "工作区" : "Workspaces"}</h2>
          <p className="page-subtitle">
            {locale === "zh"
              ? `${workspaces.length} 个工作区${activeWs ? `，当前: ${activeWs.name}` : ""}`
              : `${workspaces.length} workspaces${activeWs ? `, active: ${activeWs.name}` : ""}`}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ gap: 6 }}>
          <Plus size={14} />{locale === "zh" ? "新建" : "New"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>{locale === "zh" ? "新建工作区" : "New Workspace"}</h3>
            <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowCreate(false)}><X size={14} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="input" placeholder={locale === "zh" ? "工作区名称" : "Workspace name"} value={newName} onChange={e => setNewName(e.target.value)} />
            <input className="input" placeholder={locale === "zh" ? "描述（可选）" : "Description (optional)"} value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <input className="input" placeholder={locale === "zh" ? "项目路径（可选）" : "Project path (optional)"} value={newPath} onChange={e => setNewPath(e.target.value)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName.trim()} style={{ alignSelf: "flex-end" }}>
              <Plus size={14} />{locale === "zh" ? "创建" : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Workspace List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="stagger">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={`card ${ws.is_active ? "" : "card-interactive"}`}
            style={{
              padding: "18px 22px",
              border: ws.is_active ? "1px solid var(--border-strong)" : undefined,
              background: ws.is_active ? "var(--bg-card-hover)" : undefined,
            }}
            onClick={() => !ws.is_active && handleSwitch(ws.id)}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="icon-box" style={{ background: "var(--bg-elevated)", width: 40, height: 40, borderRadius: 6 }}>
                  <Monitor size={18} style={{ color: ws.is_active ? "var(--text-primary)" : "var(--text-muted)" }} />
                </div>
                <div>
                  {editing === ws.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input className="input" style={{ fontSize: 13, padding: "4px 8px" }} value={editName} onChange={e => setEditName(e.target.value)} />
                      <input className="input" style={{ fontSize: 12, padding: "4px 8px" }} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder={locale === "zh" ? "描述" : "Description"} />
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{ws.name}</span>
                        {ws.is_active && <span className="badge badge-success" style={{ fontSize: 10 }}>{locale === "zh" ? "当前" : "Active"}</span>}
                      </div>
                      {ws.description && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{ws.description}</p>}
                      {ws.base_path && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <FolderOpen size={11} style={{ color: "var(--text-muted)" }} />
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{ws.base_path}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {editing === ws.id ? (
                  <>
                    <button className="btn btn-ghost btn-icon-sm" onClick={e => { e.stopPropagation(); setEditing(null); }}><X size={14} /></button>
                    <button className="btn btn-primary btn-icon-sm" onClick={e => { e.stopPropagation(); handleSaveEdit(ws); }}><Check size={14} /></button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-icon-sm" onClick={e => { e.stopPropagation(); startEdit(ws); }} title={locale === "zh" ? "编辑" : "Edit"}>
                      <Edit3 size={14} />
                    </button>
                    {!ws.is_active && (
                      <button className="btn btn-danger-ghost btn-icon-sm" onClick={e => { e.stopPropagation(); handleDelete(ws); }} title={locale === "zh" ? "删除" : "Delete"}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
