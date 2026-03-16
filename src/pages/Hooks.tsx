import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Webhook } from "lucide-react";
import { t, tReplace } from "../lib/i18n";

interface Hook {
  id: string; event: string; matcher: string | null;
  command: string; scope: string; project_path: string | null; enabled: boolean;
}

export default function Hooks() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const i = t();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setHooks(await invoke<Hook[]>("scan_hooks")); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.hooks.loading}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.hooks.title}</h2>
          <p className="page-subtitle">{tReplace(i.hooks.hookCount, { count: hooks.length })}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} />{i.common.refresh}</button>
      </div>

      {hooks.length === 0 ? (
        <div className="card empty-state" style={{ flex: 1 }}>
          <div className="empty-icon"><Webhook size={28} style={{ color: "var(--text-muted)" }} /></div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>{i.hooks.noHooks}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>{i.hooks.noHooksTip}</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }} className="stagger">
          {hooks.map((hook) => (
            <div key={hook.id} className="card card-hover" style={{ padding: "20px 24px", opacity: hook.enabled ? 1 : 0.5 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span className={`dot ${hook.enabled ? "dot-active" : "dot-disabled"}`} />
                  <span className="badge badge-accent" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{hook.event}</span>
                  {hook.matcher && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {i.hooks.matcher}: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{hook.matcher}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="badge badge-muted">{hook.scope === "global" ? i.hooks.global : i.hooks.project}</span>
                  {hook.enabled
                    ? <div className="toggle toggle-sm on"><div className="toggle-knob" /></div>
                    : <div className="toggle toggle-sm off"><div className="toggle-knob" /></div>
                  }
                </div>
              </div>
              <div className="code-block" style={{ marginTop: 14 }}>{hook.command}</div>
              {hook.project_path && (
                <p style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)", marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {hook.project_path}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
