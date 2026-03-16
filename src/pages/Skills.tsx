import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw, Zap, Package, FileText, ExternalLink, Search,
  X, FolderOpen, Monitor, Terminal, Check,
  Code, Wind, Folder, File, ChevronDown,
  Edit3, Trash2, Save, Sparkles, Globe,
} from "lucide-react";
import { t, tReplace, getLocale } from "../lib/i18n";
import type { DetectedTool, FolderNode, SkillCategory } from "../types/skills";
import CodeEditor from "../components/CodeEditor";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Skill {
  id: string; name: string; description: string | null;
  plugin_id: string | null; trigger_command: string | null; file_path: string | null;
}

interface Plugin {
  id: string; name: string; description: string | null;
  source_url: string | null; version: string | null;
}

const TOOL_ICONS: Record<string, typeof Monitor> = {
  claude: Terminal,
  cursor: Code,
  windsurf: Wind,
  codex: Monitor,
  gemini: Sparkles,
  opencode: Globe,
};

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<string>("claude");
  const [category, setCategory] = useState<SkillCategory>("all");
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [explorerPreview, setExplorerPreview] = useState<string | null>(null);
  const [explorerFile, setExplorerFile] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [syncedSkills, setSyncedSkills] = useState<Record<string, Set<string>>>({});
  const i = t();
  const locale = getLocale();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [sk, pl, dt] = await Promise.all([
        invoke<Skill[]>("scan_skills"),
        invoke<Plugin[]>("get_plugins"),
        invoke<DetectedTool[]>("detect_tools"),
      ]);
      setSkills(sk);
      setPlugins(pl);
      setTools(dt);
      // Auto-select first installed tool
      const firstInstalled = dt.find((t) => t.installed);
      if (firstInstalled) setActiveTool(firstInstalled.id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function viewSkill(skill: Skill) {
    setSelectedSkill(skill);
    setSkillContent(null);
    if (skill.file_path) {
      setLoadingContent(true);
      try {
        const content = await invoke<string>("read_skill_content", { filePath: skill.file_path });
        setSkillContent(content);
      } catch (e) { console.error(e); setSkillContent("Failed to load content"); }
      finally { setLoadingContent(false); }
    }
  }

  async function openExplorer() {
    const tool = tools.find((t) => t.id === activeTool);
    if (!tool) return;
    setShowExplorer(true);
    setExplorerPreview(null);
    setExplorerFile(null);
    try {
      const tree = await invoke<FolderNode>("get_skill_folder_tree", { baseDir: tool.skills_dir });
      setFolderTree(tree);
    } catch {
      setFolderTree(null);
    }
  }

  async function previewExplorerFile(path: string) {
    setExplorerFile(path);
    try {
      const content = await invoke<string>("read_skill_content", { filePath: path });
      setExplorerPreview(content);
    } catch {
      setExplorerPreview("Failed to load file");
    }
  }

  function startEditSkill() {
    if (!skillContent) return;
    setEditingSkill(true);
    setEditContent(skillContent);
  }

  async function handleSaveSkill() {
    if (!selectedSkill?.file_path) return;
    try {
      await invoke("write_skill_content", { filePath: selectedSkill.file_path, content: editContent });
      setSkillContent(editContent);
      setEditingSkill(false);
    } catch (e) { console.error(e); }
  }

  async function handleDeleteSkill(skill: Skill) {
    if (!skill.file_path) return;
    if (!window.confirm(locale === "zh" ? `确定删除技能 "${skill.name}"？` : `Delete skill "${skill.name}"?`)) return;
    try {
      await invoke("uninstall_skill_file", { path: skill.file_path });
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill(null);
        setSkillContent(null);
        setEditingSkill(false);
      }
      await load();
    } catch (e) { console.error(e); }
  }

  async function handleToggleSkill(skill: Skill) {
    if (!skill.file_path) return;
    const isDisabled = skill.file_path.endsWith(".disabled");
    try {
      await invoke<string>("toggle_skill_file", { filePath: skill.file_path, enabled: isDisabled });
      await load();
    } catch (e) { console.error(e); }
  }

  async function handleDeletePlugin(plugin: Plugin) {
    if (!window.confirm(locale === "zh" ? `确定删除插件 "${plugin.name}"？此操作不可恢复。` : `Delete plugin "${plugin.name}"? This cannot be undone.`)) return;
    try {
      await invoke("delete_plugin_dir", { pluginName: plugin.id });
      await invoke("uninstall_plugin", { pluginId: plugin.id });
      await load();
    } catch (e) { console.error(e); }
  }

  // Filter skills
  const filteredSkills = skills.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.description || "").toLowerCase().includes(q) && !(s.trigger_command || "").toLowerCase().includes(q)) return false;
    }
    if (category === "skill") return !s.plugin_id;
    if (category === "prompt") return (s.name + (s.description || "")).toLowerCase().includes("prompt");
    if (category === "command") return !!s.trigger_command;
    if (category === "plugin") return !!s.plugin_id;
    return true;
  });

  const filteredPlugins = plugins.filter((p) => {
    if (category === "skill" || category === "prompt" || category === "command") return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const installedTools = tools.filter((t) => t.installed);

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.skills.loading}</span></div>;
  }

  const catTabs: { key: SkillCategory; label: string; count: number }[] = [
    { key: "all", label: i.skills.categoryAll, count: skills.length + plugins.length },
    { key: "skill", label: i.skills.categorySkills, count: skills.filter(s => !s.plugin_id).length },
    { key: "prompt", label: i.skills.categoryPrompts, count: skills.filter(s => (s.name + (s.description || "")).toLowerCase().includes("prompt")).length },
    { key: "command", label: i.skills.categoryCommands, count: skills.filter(s => !!s.trigger_command).length },
    { key: "plugin", label: i.skills.categoryPlugins, count: plugins.length },
  ];

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.skills.title}</h2>
          <p className="page-subtitle">
            {tReplace(i.skills.totalSkills, { count: skills.length + plugins.length })}
            {installedTools.length > 0 && ` · ${tReplace(i.skills.toolCount, { count: installedTools.length })}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={openExplorer} style={{ gap: 6 }}>
            <FolderOpen size={14} />{i.skills.explore}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} />{i.common.refresh}</button>
        </div>
      </div>

      {/* Tool Selector */}
      {tools.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool.id] || Monitor;
            const isActive = activeTool === tool.id;
            return (
              <div key={tool.id} style={{ position: "relative" }}>
                <button
                  className={`btn btn-sm ${isActive ? "btn-primary" : tool.installed ? "btn-secondary" : "btn-ghost"}`}
                  onClick={() => tool.installed && setActiveTool(tool.id)}
                  style={{ gap: 6, opacity: tool.installed ? 1 : 0.5, cursor: tool.installed ? "pointer" : "default" }}
                  title={tool.installed ? tool.name : (locale === "zh" ? `${tool.name} 未安装` : `${tool.name} not installed`)}
                >
                  <Icon size={14} />
                  {tool.name}
                  {!tool.installed && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }} />
                  )}
                </button>
              </div>
            );
          })}
          {/* Uninstalled tool hints */}
          {tools.filter(t => !t.installed).length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
              {locale === "zh" ? "红点 = 未安装" : "red dot = not installed"}
            </span>
          )}
        </div>
      )}

      {/* Search + Category Tabs */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: 40 }}
            placeholder={i.skills.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="btn btn-ghost btn-icon-sm"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}
              onClick={() => setSearch("")}
            ><X size={14} /></button>
          )}
        </div>
        <div className="tab-bar" style={{ flexShrink: 0, overflow: "auto" }}>
          {catTabs.map((cat) => (
            <button
              key={cat.key}
              className={`tab-item ${category === cat.key ? "active" : ""}`}
              onClick={() => { setCategory(cat.key); setSelectedSkill(null); setSkillContent(null); }}
              disabled={cat.count === 0 && cat.key !== "all"}
              style={{ display: "flex", alignItems: "center", gap: 5, opacity: cat.count === 0 && cat.key !== "all" ? 0.4 : 1 }}
            >
              {cat.label}
              <span style={{ fontSize: 11, opacity: 0.7 }}>({cat.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 24 }}>
        {/* List */}
        <div style={{ flex: selectedSkill ? 1.2 : 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Skills */}
          {filteredSkills.length > 0 && (
            <div className="stagger">
              {(category === "all" && filteredPlugins.length > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 4 }}>
                  <Zap size={14} style={{ color: "var(--warning)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {i.skills.categorySkills} ({filteredSkills.length})
                  </span>
                </div>
              )}
              {filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className={`card card-interactive ${selectedSkill?.id === skill.id ? "selected" : ""}`}
                  style={{ padding: "14px 18px", marginBottom: 6, opacity: skill.file_path?.endsWith(".disabled") ? 0.5 : 1 }}
                  onClick={() => viewSkill(skill)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      <div className="icon-box" style={{ background: "var(--warning-subtle)", width: 34, height: 34, borderRadius: 6 }}>
                        <Zap size={15} style={{ color: "var(--warning)" }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{skill.name}</span>
                          {skill.plugin_id && <span className="badge badge-muted" style={{ fontSize: 10 }}>{skill.plugin_id}</span>}
                          {skill.file_path?.endsWith(".disabled") && (
                            <span className="badge badge-muted" style={{ fontSize: 10 }}>{locale === "zh" ? "已禁用" : "Disabled"}</span>
                          )}
                        </div>
                        {skill.description && (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{skill.description}</p>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {skill.trigger_command && (
                        <code className="badge badge-accent" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{skill.trigger_command}</code>
                      )}
                      {skill.file_path && (
                        <>
                          <div className="btn btn-ghost btn-icon-sm" onClick={(e) => { e.stopPropagation(); handleToggleSkill(skill); }}
                            title={skill.file_path.endsWith(".disabled") ? (locale === "zh" ? "启用" : "Enable") : (locale === "zh" ? "禁用" : "Disable")} style={{ cursor: "pointer" }}>
                            <div className={`toggle toggle-sm ${skill.file_path.endsWith(".disabled") ? "off" : "on"}`}><div className="toggle-knob" /></div>
                          </div>
                          <button className="btn btn-danger-ghost btn-icon-sm" onClick={(e) => { e.stopPropagation(); handleDeleteSkill(skill); }}
                            title={locale === "zh" ? "删除" : "Delete"}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Plugins */}
          {filteredPlugins.length > 0 && (
            <div className="stagger">
              {category === "all" && filteredSkills.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, marginTop: 8, paddingLeft: 4 }}>
                  <Package size={14} style={{ color: "var(--success)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {i.skills.categoryPlugins} ({filteredPlugins.length})
                  </span>
                </div>
              )}
              {filteredPlugins.map((plugin) => (
                <div key={plugin.id} className="card card-hover" style={{ padding: "14px 18px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      <div className="icon-box" style={{ background: "var(--success-subtle)", width: 34, height: 34, borderRadius: 6 }}>
                        <Package size={15} style={{ color: "var(--success)" }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{plugin.name}</span>
                          {plugin.version && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>v{plugin.version}</span>}
                        </div>
                        {plugin.description && (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plugin.description}</p>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {plugin.source_url && (
                        <span className="badge badge-accent" style={{ gap: 5 }}>
                          <ExternalLink size={11} />GitHub
                        </span>
                      )}
                      <button className="btn btn-danger-ghost btn-icon-sm" onClick={() => handleDeletePlugin(plugin)}
                        title={locale === "zh" ? "删除" : "Delete"}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {filteredSkills.length === 0 && filteredPlugins.length === 0 && (
            <div className="card empty-state" style={{ flex: 1 }}>
              <div className="empty-icon"><Zap size={28} style={{ color: "var(--text-muted)" }} /></div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
                {search ? (locale === "zh" ? "未找到匹配结果" : "No results found") : i.skills.noSkills}
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>
                {search ? (locale === "zh" ? "尝试其他关键词" : "Try different keywords") : i.skills.noSkillsTip}
              </p>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedSkill && (
          <div style={{ width: 520, overflowY: "auto", flexShrink: 0 }}>
            <div className="section-card" style={{ position: "sticky", top: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="icon-box" style={{ background: "var(--warning-subtle)", width: 42, height: 42, borderRadius: 8 }}>
                    <Zap size={20} style={{ color: "var(--warning)" }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{selectedSkill.name}</h3>
                    {selectedSkill.plugin_id && <span className="badge badge-muted" style={{ marginTop: 4 }}>{selectedSkill.plugin_id}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {selectedSkill.file_path && !editingSkill && (
                    <>
                      <div className="btn btn-ghost btn-icon-sm" onClick={() => handleToggleSkill(selectedSkill)}
                        title={selectedSkill.file_path.endsWith(".disabled") ? (locale === "zh" ? "启用" : "Enable") : (locale === "zh" ? "禁用" : "Disable")} style={{ cursor: "pointer" }}>
                        <div className={`toggle toggle-sm ${selectedSkill.file_path.endsWith(".disabled") ? "off" : "on"}`}><div className="toggle-knob" /></div>
                      </div>
                      <button className="btn btn-ghost btn-icon-sm" onClick={() => handleDeleteSkill(selectedSkill)}
                        title={locale === "zh" ? "删除" : "Delete"}>
                        <Trash2 size={15} style={{ color: "var(--danger)" }} />
                      </button>
                    </>
                  )}
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => { setSelectedSkill(null); setEditingSkill(false); }}><X size={16} /></button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
                {selectedSkill.description && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{selectedSkill.description}</p>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {selectedSkill.trigger_command && (
                    <div>
                      <span className="field-label">{locale === "zh" ? "触发命令" : "Trigger"}</span>
                      <code className="badge badge-accent" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{selectedSkill.trigger_command}</code>
                    </div>
                  )}
                  {selectedSkill.plugin_id && (
                    <div>
                      <span className="field-label">{locale === "zh" ? "来源插件" : "Plugin"}</span>
                      <span className="badge badge-muted">{selectedSkill.plugin_id}</span>
                    </div>
                  )}
                </div>
                {selectedSkill.file_path && (
                  <div>
                    <span className="field-label">{locale === "zh" ? "文件路径" : "File Path"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <FileText size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedSkill.file_path}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Sync to other tools */}
              {selectedSkill.file_path && (
                <div style={{ marginBottom: 18 }}>
                  <span className="field-label">{locale === "zh" ? "同步到工具" : "Sync to tools"}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tools.map((tool) => {
                      const Icon = TOOL_ICONS[tool.id] || Monitor;
                      const isSynced = syncedSkills[selectedSkill.id]?.has(tool.id) || false;
                      const isCurrent = tool.id === activeTool;
                      return (
                        <button
                          key={tool.id}
                          className={`btn btn-xs ${isSynced ? "btn-ghost" : isCurrent ? "btn-ghost" : tool.installed ? "btn-secondary" : "btn-ghost"}`}
                          style={{ gap: 5, opacity: tool.installed ? 1 : 0.4 }}
                          disabled={!tool.installed || isCurrent}
                          title={!tool.installed ? (locale === "zh" ? "未安装" : "Not installed") : isCurrent ? (locale === "zh" ? "当前工具" : "Current tool") : ""}
                          onClick={async () => {
                            try {
                              await invoke("copy_skill_between_tools", { path: selectedSkill.file_path, targetSkillsDir: tool.skills_dir });
                              setSyncedSkills(prev => {
                                const next = { ...prev };
                                if (!next[selectedSkill.id]) next[selectedSkill.id] = new Set();
                                next[selectedSkill.id] = new Set([...next[selectedSkill.id], tool.id]);
                                return next;
                              });
                            } catch (e) { console.error(e); }
                          }}
                        >
                          {isSynced ? <Check size={11} style={{ color: "var(--success)" }} /> : <Icon size={12} />}
                          {tool.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="field-label" style={{ marginBottom: 0 }}>{locale === "zh" ? "技能内容" : "Content"}</span>
                  {selectedSkill.file_path && skillContent && (
                    <button className="btn btn-secondary btn-xs" onClick={startEditSkill} style={{ gap: 5 }}>
                      <Edit3 size={12} />{locale === "zh" ? "编辑" : "Edit"}
                    </button>
                  )}
                </div>
                {loadingContent ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, justifyContent: "center" }}>
                    <div className="spinner" style={{ width: 18, height: 18 }} />
                  </div>
                ) : skillContent ? (
                  <div className="markdown-preview" style={{ maxHeight: 500, overflowY: "auto", fontSize: 13, lineHeight: 1.8 }}>
                    <Markdown remarkPlugins={[remarkGfm]}>{skillContent}</Markdown>
                  </div>
                ) : (
                  <div className="code-block" style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>
                    {locale === "zh" ? "无可用内容" : "No content available"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Explorer Modal */}
      {showExplorer && (
        <div
          style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowExplorer(false)}
        >
          <div
            className="section-card"
            style={{ width: 800, height: "70vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FolderOpen size={18} style={{ color: "var(--text-secondary)" }} />
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>{i.skills.explorerTitle}</h3>
              </div>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowExplorer(false)}><X size={16} /></button>
            </div>

            <div style={{ flex: 1, display: "flex", gap: 16, minHeight: 0 }}>
              {/* Tree */}
              <div style={{ width: 280, overflowY: "auto", borderRight: "1px solid var(--border-default)", paddingRight: 16 }}>
                {folderTree ? (
                  <TreeNode node={folderTree} onSelect={previewExplorerFile} selectedPath={explorerFile} />
                ) : (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
                    {locale === "zh" ? "目录不存在" : "Directory not found"}
                  </p>
                )}
              </div>
              {/* Preview */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {explorerPreview ? (
                  <div className="code-block" style={{ height: "100%", fontSize: 11, lineHeight: 1.7 }}>{explorerPreview}</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 }}>
                    {i.skills.noPreview}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Markdown Editor Modal */}
      {editingSkill && selectedSkill && (
        <div
          style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setEditingSkill(false)}
        >
          <div
            className="section-card"
            style={{ width: "90vw", maxWidth: 1200, height: "80vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Edit3 size={16} style={{ color: "var(--text-secondary)" }} />
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>{selectedSkill.name}</h3>
                <span className="badge badge-muted">{locale === "zh" ? "编辑模式" : "Editing"}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingSkill(false)}><X size={14} />{locale === "zh" ? "取消" : "Cancel"}</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveSkill}><Save size={14} />{locale === "zh" ? "保存" : "Save"}</button>
              </div>
            </div>
            {/* Split panes */}
            <div style={{ flex: 1, display: "flex", gap: 16, minHeight: 0 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Markdown
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <CodeEditor
                    value={editContent}
                    onChange={setEditContent}
                    language="markdown"
                    minHeight={200}
                  />
                </div>
              </div>
              <div style={{ width: 1, background: "var(--border-default)" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {locale === "zh" ? "预览" : "Preview"}
                </div>
                <div className="markdown-preview" style={{ flex: 1, overflowY: "auto", fontSize: 13, lineHeight: 1.8, minHeight: 0 }}>
                  <Markdown remarkPlugins={[remarkGfm]}>{editContent}</Markdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, onSelect, selectedPath, depth = 0 }: {
  node: FolderNode; onSelect: (path: string) => void; selectedPath: string | null; depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (node.is_dir) {
    return (
      <div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", paddingLeft: depth * 16 + 8,
            cursor: "pointer", borderRadius: 4, fontSize: 13, color: "var(--text-secondary)",
          }}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={13} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }} />
          <Folder size={14} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
        </div>
        {open && node.children.map((child) => (
          <TreeNode key={child.path} node={child} onSelect={onSelect} selectedPath={selectedPath} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", paddingLeft: depth * 16 + 28,
        cursor: "pointer", borderRadius: 4, fontSize: 13,
        color: selectedPath === node.path ? "var(--text-primary)" : "var(--text-muted)",
        background: selectedPath === node.path ? "var(--bg-card-hover)" : "transparent",
      }}
      onClick={() => onSelect(node.path)}
    >
      <File size={13} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
    </div>
  );
}
