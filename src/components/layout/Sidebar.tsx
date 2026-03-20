import { NavLink } from "react-router-dom";
import { LayoutDashboard, Plug, Zap, Webhook, Settings, Shield, Store, Monitor, Activity, Layers, ArrowRightLeft, Wrench, FileText, FolderOpen } from "lucide-react";
import { t } from "../../lib/i18n";
import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

const navItems = [
  { path: "/", key: "dashboard" as const, icon: LayoutDashboard },
  { path: "/mcp-servers", key: "mcpServers" as const, icon: Plug },
  { path: "/mcp-clients", key: "mcpClients" as const, icon: Monitor },
  { path: "/logs", key: "logs" as const, icon: Activity },
  { path: "/skills", key: "skills" as const, icon: Zap },
  { path: "/marketplace", key: "marketplace" as const, icon: Store },
  { path: "/hooks", key: "hooks" as const, icon: Webhook },
  { path: "/workspaces", key: "workspaces" as const, icon: Layers },
  { path: "/profiles", key: "profiles" as const, icon: ArrowRightLeft },
  { path: "/claude-md", key: "claudeMd" as const, icon: FileText },
  { path: "/config-files", key: "configFiles" as const, icon: FolderOpen },
  { path: "/tools", key: "tools" as const, icon: Wrench },
  { path: "/security", key: "security" as const, icon: Shield },
  { path: "/settings", key: "settings" as const, icon: Settings },
];

export default function Sidebar() {
  const i = t();
  const [version, setVersion] = useState("");
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 4,
            background: "var(--text-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--bg-app)", fontSize: 11, fontWeight: 800,
          }}>CC</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{i.app.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{i.app.subtitle}</div>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <item.icon size={15} />
            <span>{i.nav[item.key]}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px 3px 8px",
          borderRadius: 20,
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 4px rgba(34, 197, 94, 0.5)",
          }} />
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.03em",
          }}>
            v{version}
          </span>
        </div>
      </div>
    </aside>
  );
}
