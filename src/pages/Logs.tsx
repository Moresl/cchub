import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, RefreshCw, Calendar } from "lucide-react";
import { getLocale } from "../lib/i18n";

interface ActivityItem {
  id: number;
  server_id: string;
  server_name: string;
  request_type: string;
  status: string;
  latency_ms: number | null;
  recorded_at: string;
}

interface HeatmapDay {
  date: string;
  count: number;
}

export default function Logs() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const locale = getLocale();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [acts, hm] = await Promise.all([
        invoke<ActivityItem[]>("get_activity_logs", { date: selectedDate }),
        invoke<HeatmapDay[]>("get_activity_heatmap", { days: 30 }),
      ]);
      setActivities(acts);
      setHeatmap(hm);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    invoke<ActivityItem[]>("get_activity_logs", { date: selectedDate })
      .then(setActivities)
      .catch(console.error);
  }, [selectedDate]);

  // Build 30-day grid
  const heatmapGrid = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of heatmap) map[d.date] = d.count;
    const days: { date: string; count: number; label: string }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = dateStr(d);
      days.push({ date: ds, count: map[ds] || 0, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    return days;
  }, [heatmap]);

  const maxCount = Math.max(1, ...heatmapGrid.map(d => d.count));

  if (loading) {
    return <div className="loading-center"><div className="spinner" /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{locale === "zh" ? "加载中..." : "Loading..."}</span></div>;
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{locale === "zh" ? "请求日志" : "Request Logs"}</h2>
          <p className="page-subtitle">{locale === "zh" ? "MCP 服务器活动记录与统计" : "MCP server activity and statistics"}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={14} />{locale === "zh" ? "刷新" : "Refresh"}
        </button>
      </div>

      {/* Activity Heatmap */}
      <div className="section-card" style={{ marginBottom: 20, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Calendar size={14} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {locale === "zh" ? "活动热力图（近30天）" : "Activity Heatmap (30 days)"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(30, 1fr)", gap: 3 }}>
          {heatmapGrid.map(day => {
            const intensity = day.count / maxCount;
            const isSelected = day.date === selectedDate;
            return (
              <div
                key={day.date}
                title={`${day.label}: ${day.count} ${locale === "zh" ? "次请求" : "requests"}`}
                onClick={() => setSelectedDate(day.date)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 3,
                  cursor: "pointer",
                  background: day.count === 0
                    ? "var(--bg-elevated)"
                    : `rgba(250, 250, 250, ${0.1 + intensity * 0.5})`,
                  border: isSelected ? "2px solid var(--text-primary)" : "1px solid transparent",
                  transition: "all 0.1s ease",
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{heatmapGrid[0]?.label}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{locale === "zh" ? "今天" : "Today"}</span>
        </div>
      </div>

      {/* Activity Log */}
      <div className="section-card" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {locale === "zh" ? `${selectedDate} 的活动` : `Activity on ${selectedDate}`}
            </span>
            <span className="badge badge-muted" style={{ fontSize: 10 }}>{activities.length}</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {activities.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 13 }}>
              {locale === "zh" ? "当日无活动记录" : "No activity on this date"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {activities.map(item => (
                <div key={item.id} className="list-row" style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span className={`dot ${item.status === "success" ? "dot-active" : item.status === "error" ? "dot-error" : "dot-disabled"}`} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.server_name}</span>
                    <span className="badge badge-muted" style={{ fontSize: 10 }}>{item.request_type}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    {item.latency_ms != null && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.latency_ms}ms
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {item.recorded_at.split("T")[1]?.slice(0, 8) || item.recorded_at}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function todayStr() {
  const d = new Date();
  return dateStr(d);
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
