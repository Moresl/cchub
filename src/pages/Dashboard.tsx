import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plug, Zap, Package, Monitor, Terminal, Code, Wind, Activity, ArrowRight, Shield, Layers } from "lucide-react";
import { t, getLocale } from "../lib/i18n";
import { useNavigate } from "react-router-dom";
import type { DetectedTool } from "../types/skills";

interface McpServer { id: string; name: string; command: string | null; args: string; env: string; status: string; transport: string; source: string; }
interface Skill { id: string; name: string; plugin_id: string | null; trigger_command: string | null; description: string | null; }
interface Plugin { id: string; name: string; description: string | null; }

const TOOL_ICONS: Record<string, typeof Monitor> = { claude: Terminal, cursor: Code, windsurf: Wind, codex: Monitor };

export default function Dashboard() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const i = t();
  const locale = getLocale();

  useEffect(() => {
    (async () => {
      try {
        const [s, sk, p, dt] = await Promise.all([
          invoke<McpServer[]>("scan_mcp_servers"),
          invoke<Skill[]>("scan_skills"),
          invoke<Plugin[]>("get_plugins"),
          invoke<DetectedTool[]>("detect_tools"),
        ]);
        setServers(s); setSkills(sk); setPlugins(p); setTools(dt);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.dashboard.scanning}</span></div>;
  }

  const installedTools = tools.filter((t) => t.installed);
  const activeServers = servers.filter((s) => s.status === "active");

  return (
    <div className="animate-in">
      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard
          label={i.dashboard.mcpServers}
          value={servers.length}
          sub={`${activeServers.length} ${i.dashboard.active}`}
          icon={Plug}
          color="var(--text-primary)"
          onClick={() => navigate("/mcp-servers")}
        />
        <StatCard
          label={i.dashboard.skills}
          value={skills.length}
          sub={`${skills.filter(s => s.plugin_id).length} ${locale === "zh" ? "来自插件" : "from plugins"}`}
          icon={Zap}
          color="var(--text-secondary)"
          onClick={() => navigate("/skills")}
        />
        <StatCard
          label={i.dashboard.plugins}
          value={plugins.length}
          icon={Package}
          color="var(--text-secondary)"
          onClick={() => navigate("/skills")}
        />
        <StatCard
          label={i.skills.detectedTools}
          value={installedTools.length}
          sub={`/ ${tools.length} ${locale === "zh" ? "已知" : "known"}`}
          icon={Monitor}
          color="var(--text-primary)"
          onClick={() => navigate("/skills")}
        />
      </div>

      {/* Detected Tools Strip */}
      {installedTools.length > 0 && (
        <div className="section-card" style={{ marginBottom: 24, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {i.skills.detectedTools}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {tools.map((tool) => {
              const Icon = TOOL_ICONS[tool.id] || Monitor;
              return (
                <div
                  key={tool.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                    borderRadius: 6, border: "1px solid var(--border-default)",
                    background: tool.installed ? "var(--bg-card)" : "transparent",
                    opacity: tool.installed ? 1 : 0.4,
                  }}
                >
                  <Icon size={16} style={{ color: tool.installed ? "var(--text-primary)" : "var(--text-muted)" }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: tool.installed ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {tool.name}
                  </span>
                  {tool.installed && <span className="dot dot-active" style={{ width: 6, height: 6 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* MCP Servers */}
        <div className="section-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="section-card-title" style={{ marginBottom: 0 }}>
              <Plug size={16} style={{ color: "var(--text-secondary)" }} />
              {i.dashboard.recentMcp}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate("/mcp-servers")} style={{ gap: 4 }}>
              {locale === "zh" ? "查看全部" : "View all"}<ArrowRight size={12} />
            </button>
          </div>
          {servers.length === 0 ? (
            <EmptyHint text={i.dashboard.noMcpServers} sub={i.dashboard.addMcpTip} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {servers.slice(0, 3).map((s) => (
                <div key={s.id} className="list-row" style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`dot ${s.status === "active" ? "dot-active" : s.status === "error" ? "dot-error" : "dot-disabled"}`} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                  </div>
                  <span className={`badge ${s.source === "official-plugin" ? "badge-accent" : s.source === "community-plugin" ? "badge-success" : "badge-muted"}`} style={{ fontSize: 10 }}>
                    {s.source === "official-plugin" ? i.mcp.officialPlugin : s.source === "community-plugin" ? i.mcp.communityPlugin : s.source === "cursor" ? "Cursor" : i.mcp.local}
                  </span>
                </div>
              ))}
              {servers.length > 3 && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
                  +{servers.length - 3} {locale === "zh" ? "更多" : "more"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="section-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="section-card-title" style={{ marginBottom: 0 }}>
              <Zap size={16} style={{ color: "var(--text-secondary)" }} />
              {i.dashboard.recentSkills}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate("/skills")} style={{ gap: 4 }}>
              {locale === "zh" ? "查看全部" : "View all"}<ArrowRight size={12} />
            </button>
          </div>
          {skills.length === 0 ? (
            <EmptyHint text={i.dashboard.noSkills} sub={i.dashboard.addSkillTip} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {skills.slice(0, 3).map((s) => (
                <div key={s.id} className="list-row" style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    {s.plugin_id && <span className="badge badge-muted" style={{ fontSize: 10, flexShrink: 0 }}>{s.plugin_id}</span>}
                  </div>
                  {s.trigger_command && (
                    <code className="badge badge-accent" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, flexShrink: 0 }}>{s.trigger_command}</code>
                  )}
                </div>
              ))}
              {skills.length > 3 && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
                  +{skills.length - 3} {locale === "zh" ? "更多" : "more"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 20 }}>
        <QuickAction
          icon={Monitor}
          label={locale === "zh" ? "客户端管理" : "MCP Clients"}
          desc={locale === "zh" ? "管理 AI 应用访问权限" : "Manage AI app access"}
          onClick={() => navigate("/mcp-clients")}
        />
        <QuickAction
          icon={Activity}
          label={locale === "zh" ? "请求日志" : "Request Logs"}
          desc={locale === "zh" ? "查看 MCP 活动记录" : "View MCP activity"}
          onClick={() => navigate("/logs")}
        />
        <QuickAction
          icon={Layers}
          label={locale === "zh" ? "工作区" : "Workspaces"}
          desc={locale === "zh" ? "切换与管理工作区" : "Switch workspaces"}
          onClick={() => navigate("/workspaces")}
        />
        <QuickAction
          icon={Shield}
          label={locale === "zh" ? "安全审计" : "Security Audit"}
          desc={locale === "zh" ? "扫描 MCP 安全风险" : "Scan MCP security risks"}
          onClick={() => navigate("/security")}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color, onClick }: {
  label: string; value: number; sub?: string; icon: typeof Plug; color: string; onClick?: () => void;
}) {
  return (
    <div className="stat-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="icon-box" style={{ background: `${color}15`, width: 36, height: 36, borderRadius: 6 }}>
          <Icon size={17} style={{ color }} />
        </div>
        <span style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{value}</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, opacity: 0.7 }}>{sub}</p>}
    </div>
  );
}

function QuickAction({ icon: Icon, label, desc, onClick }: {
  icon: typeof Plug; label: string; desc: string; onClick: () => void;
}) {
  return (
    <div className="card card-interactive" style={{ padding: "18px 20px", cursor: "pointer" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="icon-box" style={{ background: "var(--bg-elevated)", width: 36, height: 36, borderRadius: 6 }}>
          <Icon size={16} style={{ color: "var(--text-secondary)" }} />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600 }}>{label}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{desc}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ text, sub }: { text: string; sub: string }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{text}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, opacity: 0.7 }}>{sub}</p>
    </div>
  );
}
