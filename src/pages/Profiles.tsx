import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw, Save, Trash2, Check, Eye, X, ArrowRightLeft,
  Search, Terminal, Code, Monitor, Sparkles, Globe, Wind,
  Edit3, Plus,
} from "lucide-react";
import { getLocale } from "../lib/i18n";
import {
  applyPresetToFields,
  buildStructuredConfig,
  createDefaultStructuredFields,
  getConfigPresets,
  parseStructuredConfig,
  supportsStructuredConfig,
  type ClaudeAuthField,
} from "../lib/configProfiles";
import { showToast } from "../components/Toast";
import CodeEditor from "../components/CodeEditor";

interface ConfigProfile {
  id: string;
  name: string;
  tool_id: string;
  config_snapshot: string;
  source_type?: string | null;
  source_key?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DetectedTool {
  id: string;
  name: string;
  installed: boolean;
}

const TOOL_ICONS: Record<string, typeof Monitor> = {
  claude: Terminal,
  codex: Monitor,
  gemini: Sparkles,
  cursor: Code,
  windsurf: Wind,
  opencode: Globe,
};

function formatTime(value: string | null) {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 19);
}

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function getConfigLanguage(toolId: string, content: string): "json" | "toml" {
  if (toolId === "codex") {
    try {
      JSON.parse(content);
      return "json";
    } catch {
      return "toml";
    }
  }
  return "json";
}

function getConfigHint(toolId: string, locale: string) {
  if (toolId === "codex") {
    return locale === "zh" ? "包含 auth.json 和 config.toml" : "Includes auth.json and config.toml";
  }
  if (toolId === "gemini") {
    return locale === "zh" ? "包含 .env 和 settings.json" : "Includes .env and settings.json";
  }
  return locale === "zh" ? "完整配置" : "Full configuration";
}

