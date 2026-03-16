import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, CheckCircle, ArrowRight, Download } from "lucide-react";
import { t } from "../lib/i18n";

interface UpdateInfo {
  item_type: string; item_id: string; item_name: string;
  current_version: string; latest_version: string;
}

export default function Updates() {
  const [updates, setUpdates] = useState<UpdateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const i = t();

  useEffect(() => { check(); }, []);

  async function check() {
    setLoading(true);
    try { setUpdates(await invoke<UpdateInfo[]>("check_updates")); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.updates.checking}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.updates.title}</h2>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {updates.length > 1 && (
            <button className="btn btn-primary btn-sm"><Download size={14} />{i.updates.updateAll}</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={check}><RefreshCw size={14} />{i.updates.checkNow}</button>
        </div>
      </div>

      {updates.length === 0 ? (
        <div className="card empty-state" style={{ flex: 1 }}>
          <div className="empty-icon" style={{ background: "var(--success-subtle)", borderColor: "transparent" }}>
            <CheckCircle size={28} style={{ color: "var(--success)" }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{i.updates.allUpToDate}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>{i.updates.allUpToDateTip}</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }} className="stagger">
          {updates.map((update) => (
            <div key={update.item_id} className="card card-hover" style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div className="icon-box" style={{ background: "var(--warning-subtle)" }}>
                  <Download size={17} style={{ color: "var(--warning)" }} />
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{update.item_name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span className="badge badge-muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{update.current_version}</span>
                    <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
                    <span className="badge badge-success" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{update.latest_version}</span>
                  </div>
                </div>
              </div>
              <button className="btn btn-primary btn-sm"><Download size={14} />{i.updates.update}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
