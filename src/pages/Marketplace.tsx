import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import {
  Store, Search, Download, CheckCircle, X, ExternalLink, Key, Check,
  Plug, Zap, Plus, Globe, Languages, Tag, Edit3, Trash2, Save,
} from "lucide-react";
import { t } from "../lib/i18n";
import { showToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import CodeEditor from "../components/CodeEditor";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface RegistryEntry {
  id: string; name: string; description: string; category: string;
  install_type: string; package_name: string | null; github_url: string | null;
  command: string; args: string[]; env_keys: string[]; source: string;
}

interface SkillEntry {
  id: string; name: string; description: string; description_zh: string | null;
  category: string; author: string | null; github_url: string | null;
  cover_url: string | null; tags: string[]; content: string;
}

type MarketTab = "mcp" | "skills";

type McpCategory = "all" | "installed" | "search" | "database" | "ai" | "dev-tools" | "browser" | "filesystem" | "cloud" | "productivity";
type SkillCategory = "all" | "installed" | "development" | "testing" | "documentation" | "devops" | "ai-ml" | "security" | "backend";

const MCP_CATEGORY_ZH: Record<string, string> = {
  local: "本地", search: "搜索", database: "数据库", ai: "AI",
  "dev-tools": "开发工具", browser: "浏览器", filesystem: "文件系统",
  cloud: "云服务", productivity: "效率", npm: "npm",
  "official-plugin": "官方插件", "community-plugin": "社区插件",
};

export default function Marketplace() {
  const [tab, setTab] = useState<MarketTab>("mcp");
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [skillEntries, setSkillEntries] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mcpCategory, setMcpCategory] = useState<McpCategory>("all");
  const [skillCategory, setSkillCategory] = useState<SkillCategory>("all");
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);
  const [showEnvModal, setShowEnvModal] = useState<RegistryEntry | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showTranslation, setShowTranslation] = useState(true);
  const [showCustomSource, setShowCustomSource] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [customSources, setCustomSources] = useState<{ url: string; count: number; skillIds: string[] }[]>([]);
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null);
  const [mcpPage, setMcpPage] = useState(0);
  const [mcpTotal, setMcpTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previewMcp, setPreviewMcp] = useState<RegistryEntry | null>(null);
  const [previewSkill, setPreviewSkill] = useState<SkillEntry | null>(null);
  const [editingPreview, setEditingPreview] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [pendingUninstall, setPendingUninstall] = useState<SkillEntry | null>(null);
  const i = t();
  const locale = localStorage.getItem("cchub-locale") || "zh";

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Load installed MCP servers
      try {
        const servers = await invoke<{ id: string; name: string }[]>("scan_mcp_servers");
        setInstalledIds(new Set(servers.flatMap(s => [s.id, s.name])));
        const scannedEntries: RegistryEntry[] = servers.map(s => ({
          id: (s as any).id, name: (s as any).name,
          description: (s as any).command ? `${(s as any).command} ${(() => { try { return JSON.parse((s as any).args || "[]").join(" "); } catch { return ""; } })()}` : "",
          category: (s as any).source || "local", install_type: "local", package_name: null,
          github_url: null, command: (s as any).command || "", args: (() => { try { return JSON.parse((s as any).args || "[]"); } catch { return []; } })(),
          env_keys: (() => { try { return Object.keys(JSON.parse((s as any).env || "{}")); } catch { return []; } })(), source: "local",
        }));
        setEntries(scannedEntries);
      } catch { /* ignore */ }

      // Load installed skills
      try {
        const skills = await invoke<{ id: string; name: string }[]>("scan_skills");
        setInstalledSkills(new Set(skills.map(s => s.name.toLowerCase())));
      } catch { /* ignore */ }

      // Load skills from SkillHub API (default source)
      try {
        const result = await invoke<{ skills: SkillEntry[]; total: number }>("get_skillhub_catalog", { page: 1, limit: 50, category: "" });
        setSkillEntries(result.skills || []);
      } catch (e) {
        console.warn("SkillHub API failed, skills will be empty:", e);
        setSkillEntries([]);
      }

      // Load npm MCP entries (page 0)
      try {
        const result = await invoke<{ entries: RegistryEntry[]; total: number }>("search_marketplace", { query: "mcp server", page: 0, pageSize: 50 });
        setEntries(prev => {
          const ids = new Set(prev.map(e => e.id));
          return [...prev, ...result.entries.filter(e => !ids.has(e.id))];
        });
        setMcpTotal(result.total);
        setMcpPage(0);
      } catch { /* ignore */ }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSearch() {
    if (!search.trim()) { loadAll(); return; }
    setLoading(true);
    try {
      if (tab === "mcp") {
        const result = await invoke<{ entries: RegistryEntry[]; total: number }>("search_marketplace", { query: search, page: 0, pageSize: 50 });
        setEntries(result.entries);
        setMcpTotal(result.total);
        setMcpPage(0);
      } else {
        // Search skills via SkillHub API
        const results = await invoke<SkillEntry[]>("search_skillhub_skills", { query: search, limit: 30 });
        setSkillEntries(results);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleInstallMcp(entry: RegistryEntry) {
    if (entry.env_keys.length > 0) {
      const vals: Record<string, string> = {};
      entry.env_keys.forEach(k => vals[k] = "");
      setEnvValues(vals);
      setShowEnvModal(entry);
      return;
    }
    await doInstallMcp(entry, {});
  }

  async function doInstallMcp(entry: RegistryEntry, envVals: Record<string, string>) {
    setInstalling(entry.id);
    setShowEnvModal(null);
    try {
      await invoke("install_from_marketplace", {
        name: entry.name, command: entry.command, args: entry.args, envValues: envVals,
      });
      setInstalledIds(prev => new Set([...prev, entry.name, entry.id]));
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? "安装失败" : "Installation failed");
    }
    finally { setInstalling(null); }
  }

  async function handleInstallSkill(skill: SkillEntry) {
    setInstalling(skill.id);
    try {
      await invoke<string>("install_skill_from_marketplace", {
        name: skill.id, content: skill.content, targetDir: null,
      });
      setInstalledSkills(prev => new Set([...prev, skill.name.toLowerCase()]));
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? "安装失败" : "Installation failed");
    }
    finally { setInstalling(null); }
  }

  async function handleUninstallSkill(skill: SkillEntry) {
    setPendingUninstall(skill);
  }
  async function doUninstallSkill(skill: SkillEntry) {
    try {
      const skills = await invoke<{ name: string; file_path: string | null }[]>("scan_skills");
      const installed = skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase() || s.name.toLowerCase() === skill.id.toLowerCase());
      if (installed?.file_path) {
        await invoke("uninstall_skill_file", { path: installed.file_path });
        setInstalledSkills(prev => {
          const next = new Set(prev);
          next.delete(skill.name.toLowerCase());
          return next;
        });
      }
    } catch (e) { console.error(e); }
  }

  async function handleSaveSkillContent() {
    if (!previewSkill) return;
    try {
      // Find the installed file path
      const skills = await invoke<{ name: string; file_path: string | null }[]>("scan_skills");
      const installed = skills.find(s => s.name.toLowerCase() === previewSkill.name.toLowerCase() || s.name.toLowerCase() === previewSkill.id.toLowerCase());
      if (installed?.file_path) {
        await invoke("write_skill_content", { filePath: installed.file_path, content: editContent });
      }
      setEditingPreview(false);
    } catch (e) { console.error(e); }
  }

  async function handleCustomSource() {
    if (!customUrl.trim()) return;
    setLoadingCustom(true);
    try {
      const custom = await invoke<SkillEntry[]>("fetch_custom_skill_source", { url: customUrl.trim() });
      const newIds: string[] = [];
      setSkillEntries(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newEntries = custom.filter(s => !existingIds.has(s.id));
        newEntries.forEach(s => newIds.push(s.id));
        return [...prev, ...newEntries];
      });
      setCustomSources(prev => [...prev, { url: customUrl.trim(), count: newIds.length, skillIds: newIds }]);
      setCustomUrl("");
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? "加载失败，请检查 URL 格式" : "Failed to load. Check URL format.");
    }
    finally { setLoadingCustom(false); }
  }

  function removeCustomSource(index: number) {
    const source = customSources[index];
    if (!source) return;
    const idsToRemove = new Set(source.skillIds);
    setSkillEntries(prev => prev.filter(s => !idsToRemove.has(s.id)));
    setCustomSources(prev => prev.filter((_, i) => i !== index));
  }

  const mcpCategories: { key: McpCategory; label: string }[] = [
    { key: "all", label: locale === "zh" ? "全部" : "All" },
    { key: "installed", label: locale === "zh" ? "已安装" : "Installed" },
    { key: "search", label: locale === "zh" ? "搜索" : "Search" },
    { key: "database", label: locale === "zh" ? "数据库" : "Database" },
    { key: "ai", label: "AI" },
    { key: "dev-tools", label: locale === "zh" ? "开发工具" : "Dev Tools" },
    { key: "browser", label: locale === "zh" ? "浏览器" : "Browser" },
    { key: "filesystem", label: locale === "zh" ? "文件系统" : "Filesystem" },
    { key: "cloud", label: locale === "zh" ? "云服务" : "Cloud" },
    { key: "productivity", label: locale === "zh" ? "效率" : "Productivity" },
  ];

  const skillCategories: { key: SkillCategory; label: string }[] = [
    { key: "all", label: locale === "zh" ? "全部" : "All" },
    { key: "installed", label: locale === "zh" ? "已安装" : "Installed" },
    { key: "development", label: locale === "zh" ? "开发" : "Development" },
    { key: "testing", label: locale === "zh" ? "测试" : "Testing" },
    { key: "documentation", label: locale === "zh" ? "文档" : "Docs" },
    { key: "devops", label: "DevOps" },
    { key: "ai-ml", label: "AI/ML" },
    { key: "security", label: locale === "zh" ? "安全" : "Security" },
    { key: "backend", label: locale === "zh" ? "后端" : "Backend" },
  ];

  const filteredMcp = entries.filter(e => {
    if (mcpCategory === "installed") {
      if (!installedIds.has(e.name) && !installedIds.has(e.id)) return false;
    } else if (mcpCategory !== "all" && e.category !== mcpCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.name.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredSkills = skillEntries.filter(s => {
    if (skillCategory === "installed") {
      if (!installedSkills.has(s.name.toLowerCase())) return false;
    } else if (skillCategory !== "all" && s.category !== skillCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q) && !(s.description_zh || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.marketplace.loading}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.marketplace.title}</h2>
          <p className="page-subtitle">{i.marketplace.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "skills" && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCustomSource(true)} style={{ gap: 6 }}>
              <Plus size={14} />{locale === "zh" ? "自定义源" : "Custom Source"}
            </button>
          )}
        </div>
      </div>

      {/* Tab Switch: MCP Servers / Skills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`btn btn-sm ${tab === "mcp" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setTab("mcp"); setSearch(""); }}
          style={{ gap: 6 }}
        >
          <Plug size={14} />{locale === "zh" ? "MCP 服务" : "MCP Servers"}
          <span style={{ fontSize: 11, opacity: 0.7 }}>({entries.length})</span>
        </button>
        <button
          className={`btn btn-sm ${tab === "skills" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => { setTab("skills"); setSearch(""); }}
          style={{ gap: 6 }}
        >
          <Zap size={14} />{locale === "zh" ? "技能" : "Skills"}
          <span style={{ fontSize: 11, opacity: 0.7 }}>({skillEntries.length})</span>
        </button>
      </div>

      {/* Search + Categories */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 400, display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="input"
              style={{ paddingLeft: 40, paddingRight: search ? 36 : 12 }}
              placeholder={tab === "mcp" ? i.marketplace.searchPlaceholder : (locale === "zh" ? "搜索技能..." : "Search skills...")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
            {search && (
              <button
                className="btn btn-ghost btn-icon-sm"
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}
                onClick={() => { setSearch(""); if (tab === "mcp") loadAll(); }}
              ><X size={14} /></button>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSearch} style={{ flexShrink: 0, gap: 5 }}>
            <Search size={13} />{locale === "zh" ? "搜索" : "Search"}
          </button>
        </div>
        <div className="tab-bar" style={{ flexWrap: "wrap" }}>
          {(tab === "mcp" ? mcpCategories : skillCategories).map(cat => (
            <button
              key={cat.key}
              className={`tab-item ${(tab === "mcp" ? mcpCategory : skillCategory) === cat.key ? "active" : ""}`}
              onClick={() => tab === "mcp" ? setMcpCategory(cat.key as McpCategory) : setSkillCategory(cat.key as SkillCategory)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {tab === "mcp" ? (
          /* MCP Servers Grid */
          filteredMcp.length === 0 ? (
            <EmptyState icon={Store} text={i.marketplace.noResults} sub={i.marketplace.noResultsTip} />
          ) : (
            <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }} className="stagger">
              {filteredMcp.map(entry => {
                const isInstalled = installedIds.has(entry.name) || installedIds.has(entry.id);
                const isInstalling = installing === entry.id;
                return (
                  <div key={entry.id} className="card card-hover" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, cursor: "pointer" }}
                    onClick={() => setPreviewMcp(entry)}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{entry.name}</span>
                          <span className="badge badge-muted" style={{ fontSize: 10 }}>{locale === "zh" ? (MCP_CATEGORY_ZH[entry.category] || entry.category) : entry.category}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {entry.description}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {entry.package_name && <span className="badge badge-muted" style={{ fontSize: 10 }}>{entry.install_type}</span>}
                        {entry.env_keys.length > 0 && (
                          <span className="badge badge-warning" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                            <Key size={10} />{entry.env_keys.length} {locale === "zh" ? "密钥" : "keys"}
                          </span>
                        )}
                        {entry.github_url && (
                          <button className="badge badge-accent"
                            style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, cursor: "pointer", border: "none", background: "var(--accent-subtle)" }}
                            onClick={e => { e.stopPropagation(); shellOpen(entry.github_url!); }}>
                            <ExternalLink size={10} />GitHub
                          </button>
                        )}
                      </div>
                      {isInstalled ? (
                        <span className="badge badge-success" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle size={12} />{i.marketplace.installed}
                        </span>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); handleInstallMcp(entry); }} disabled={isInstalling}>
                          <Download size={13} />{isInstalling ? i.marketplace.installing : i.marketplace.install}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {mcpTotal > 50 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "20px 0" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={mcpPage === 0 || loadingMore}
                  onClick={async () => {
                    setLoadingMore(true);
                    try {
                      const prevPage = mcpPage - 1;
                      const result = await invoke<{ entries: RegistryEntry[]; total: number }>("search_marketplace", {
                        query: search || "mcp server", page: prevPage, pageSize: 50,
                      });
                      setEntries(result.entries);
                      setMcpPage(prevPage);
                      setMcpTotal(result.total);
                    } catch (e) { console.error(e); }
                    finally { setLoadingMore(false); }
                  }}
                >
                  {locale === "zh" ? "上一页" : "Prev"}
                </button>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {locale === "zh"
                    ? `第 ${mcpPage + 1} / ${Math.ceil(mcpTotal / 50)} 页（共 ${mcpTotal} 个）`
                    : `Page ${mcpPage + 1} / ${Math.ceil(mcpTotal / 50)} (${mcpTotal} total)`}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={(mcpPage + 1) * 50 >= mcpTotal || loadingMore}
                  onClick={async () => {
                    setLoadingMore(true);
                    try {
                      const nextPage = mcpPage + 1;
                      const result = await invoke<{ entries: RegistryEntry[]; total: number }>("search_marketplace", {
                        query: search || "mcp server", page: nextPage, pageSize: 50,
                      });
                      setEntries(result.entries);
                      setMcpPage(nextPage);
                      setMcpTotal(result.total);
                    } catch (e) { console.error(e); }
                    finally { setLoadingMore(false); }
                  }}
                >
                  {loadingMore ? <div className="spinner" style={{ width: 12, height: 12 }} /> : null}
                  {locale === "zh" ? "下一页" : "Next"}
                </button>
              </div>
            )}
            </>
          )
        ) : (
          /* Skills Grid */
          filteredSkills.length === 0 ? (
            <EmptyState icon={Zap} text={locale === "zh" ? "未找到技能" : "No skills found"} sub={locale === "zh" ? "尝试其他关键词或添加自定义源" : "Try different keywords or add custom source"} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }} className="stagger">
              {filteredSkills.map(skill => {
                const isInstalled = installedSkills.has(skill.name.toLowerCase());
                const isInstalling = installing === skill.id;
                const desc = showTranslation && locale === "zh" && skill.description_zh ? skill.description_zh : skill.description;
                return (
                  <div key={skill.id} className="card card-hover" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, cursor: "pointer" }}
                    onClick={() => setPreviewSkill(skill)}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{skill.name}</span>
                          <span className="badge badge-muted" style={{ fontSize: 10 }}>{skill.category}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {desc}
                        </p>
                      </div>
                      {/* Tags */}
                      {skill.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {skill.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="badge badge-muted" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                              <Tag size={9} />{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {skill.author && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{skill.author}</span>}
                          {skill.github_url && (
                            <button className="badge badge-accent"
                              style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, cursor: "pointer", border: "none", background: "var(--accent-subtle)" }}
                              onClick={e => { e.stopPropagation(); shellOpen(skill.github_url!); }}>
                              <ExternalLink size={10} />GitHub
                            </button>
                          )}
                        </div>
                        {isInstalled ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button className="btn btn-ghost btn-icon-sm" onClick={e => { e.stopPropagation(); setPreviewSkill(skill); setEditingPreview(true); setEditContent(skill.content); }}
                              title={locale === "zh" ? "编辑" : "Edit"}>
                              <Edit3 size={13} style={{ color: "var(--text-muted)" }} />
                            </button>
                            <button className="btn btn-danger-ghost btn-icon-sm" onClick={e => { e.stopPropagation(); handleUninstallSkill(skill); }}
                              title={locale === "zh" ? "卸载" : "Uninstall"}>
                              <Trash2 size={13} />
                            </button>
                            <span className="badge badge-success" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <CheckCircle size={12} />{i.marketplace.installed}
                            </span>
                          </div>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); handleInstallSkill(skill); }} disabled={isInstalling}>
                            <Download size={13} />{isInstalling ? i.marketplace.installing : i.marketplace.install}
                          </button>
                        )}
                      </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Env Modal */}
      {showEnvModal && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowEnvModal(null)}>
          <div className="section-card" style={{ width: 440, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{i.marketplace.envRequired}</h3>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowEnvModal(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              {locale === "zh" ? `安装 ${showEnvModal.name} 需要配置以下环境变量：` : `${showEnvModal.name} requires the following environment variables:`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {showEnvModal.env_keys.map(key => (
                <div key={key}>
                  <span className="field-label">{key}</span>
                  <input className="input" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
                    placeholder={`${locale === "zh" ? "输入" : "Enter"} ${key}`}
                    value={envValues[key] || ""} onChange={e => setEnvValues(prev => ({ ...prev, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEnvModal(null)}>{i.common.cancel}</button>
              <button className="btn btn-primary btn-sm" onClick={() => doInstallMcp(showEnvModal, envValues)}>
                <Download size={13} />{i.marketplace.install}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Source Modal */}
      {showCustomSource && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowCustomSource(false)}>
          <div className="section-card" style={{ width: 520, maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Globe size={18} style={{ color: "var(--text-secondary)" }} />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{locale === "zh" ? "自定义源管理" : "Custom Sources"}</h3>
              </div>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowCustomSource(false)}><X size={16} /></button>
            </div>

            {/* Built-in sources */}
            <div style={{ marginBottom: 20 }}>
              <span className="field-label">{locale === "zh" ? "内置源" : "Built-in Sources"}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--bg-input)" }}>
                  <Plug size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>MCP Registry</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{locale === "zh" ? "内置精选列表 + npm 搜索" : "Curated list + npm search"}</div>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: 10 }}>{locale === "zh" ? "默认" : "Default"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, background: "var(--bg-input)" }}>
                  <Zap size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Skills Registry</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{locale === "zh" ? "内置技能注册表" : "Built-in skills registry"}</div>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: 10 }}>{locale === "zh" ? "默认" : "Default"}</span>
                </div>
              </div>
            </div>

            {/* Recommended skill repos */}
            <div style={{ marginBottom: 20 }}>
              <span className="field-label">{locale === "zh" ? "推荐技能仓库" : "Recommended Skill Repos"}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { name: "levnikolaevich/claude-code-skills", branch: "master", desc: locale === "zh" ? "125 个技能 — 全流程交付（研发/测试/评审）" : "125 skills — full delivery workflow" },
                  { name: "rohitg00/awesome-claude-code-toolkit", branch: "main", desc: locale === "zh" ? "35 个技能 + 135 个 Agent + 42 个命令" : "35 skills + 135 agents + 42 commands" },
                  { name: "JimLiu/baoyu-skills", branch: "main", desc: locale === "zh" ? "18 个技能 — 宝玉技能合集" : "18 skills — Baoyu skills collection" },
                  { name: "cexll/myclaude", branch: "master", desc: locale === "zh" ? "11 个技能 — 浏览器/代码/开发等" : "11 skills — browser/code/dev" },
                ].map((repo) => {
                  const [owner, repoName] = repo.name.split("/");
                  const isLoaded = customSources.some(s => s.url === `github:${repo.name}`);
                  const isLoading = loadingRepo === repo.name;
                  return (
                  <div key={repo.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "var(--bg-input)" }}>
                    <ExternalLink size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{repo.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.desc}</div>
                    </div>
                    <button className="btn btn-xs btn-ghost" style={{ flexShrink: 0, gap: 4 }}
                      onClick={() => shellOpen(`https://github.com/${repo.name}`)}>
                      <ExternalLink size={10} />
                    </button>
                    <button className={`btn btn-xs ${isLoaded ? "btn-ghost" : "btn-primary"}`} style={{ flexShrink: 0, gap: 4 }}
                      disabled={isLoading || isLoaded}
                      onClick={async () => {
                        setLoadingRepo(repo.name);
                        try {
                          const skills = await invoke<SkillEntry[]>("fetch_skills_from_repo", { owner, repo: repoName, branch: repo.branch });
                          const newIds: string[] = [];
                          setSkillEntries(prev => {
                            const existingIds = new Set(prev.map(s => s.id));
                            const newEntries = skills.filter(s => !existingIds.has(s.id));
                            newEntries.forEach(s => newIds.push(s.id));
                            return [...prev, ...newEntries];
                          });
                          setCustomSources(prev => [...prev, { url: `github:${repo.name}`, count: newIds.length, skillIds: newIds }]);
                        } catch (e) {
                          console.error(e);
                          showToast("error", locale === "zh" ? `加载失败: ${e}` : `Load failed: ${e}`);
                        }
                        finally { setLoadingRepo(null); }
                      }}>
                      {isLoading ? <><div className="spinner" style={{ width: 10, height: 10 }} />{locale === "zh" ? "加载中" : "Loading"}</>
                        : isLoaded ? <><Check size={10} style={{ color: "var(--success)" }} />{locale === "zh" ? "已加载" : "Loaded"}</>
                        : <><Download size={10} />{locale === "zh" ? "加载技能" : "Load Skills"}</>}
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Existing sources list */}
            {customSources.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <span className="field-label">{locale === "zh" ? "已添加的源" : "Added Sources"}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {customSources.map((source, idx) => (
                    <div key={idx} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 8, background: "var(--bg-input)", gap: 12
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {source.url}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {source.count} {locale === "zh" ? "个技能" : "skills"}
                        </span>
                      </div>
                      <button className="btn btn-danger-ghost btn-icon-sm" onClick={() => removeCustomSource(idx)}
                        title={locale === "zh" ? "移除" : "Remove"}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new source */}
            <div>
              <span className="field-label">{locale === "zh" ? "添加新源" : "Add New Source"}</span>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                {locale === "zh"
                  ? "输入一个返回技能列表 JSON 的 URL"
                  : "Enter a URL that returns a JSON array of skill entries"}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flex: 1 }}
                  placeholder="https://example.com/skills.json"
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCustomSource()}
                />
                <button className="btn btn-primary btn-sm" onClick={handleCustomSource} disabled={!customUrl.trim() || loadingCustom} style={{ flexShrink: 0 }}>
                  {loadingCustom ? (
                    <><div className="spinner" style={{ width: 14, height: 14 }} />{locale === "zh" ? "加载中" : "Loading"}</>
                  ) : (
                    <><Plus size={13} />{locale === "zh" ? "添加" : "Add"}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill Preview Modal */}
      {previewSkill && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { setPreviewSkill(null); setEditingPreview(false); }}>
          <div className="section-card" style={{ width: editingPreview ? "90vw" : 720, maxWidth: editingPreview ? 1200 : 720, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{previewSkill.name}</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {showTranslation && locale === "zh" && previewSkill.description_zh ? previewSkill.description_zh : previewSkill.description}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => { setPreviewSkill(null); setEditingPreview(false); }}><X size={16} /></button>
            </div>
            {/* Tags & meta */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <span className="badge badge-muted">{previewSkill.category}</span>
              {previewSkill.author && <span className="badge badge-muted">{previewSkill.author}</span>}
              {previewSkill.tags.map(tag => (
                <span key={tag} className="badge badge-muted" style={{ fontSize: 10 }}>{tag}</span>
              ))}
              {previewSkill.github_url && (
                <button className="badge badge-accent"
                  style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, cursor: "pointer", border: "none", background: "var(--accent-subtle)" }}
                  onClick={() => shellOpen(previewSkill.github_url!)}>
                  <ExternalLink size={10} />GitHub
                </button>
              )}
            </div>
            {/* Content preview / editor */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>{locale === "zh" ? "技能内容" : "Content"}</span>
              {installedSkills.has(previewSkill.name.toLowerCase()) && !editingPreview && (
                <button className="btn btn-secondary btn-xs" onClick={() => { setEditingPreview(true); setEditContent(previewSkill.content); }} style={{ gap: 5 }}>
                  <Edit3 size={12} />{locale === "zh" ? "编辑" : "Edit"}
                </button>
              )}
              {editingPreview && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-secondary btn-xs" onClick={() => setEditingPreview(false)}><X size={12} />{locale === "zh" ? "取消" : "Cancel"}</button>
                  <button className="btn btn-primary btn-xs" onClick={handleSaveSkillContent}><Save size={12} />{locale === "zh" ? "保存" : "Save"}</button>
                </div>
              )}
            </div>
            {editingPreview ? (
              <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>Markdown</div>
                  <CodeEditor
                    value={editContent}
                    onChange={setEditContent}
                    language="markdown"
                    minHeight={280}
                    maxHeight={420}
                  />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>{locale === "zh" ? "预览" : "Preview"}</div>
                  <div className="markdown-preview" style={{ flex: 1, overflowY: "auto", fontSize: 13, lineHeight: 1.8, minHeight: 0 }}>
                    <Markdown remarkPlugins={[remarkGfm]}>{editContent}</Markdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="markdown-preview" style={{ flex: 1, overflowY: "auto", fontSize: 13, lineHeight: 1.8, minHeight: 200 }}>
                <Markdown remarkPlugins={[remarkGfm]}>{previewSkill.content}</Markdown>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setPreviewSkill(null); setEditingPreview(false); }}>{i.common.cancel}</button>
              {installedSkills.has(previewSkill.name.toLowerCase()) ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => { handleUninstallSkill(previewSkill); setPreviewSkill(null); setEditingPreview(false); }} style={{ gap: 5 }}>
                    <Trash2 size={13} />{locale === "zh" ? "卸载" : "Uninstall"}
                  </button>
                  <span className="badge badge-success" style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px" }}>
                    <CheckCircle size={12} />{i.marketplace.installed}
                  </span>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => { handleInstallSkill(previewSkill); setPreviewSkill(null); }}>
                  <Download size={13} />{i.marketplace.install}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* MCP Preview Modal */}
      {previewMcp && (() => {
        const isInstalled = installedIds.has(previewMcp.name) || installedIds.has(previewMcp.id);
        return (
          <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => setPreviewMcp(null)}>
            <div className="section-card" style={{ width: 560, maxHeight: "80vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{previewMcp.name}</h3>
                <button className="btn btn-ghost btn-icon-sm" onClick={() => setPreviewMcp(null)}><X size={16} /></button>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
                {previewMcp.description}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                <span className="badge badge-muted">{locale === "zh" ? (MCP_CATEGORY_ZH[previewMcp.category] || previewMcp.category) : previewMcp.category}</span>
                {previewMcp.install_type && <span className="badge badge-muted">{previewMcp.install_type}</span>}
                {previewMcp.package_name && <span className="badge badge-accent" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{previewMcp.package_name}</span>}
              </div>
              {/* Command info */}
              <div style={{ marginBottom: 16 }}>
                <span className="field-label">{locale === "zh" ? "安装命令" : "Command"}</span>
                <div style={{ padding: "10px 14px", borderRadius: 6, background: "var(--bg-input)", border: "1px solid var(--border-default)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {previewMcp.command} {previewMcp.args.join(" ")}
                </div>
              </div>
              {previewMcp.env_keys.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <span className="field-label">{locale === "zh" ? "需要的环境变量" : "Required Environment Variables"}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {previewMcp.env_keys.map(key => (
                      <span key={key} className="badge badge-warning" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                        <Key size={10} />{key}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                {previewMcp.github_url && (
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => shellOpen(previewMcp.github_url!)}
                    style={{ gap: 5 }}>
                    <ExternalLink size={13} />GitHub
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setPreviewMcp(null)}>
                  {locale === "zh" ? "关闭" : "Close"}
                </button>
                {isInstalled ? (
                  <span className="badge badge-success" style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px" }}>
                    <CheckCircle size={12} />{i.marketplace.installed}
                  </span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => { handleInstallMcp(previewMcp); setPreviewMcp(null); }} style={{ gap: 5 }}>
                    <Download size={13} />{i.marketplace.install}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      <ConfirmDialog
        isOpen={!!pendingUninstall}
        title={locale === "zh" ? "卸载技能" : "Uninstall Skill"}
        message={locale === "zh" ? `确定卸载技能「${pendingUninstall?.name}」？` : `Uninstall skill "${pendingUninstall?.name}"?`}
        confirmText={locale === "zh" ? "卸载" : "Uninstall"}
        variant="destructive"
        onConfirm={() => { if (pendingUninstall) void doUninstallSkill(pendingUninstall); setPendingUninstall(null); }}
        onCancel={() => setPendingUninstall(null)}
      />
    </div>
  );
}

function EmptyState({ icon: Icon, text, sub }: { icon: typeof Store; text: string; sub: string }) {
  return (
    <div className="card empty-state">
      <div className="empty-icon"><Icon size={28} style={{ color: "var(--text-muted)" }} /></div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>{text}</p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{sub}</p>
    </div>
  );
}