export default function Profiles() {
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTool, setNewTool] = useState("claude");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConfigProfile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTool, setDraftTool] = useState("claude");
  const [draftContent, setDraftContent] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftPresetId, setDraftPresetId] = useState("custom");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftAuthField, setDraftAuthField] = useState<ClaudeAuthField>("ANTHROPIC_AUTH_TOKEN");
  const [filterTool, setFilterTool] = useState("");
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const locale = getLocale();

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      await invoke("sync_config_profiles");
      const [nextProfiles, nextTools, nextActiveIds] = await Promise.all([
        invoke<ConfigProfile[]>("get_config_profiles"),
        invoke<DetectedTool[]>("detect_tools"),
        invoke<string[]>("get_active_config_profile_ids"),
      ]);
      setProfiles(nextProfiles);
      setTools(nextTools);
      setActiveIds(nextActiveIds);
      setPreview((prev) => prev ? nextProfiles.find((item) => item.id === prev.id) || null : null);
      setNewTool((prev) => {
        const installed = nextTools.filter((tool) => tool.installed);
        if (installed.some((tool) => tool.id === prev)) return prev;
        return installed[0]?.id || nextTools[0]?.id || "claude";
      });
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? `加载失败: ${e}` : `Load failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  function updateStructuredDraft(toolId: string, next: {
    presetId?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    authField?: ClaudeAuthField;
  }) {
    const fields = {
      presetId: next.presetId ?? draftPresetId,
      baseUrl: next.baseUrl ?? draftBaseUrl,
      apiKey: next.apiKey ?? draftApiKey,
      model: next.model ?? draftModel,
      authField: next.authField ?? draftAuthField,
    };
    setDraftPresetId(fields.presetId);
    setDraftBaseUrl(fields.baseUrl);
    setDraftApiKey(fields.apiKey);
    setDraftModel(fields.model);
    setDraftAuthField(fields.authField);
    setDraftContent(buildStructuredConfig(toolId, fields));
  }

  async function openCreateModal(toolId?: string) {
    const selectedTool = toolId || newTool;
    if (!installedTools.length) {
      showToast("error", locale === "zh" ? "没有可用工具配置" : "No available tool configuration");
      return;
    }
    setEditingProfile(null);
    setDraftName("");
    setDraftTool(selectedTool);
    setDraftContent("");
    setShowCreateModal(true);
    setSaving(false);
    setNewTool(selectedTool);
    if (supportsStructuredConfig(selectedTool)) {
      const defaults = createDefaultStructuredFields(selectedTool);
      setDraftPresetId(defaults.presetId);
      setDraftBaseUrl(defaults.baseUrl);
      setDraftApiKey(defaults.apiKey);
      setDraftModel(defaults.model);
      setDraftAuthField(defaults.authField);
      setDraftContent(buildStructuredConfig(selectedTool, defaults));
      setDraftLoading(false);
      return;
    }
    setDraftPresetId("custom");
    setDraftBaseUrl("");
    setDraftApiKey("");
    setDraftModel("");
    setDraftAuthField("ANTHROPIC_AUTH_TOKEN");
    setDraftLoading(true);
    try {
      const configContent = await invoke<string>("read_tool_config", { toolId: selectedTool });
      setDraftContent(prettyJson(configContent));
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? `读取配置失败: ${e}` : `Failed to read configuration: ${e}`);
    } finally {
      setDraftLoading(false);
    }
  }

  function openEditModal(profile: ConfigProfile) {
    setEditingProfile(profile);
    setShowCreateModal(false);
    setDraftName(profile.name);
    setDraftTool(profile.tool_id);
    setDraftContent(prettyJson(profile.config_snapshot));
    if (supportsStructuredConfig(profile.tool_id)) {
      const parsed = parseStructuredConfig(profile.tool_id, profile.config_snapshot);
      setDraftPresetId(parsed.presetId);
      setDraftBaseUrl(parsed.baseUrl);
      setDraftApiKey(parsed.apiKey);
      setDraftModel(parsed.model);
      setDraftAuthField(parsed.authField);
    } else {
      setDraftPresetId("custom");
      setDraftBaseUrl("");
      setDraftApiKey("");
      setDraftModel("");
      setDraftAuthField("ANTHROPIC_AUTH_TOKEN");
    }
    setDraftLoading(false);
  }

  function closeModal() {
    setShowCreateModal(false);
    setEditingProfile(null);
    setDraftName("");
    setDraftContent("");
    setDraftLoading(false);
    setDraftPresetId("custom");
    setDraftBaseUrl("");
    setDraftApiKey("");
    setDraftModel("");
    setDraftAuthField("ANTHROPIC_AUTH_TOKEN");
    setSaving(false);
  }

  async function handleSaveModal() {
    if (!draftName.trim() || saving) return;
    setSaving(true);
    try {
      if (editingProfile) {
        await invoke("update_config_profile", {
          id: editingProfile.id,
          name: draftName.trim(),
          configSnapshot: draftContent,
        });
        showToast("success", locale === "zh" ? "配置已更新" : "Configuration updated");
      } else {
        await invoke("save_config_profile", {
          name: draftName.trim(),
          toolId: draftTool,
          configSnapshot: draftContent,
        });
        showToast("success", locale === "zh" ? "配置已保存" : "Configuration saved");
      }
      closeModal();
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? `保存失败: ${e}` : `Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleApply(profile: ConfigProfile) {
    const msg = locale === "zh"
      ? `确定切换到配置「${profile.name}」？\n\n这会覆盖 ${profile.tool_id} 的当前配置文件。`
      : `Switch to "${profile.name}"?\n\nThis will overwrite the current ${profile.tool_id} configuration.`;
    if (!window.confirm(msg)) return;
    setApplying(profile.id);
    try {
      await invoke("apply_config_profile", { id: profile.id });
      await load();
      showToast("success", locale === "zh" ? "配置已切换" : "Configuration switched");
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? `切换失败: ${e}` : `Switch failed: ${e}`);
    } finally {
      setApplying(null);
    }
  }

  async function handleDelete(profile: ConfigProfile) {
    const msg = locale === "zh" ? `确定删除配置「${profile.name}」？` : `Delete "${profile.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await invoke("delete_config_profile", { id: profile.id });
      setPreview((prev) => prev?.id === profile.id ? null : prev);
      await load();
      showToast("success", locale === "zh" ? "配置已删除" : "Configuration deleted");
    } catch (e) {
      console.error(e);
      showToast("error", locale === "zh" ? `删除失败: ${e}` : `Delete failed: ${e}`);
    }
  }

  const activeIdSet = useMemo(() => new Set(activeIds), [activeIds]);
  const installedTools = useMemo(() => tools.filter((tool) => tool.installed), [tools]);
  const presetOptions = useMemo(() => getConfigPresets(draftTool), [draftTool]);

  const toolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const profile of profiles) {
      counts[profile.tool_id] = (counts[profile.tool_id] || 0) + 1;
    }
    return counts;
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...profiles]
      .filter((profile) => {
        if (filterTool && profile.tool_id !== filterTool) return false;
        if (activeOnly && !activeIdSet.has(profile.id)) return false;
        if (!keyword) return true;
        return (
          profile.name.toLowerCase().includes(keyword) ||
          profile.tool_id.toLowerCase().includes(keyword) ||
          profile.config_snapshot.toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => {
        const activeDiff = Number(activeIdSet.has(b.id)) - Number(activeIdSet.has(a.id));
        if (activeDiff !== 0) return activeDiff;
        const aTime = a.updated_at || a.created_at || "";
        const bTime = b.updated_at || b.created_at || "";
        return bTime.localeCompare(aTime);
      });
  }, [profiles, filterTool, activeOnly, search, activeIdSet]);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {locale === "zh" ? "加载中..." : "Loading..."}
        </span>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{locale === "zh" ? "配置切换" : "Config Profiles"}</h2>
          <p className="page-subtitle">
            {locale === "zh"
              ? `共 ${profiles.length} 个配置，当前命中 ${activeIds.length} 个`
              : `${profiles.length} configurations, ${activeIds.length} currently matched`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => void load()} style={{ gap: 6 }}>
          <RefreshCw size={14} />
          {locale === "zh" ? "刷新" : "Refresh"}
        </button>
      </div>

      <div className="section-card" style={{ marginBottom: 18, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {locale === "zh" ? "新增配置" : "New Configuration"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {locale === "zh" ? "保存当前工具的完整配置，后续一键切换。" : "Save the complete current configuration for quick switching."}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void openCreateModal()}
            disabled={installedTools.length === 0}
            style={{ gap: 6 }}
          >
            <Plus size={14} />
            {locale === "zh" ? "新增配置" : "New"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {installedTools.map((tool) => {
            const Icon = TOOL_ICONS[tool.id] || Monitor;
            const selected = newTool === tool.id;
            return (
              <button
                key={tool.id}
                className={`btn btn-sm ${selected ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setNewTool(tool.id)}
                style={{ gap: 6 }}
              >
                <Icon size={14} />
                {tool.name}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240, maxWidth: 360 }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder={locale === "zh" ? "搜索配置名称、工具或内容..." : "Search name, tool, or content..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="btn btn-ghost btn-icon-sm"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}
              onClick={() => setSearch("")}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="tab-bar" style={{ overflow: "auto", flexShrink: 0 }}>
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`tab-item ${filterTool === tool.id ? "active" : ""}`}
              onClick={() => setFilterTool((prev) => prev === tool.id ? "" : tool.id)}
              style={{ opacity: tool.installed || (toolCounts[tool.id] || 0) > 0 ? 1 : 0.55 }}
            >
              {tool.name} ({toolCounts[tool.id] || 0})
            </button>
          ))}
          <button
            className={`tab-item ${activeOnly ? "active" : ""}`}
            onClick={() => setActiveOnly((prev) => !prev)}
          >
            {locale === "zh" ? "当前生效" : "Current"} ({activeIds.length})
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredProfiles.length === 0 ? (
            <div className="card empty-state" style={{ flex: 1 }}>
              <div className="empty-icon">
                <ArrowRightLeft size={28} style={{ color: "var(--text-muted)" }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
                {locale === "zh" ? "没有可显示的配置" : "No configurations to display"}
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>
                {locale === "zh"
                  ? "先保存一份当前配置，之后就可以在这里直接切换和删除。"
                  : "Save a configuration first, then switch or delete it here."}
              </p>
            </div>
          ) : (
            filteredProfiles.map((profile) => {
              const Icon = TOOL_ICONS[profile.tool_id] || Monitor;
              const isActive = activeIdSet.has(profile.id);
              const isSelected = preview?.id === profile.id;
              return (
                <div
                  key={profile.id}
                  className={`card card-interactive ${isSelected ? "selected" : ""}`}
                  style={{
                    padding: "16px 18px",
                    borderColor: isActive ? "var(--success)" : undefined,
                    boxShadow: isActive ? "0 0 0 1px color-mix(in srgb, var(--success) 30%, transparent)" : undefined,
                  }}
                  onClick={() => setPreview(profile)}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", gap: 12, minWidth: 0, flex: 1 }}>
                      <div className="icon-box" style={{ width: 36, height: 36, borderRadius: 8 }}>
                        <Icon size={16} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{profile.name}</span>
                          <span className="badge badge-muted" style={{ textTransform: "capitalize", fontSize: 10 }}>
                            {profile.tool_id}
                          </span>
                          {profile.source_type === "compatible" && (
                            <span className="badge badge-muted" style={{ fontSize: 10 }}>
                              {locale === "zh" ? "本地已发现" : "Discovered"}
                            </span>
                          )}
                          {profile.source_type === "live" && (
                            <span className="badge badge-muted" style={{ fontSize: 10 }}>
                              {locale === "zh" ? "当前本地" : "Live"}
                            </span>
                          )}
                          {isActive && (
                            <span className="badge badge-success" style={{ fontSize: 10 }}>
                              {locale === "zh" ? "当前生效" : "Current"}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                          {getConfigHint(profile.tool_id, locale)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                          {formatTime(profile.updated_at || profile.created_at)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={`btn btn-xs ${isActive ? "btn-secondary" : "btn-primary"}`}
                        onClick={() => void handleApply(profile)}
                        disabled={applying === profile.id}
                        style={{ gap: 5 }}
                      >
                        {applying === profile.id ? (
                          <div className="spinner" style={{ width: 11, height: 11 }} />
                        ) : isActive ? (
                          <Check size={11} />
                        ) : (
                          <ArrowRightLeft size={11} />
                        )}
                        {locale === "zh" ? (isActive ? "已生效" : "切换") : (isActive ? "Active" : "Apply")}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon-sm"
                        onClick={() => setPreview(profile)}
                        title={locale === "zh" ? "预览" : "Preview"}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon-sm"
                        onClick={() => openEditModal(profile)}
                        title={locale === "zh" ? "编辑" : "Edit"}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="btn btn-danger-ghost btn-icon-sm"
                        onClick={() => void handleDelete(profile)}
                        title={locale === "zh" ? "删除" : "Delete"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {preview && (
          <div style={{ width: 520, overflowY: "auto", flexShrink: 0 }}>
            <div className="section-card" style={{ position: "sticky", top: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>{preview.name}</h3>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <span className="badge badge-muted" style={{ textTransform: "capitalize" }}>{preview.tool_id}</span>
                    {activeIdSet.has(preview.id) && (
                      <span className="badge badge-success">{locale === "zh" ? "当前生效" : "Current"}</span>
                    )}
                    <span className="badge badge-muted">{(preview.config_snapshot.length / 1024).toFixed(1)} KB</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
                    {getConfigHint(preview.tool_id, locale)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => void handleApply(preview)} style={{ gap: 5 }}>
                    <ArrowRightLeft size={13} />
                    {locale === "zh" ? "切换到此配置" : "Apply"}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(preview)} style={{ gap: 5 }}>
                    <Edit3 size={13} />
                    {locale === "zh" ? "编辑" : "Edit"}
                  </button>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => setPreview(null)}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              <CodeEditor
                value={prettyJson(preview.config_snapshot)}
                language={getConfigLanguage(preview.tool_id, preview.config_snapshot)}
                readOnly
                minHeight={340}
              />

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {formatTime(preview.updated_at || preview.created_at)}
                </div>
                <button
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => void handleDelete(preview)}
                  style={{ gap: 5 }}
                >
                  <Trash2 size={13} />
                  {locale === "zh" ? "删除此配置" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {(showCreateModal || editingProfile) && (
          <div
            style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={closeModal}
          >
            <div
              className="section-card"
              style={{ width: "90vw", maxWidth: 1100, maxHeight: "82vh", display: "flex", flexDirection: "column" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                    {editingProfile
                      ? (locale === "zh" ? "编辑配置" : "Edit Configuration")
                      : (locale === "zh" ? "新增配置" : "New Configuration")}
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {editingProfile
                      ? (locale === "zh" ? "修改名称或配置内容。" : "Update the name or configuration content.")
                      : (locale === "zh" ? "从当前工具配置创建一个新配置。" : "Create a configuration from the current tool settings.")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={closeModal}>
                    <X size={14} />
                    {locale === "zh" ? "取消" : "Cancel"}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => void handleSaveModal()} disabled={!draftName.trim() || saving} style={{ gap: 6 }}>
                    {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
                    {locale === "zh" ? "保存" : "Save"}
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <select
                  className="input"
                  value={draftTool}
                  disabled={!!editingProfile}
                  onChange={async (e) => {
                    const toolId = e.target.value;
                    setDraftTool(toolId);
                    setNewTool(toolId);
                    if (supportsStructuredConfig(toolId)) {
                      const defaults = createDefaultStructuredFields(toolId);
                      setDraftPresetId(defaults.presetId);
                      setDraftBaseUrl(defaults.baseUrl);
                      setDraftApiKey(defaults.apiKey);
                      setDraftModel(defaults.model);
                      setDraftAuthField(defaults.authField);
                      setDraftContent(buildStructuredConfig(toolId, defaults));
                      setDraftLoading(false);
                    } else {
                      setDraftPresetId("custom");
                      setDraftBaseUrl("");
                      setDraftApiKey("");
                      setDraftModel("");
                      setDraftAuthField("ANTHROPIC_AUTH_TOKEN");
                      setDraftContent("");
                      setDraftLoading(true);
                      try {
                        const configContent = await invoke<string>("read_tool_config", { toolId });
                        setDraftContent(prettyJson(configContent));
                      } catch (error) {
                        console.error(error);
                        showToast("error", locale === "zh" ? `读取配置失败: ${error}` : `Failed to read configuration: ${error}`);
                      } finally {
                        setDraftLoading(false);
                      }
                    }
                  }}
                  style={{ width: 180, fontSize: 13, padding: "8px 12px" }}
                >
                  {installedTools.map((tool) => (
                    <option key={tool.id} value={tool.id}>{tool.name}</option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 260, fontSize: 13 }}
                  placeholder={locale === "zh" ? "配置名称" : "Configuration name"}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>

              {supportsStructuredConfig(draftTool) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {locale === "zh" ? "内置配置" : "Preset"}
                    </label>
                    <select
                      className="input"
                      value={draftPresetId}
                      onChange={(e) => {
                        const presetId = e.target.value;
                        const next = applyPresetToFields(draftTool, presetId, {
                          apiKey: draftApiKey,
                          authField: draftAuthField,
                        });
                        updateStructuredDraft(draftTool, next);
                      }}
                      style={{ fontSize: 13, padding: "8px 12px" }}
                    >
                      {presetOptions.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {locale === "zh" ? "地址" : "Base URL"}
                    </label>
                    <input
                      className="input"
                      value={draftBaseUrl}
                      onChange={(e) => updateStructuredDraft(draftTool, { baseUrl: e.target.value })}
                      placeholder={locale === "zh" ? "填写接口地址" : "Enter base URL"}
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      API Key
                    </label>
                    <input
                      className="input"
                      value={draftApiKey}
                      onChange={(e) => updateStructuredDraft(draftTool, { apiKey: e.target.value })}
                      placeholder={locale === "zh" ? "填写 Key" : "Enter API key"}
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {locale === "zh" ? "模型" : "Model"}
                    </label>
                    <input
                      className="input"
                      value={draftModel}
                      onChange={(e) => updateStructuredDraft(draftTool, { model: e.target.value })}
                      placeholder={locale === "zh" ? "填写模型名称" : "Enter model"}
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {draftTool === "claude" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {locale === "zh" ? "认证字段" : "Auth Field"}
                      </label>
                      <select
                        className="input"
                        value={draftAuthField}
                        onChange={(e) => updateStructuredDraft(draftTool, { authField: e.target.value as ClaudeAuthField })}
                        style={{ fontSize: 13, padding: "8px 12px" }}
                      >
                        <option value="ANTHROPIC_AUTH_TOKEN">ANTHROPIC_AUTH_TOKEN</option>
                        <option value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                {getConfigHint(draftTool, locale)}
              </div>

              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                {supportsStructuredConfig(draftTool)
                  ? (locale === "zh" ? "上面的字段会自动生成下方配置，你也可以继续手动调整。" : "The fields above generate the configuration below. You can still fine-tune it manually.")
                  : (locale === "zh" ? "可以直接编辑完整配置内容。" : "You can edit the full configuration directly.")}
              </div>

              <div style={{ marginTop: 4 }}>
                {draftLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                    <div className="spinner" />
                  </div>
                ) : (
                  <CodeEditor
                    value={draftContent}
                    onChange={setDraftContent}
                    language={getConfigLanguage(draftTool, draftContent)}
                    minHeight={300}
                  />
                )}
              </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
