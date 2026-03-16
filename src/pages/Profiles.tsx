import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Plus, Save, Trash2, Check, Eye, X, ArrowRightLeft } from "lucide-react";
import { getLocale } from "../lib/i18n";
import { showToast } from "../components/Toast";
import CodeEditor from "../components/CodeEditor";

interface ConfigProfile {
  id: string;
  name: string;
  tool_id: string;
  config_snapshot: string;
  created_at: string | null;
  updated_at: string | null;
}

interface DetectedTool {
  id: string; name: string; installed: boolean;
}

export default function Profiles() {
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newTool, setNewTool] = useState("claude");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConfigProfile | null>(null);
  const [filterTool, setFilterTool] = useState("all");
  const locale = getLocale();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [pr, t] = await Promise.all([
        invoke<ConfigProfile[]>("get_config_profiles"),
        invoke<DetectedTool[]>("detect_tools"),
      ]);
      setProfiles(pr);
      setTools(t);
      const firstInstalled = t.find(x => x.installed);
      if (firstInstalled) setNewTool(firstInstalled.id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const snapshot = await invoke<string>("read_tool_config", { toolId: newTool });
      await invoke("save_config_profile", { name: newName, toolId: newTool, configSnapshot: snapshot });
      setNewName("");
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? `保存失败: ${e}` : `Save failed: ${e}`);
    }
    finally { setSaving(false); }
  }

  async function handleApply(profile: ConfigProfile) {
    const msg = locale === "zh"
      ? `确定切换到配置「${profile.name}」？\n\n这将覆盖 ${profile.tool_id} 的当前配置文件。建议先保存当前配置再切换。`
      : `Switch to profile "${profile.name}"?\n\nThis will overwrite ${profile.tool_id}'s current config file. Consider saving current config first.`;
    if (!window.confirm(msg)) return;
    setApplying(profile.id);
    try {
      await invoke("apply_config_profile", { id: profile.id });
      setApplied(profile.id);
      setTimeout(() => setApplied(null), 3000);
      await load();
    } catch (e) { console.error(e); showToast("error", String(e)); }
    finally { setApplying(null); }
  }

  async function handleDelete(profile: ConfigProfile) {
    const msg = locale === "zh" ? `确定删除配置「${profile.name}」？` : `Delete profile "${profile.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await invoke("delete_config_profile", { id: profile.id });
      if (preview?.id === profile.id) setPreview(null);
      await load();
    } catch (e) { console.error(e); }
  }

  const installedTools = tools.filter(t => t.installed);
  const filtered = filterTool === "all" ? profiles : profiles.filter(p => p.tool_id === filterTool);

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{locale === "zh" ? "加载中..." : "Loading..."}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">{locale === "zh" ? "配置切换" : "Config Profiles"}</h2>
          <p className="page-subtitle">
            {locale === "zh" ? `共 ${profiles.length} 个配置快照` : `${profiles.length} saved profiles`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} />{locale === "zh" ? "刷新" : "Refresh"}
        </button>
      </div>

      {/* Create new profile */}
      <div className="section-card" style={{ marginBottom: 20, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Plus size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {locale === "zh" ? "保存当前配置" : "Save Current Config"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            className="input"
            style={{ width: 140, fontSize: 13, padding: "8px 12px" }}
            value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
          >
            {installedTools.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input
            className="input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder={locale === "zh" ? "配置名称，例如「生产环境」「测试配置」..." : "Profile name, e.g. 'Production', 'Testing'..."}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button className="btn btn-primary btn-sm" disabled={!newName.trim() || saving} onClick={handleSave} style={{ gap: 6 }}>
            {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
            {locale === "zh" ? "保存快照" : "Save Snapshot"}
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${filterTool === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilterTool("all")}>
          {locale === "zh" ? "全部" : "All"} ({profiles.length})
        </button>
        {installedTools.map(t => {
          const count = profiles.filter(p => p.tool_id === t.id).length;
          return (
            <button key={t.id} className={`btn btn-sm ${filterTool === t.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterTool(t.id)} style={{ textTransform: "capitalize" }}>
              {t.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Profile list */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
        <div style={{ flex: preview ? 1 : 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <div className="card empty-state" style={{ flex: 1 }}>
              <div className="empty-icon"><ArrowRightLeft size={28} style={{ color: "var(--text-muted)" }} /></div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
                {locale === "zh" ? "暂无配置快照" : "No profiles yet"}
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>
                {locale === "zh" ? "选择工具并保存当前配置，随时一键切换恢复" : "Save your current config and switch between profiles anytime"}
              </p>
            </div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} className={`card card-interactive ${preview?.id === p.id ? "selected" : ""}`}
                style={{ padding: "16px 20px" }}
                onClick={() => setPreview(p)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                        <span className="badge badge-muted" style={{ fontSize: 10, textTransform: "capitalize" }}>{p.tool_id}</span>
                        {applied === p.id && <span className="badge badge-success" style={{ fontSize: 10 }}>{locale === "zh" ? "已应用" : "Applied"}</span>}
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        {p.updated_at?.replace("T", " ").slice(0, 19) || p.created_at?.replace("T", " ").slice(0, 19) || ""}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-primary btn-xs" onClick={() => handleApply(p)}
                      disabled={applying === p.id} style={{ gap: 4 }}>
                      {applying === p.id ? <div className="spinner" style={{ width: 11, height: 11 }} /> :
                       applied === p.id ? <Check size={11} /> : <ArrowRightLeft size={11} />}
                      {locale === "zh" ? "切换" : "Apply"}
                    </button>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => setPreview(p)} title={locale === "zh" ? "预览" : "Preview"}>
                      <Eye size={14} />
                    </button>
                    <button className="btn btn-danger-ghost btn-icon-sm" onClick={() => handleDelete(p)} title={locale === "zh" ? "删除" : "Delete"}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Preview panel */}
        {preview && (
          <div style={{ width: 480, overflowY: "auto", flexShrink: 0 }}>
            <div className="section-card" style={{ position: "sticky", top: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>{preview.name}</h3>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <span className="badge badge-muted" style={{ textTransform: "capitalize" }}>{preview.tool_id}</span>
                    <span className="badge badge-muted">{(preview.config_snapshot.length / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleApply(preview)} style={{ gap: 5 }}>
                    <ArrowRightLeft size={13} />{locale === "zh" ? "切换到此配置" : "Apply"}
                  </button>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => setPreview(null)}><X size={16} /></button>
                </div>
              </div>
              <CodeEditor
                value={preview.config_snapshot}
                language={preview.tool_id === "codex" ? "yaml" : "json"}
                readOnly
                minHeight={300}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
