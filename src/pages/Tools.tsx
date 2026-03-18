import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal, Code, Monitor } from "lucide-react";
import { getLocale } from "../lib/i18n";
import { showToast } from "../components/Toast";
import type { DetectedTool } from "../types/skills";

type ToolTab = "claude" | "codex";

const PERM_LEVELS = [
  { label_zh: "严格", label_en: "Strict", color: "#ef4444" },
  { label_zh: "标准", label_en: "Standard", color: "#eab308" },
  { label_zh: "宽松", label_en: "Relaxed", color: "#3b82f6" },
  { label_zh: "全部允许", label_en: "Allow All", color: "#22c55e" },
];

const PERM_DESC_ZH = ["每次操作都确认", "允许读取，写操作确认", "允许读写，仅 Bash 确认", "跳过所有确认"];
const PERM_DESC_EN = ["Confirm every action", "Allow read, confirm write", "Allow read/write, confirm Bash", "Skip all prompts"];

export default function Tools() {
  const [tab, setTab] = useState<ToolTab>("claude");
  const [permLevel, setPermLevel] = useState(0);
  const [autoUpdate, setAutoUpdate] = useState("latest");
  const [codexApproval, setCodexApproval] = useState("suggest");
  const [codexReasoning, setCodexReasoning] = useState("medium");
  const [codexDisableStorage, setCodexDisableStorage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const locale = getLocale();
  const zh = locale === "zh";

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [level, channel, codexSettings, detectedTools] = await Promise.all([
        invoke<number>("get_claude_permissions_level").catch(() => 0),
        invoke<string>("get_claude_auto_update").catch(() => "latest"),
        invoke<{ approval_mode: string; reasoning_effort: string; disable_response_storage: boolean }>("get_codex_settings").catch(() => ({
          approval_mode: "suggest", reasoning_effort: "medium", disable_response_storage: false,
        })),
        invoke<DetectedTool[]>("detect_tools").catch(() => []),
      ]);
      setPermLevel(level);
      setAutoUpdate(channel);
      setCodexApproval(codexSettings.approval_mode);
      setCodexReasoning(codexSettings.reasoning_effort);
      setCodexDisableStorage(codexSettings.disable_response_storage);
      setTools(detectedTools);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function setClaudeSetting(fn: string, args: Record<string, unknown>, onSuccess: () => void) {
    try {
      await invoke(fn, args);
      onSuccess();
      showToast("success", zh ? "已更新" : "Updated");
    } catch (e) { showToast("error", `${e}`); }
  }

  async function setCodex(key: string, value: string) {
    try {
      await invoke("set_codex_setting", { key, value });
      showToast("success", zh ? "已更新" : "Updated");
    } catch (e) { showToast("error", `${e}`); }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{zh ? "加载中..." : "Loading..."}</span></div>;
  }

  const perm = PERM_LEVELS[permLevel] || PERM_LEVELS[0];

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{zh ? "工具" : "Tools"}</h2>
          <p className="page-subtitle">{zh ? "管理 AI 编程工具的配置和权限" : "Manage AI coding tool settings"}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["claude", "codex"] as ToolTab[]).map(id => {
          const Icon = id === "claude" ? Terminal : Code;
          const tool = tools.find(t => t.id === id);
          return (
            <button key={id} className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab(id)} style={{ gap: 6 }}>
              <Icon size={14} />{tool?.name || id}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {tab === "claude" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Permission Slider */}
            <div className="card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{zh ? "权限模式" : "Permission Mode"}</h4>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: perm.color, boxShadow: `0 0 5px ${perm.color}50` }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{zh ? perm.label_zh : perm.label_en}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {zh ? PERM_DESC_ZH[permLevel] : PERM_DESC_EN[permLevel]}</span>
                </div>
                <div style={{ position: "relative", height: 5, borderRadius: 3, background: "var(--bg-badge)" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(permLevel / 3) * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, #ef4444, ${perm.color})`, transition: "width 0.2s" }} />
                  <input type="range" min={0} max={3} step={1} value={permLevel}
                    onChange={e => { const v = Number(e.target.value); setPermLevel(v); setClaudeSetting("set_claude_permissions_level", { level: v }, () => {}); }}
                    style={{ position: "absolute", top: -8, left: 0, width: "100%", height: 22, opacity: 0, cursor: "pointer" }} />
                  <div style={{ position: "absolute", top: -5, left: `calc(${(permLevel / 3) * 100}% - 7px)`, width: 14, height: 14, borderRadius: "50%", background: perm.color, border: "2px solid var(--bg-app)", boxShadow: `0 0 5px ${perm.color}60`, transition: "left 0.2s", pointerEvents: "none" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  {PERM_LEVELS.map((pl, i) => (
                    <span key={i} style={{ fontSize: 10, color: permLevel === i ? pl.color : "var(--text-muted)", fontWeight: permLevel === i ? 700 : 400, cursor: "pointer" }}
                      onClick={() => { setPermLevel(i); setClaudeSetting("set_claude_permissions_level", { level: i }, () => {}); }}>
                      {zh ? pl.label_zh : pl.label_en}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Skip Dangerous Confirm */}
            <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>{zh ? "跳过危险确认" : "Skip Danger Prompt"}</h4>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{zh ? "全权限模式免确认" : "No confirmation for bypass mode"}</p>
              </div>
              <ToggleSwitch
                value={permLevel === 3}
                onChange={v => {
                  const newLevel = v ? 3 : 0;
                  setPermLevel(newLevel);
                  setClaudeSetting("set_claude_permissions_level", { level: newLevel }, () => {});
                }}
                labelOn={zh ? "已跳过" : "Skipped"}
                labelOff={zh ? "需确认" : "Required"}
              />
            </div>

            {/* Auto Update */}
            <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>{zh ? "自动更新" : "Auto Update"}</h4>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{zh ? "Claude Code 更新频道" : "Update channel"}</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { value: "latest", label: zh ? "最新" : "Latest" },
                  { value: "stable", label: zh ? "稳定" : "Stable" },
                  { value: "disabled", label: zh ? "关闭" : "Off" },
                ].map(opt => (
                  <button key={opt.value}
                    className={`btn btn-xs ${autoUpdate === opt.value ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => { setAutoUpdate(opt.value); setClaudeSetting("set_claude_auto_update", { channel: opt.value }, () => {}); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "codex" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Approval Mode */}
            <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>{zh ? "审批模式" : "Approval Mode"}</h4>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{zh ? "操作确认级别" : "Action confirmation level"}</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { value: "suggest", label: zh ? "建议" : "Suggest" },
                  { value: "auto-edit", label: zh ? "自动编辑" : "Auto Edit" },
                  { value: "full-auto", label: zh ? "全自动" : "Full Auto" },
                ].map(opt => (
                  <button key={opt.value}
                    className={`btn btn-xs ${codexApproval === opt.value ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => { setCodexApproval(opt.value); setCodex("approval_mode", opt.value); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reasoning Effort */}
            <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>{zh ? "推理强度" : "Reasoning Effort"}</h4>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{zh ? "模型推理计算量" : "Model reasoning compute"}</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { value: "low", label: zh ? "低" : "Low" },
                  { value: "medium", label: zh ? "中" : "Medium" },
                  { value: "high", label: zh ? "高" : "High" },
                ].map(opt => (
                  <button key={opt.value}
                    className={`btn btn-xs ${codexReasoning === opt.value ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => { setCodexReasoning(opt.value); setCodex("reasoning_effort", opt.value); }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Disable Response Storage */}
            <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>{zh ? "禁用响应存储" : "Disable Response Storage"}</h4>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{zh ? "不保存 API 响应到本地" : "Don't save API responses locally"}</p>
              </div>
              <ToggleSwitch
                value={codexDisableStorage}
                onChange={v => { setCodexDisableStorage(v); setCodex("disable_response_storage", String(v)); }}
                labelOn={zh ? "已禁用" : "Disabled"}
                labelOff={zh ? "已启用" : "Enabled"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({ value, onChange, labelOn, labelOff }: { value: boolean; onChange: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button className={`toggle toggle-sm ${value ? "on" : "off"}`} onClick={() => onChange(!value)}>
        <span className="toggle-knob" />
      </button>
      <span style={{ fontSize: 12, color: value ? "var(--success)" : "var(--text-muted)", fontWeight: 500 }}>
        {value ? labelOn : labelOff}
      </span>
    </div>
  );
}
