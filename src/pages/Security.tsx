import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Shield, ShieldCheck, AlertTriangle, AlertCircle, Info, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { t, tReplace } from "../lib/i18n";

interface SecurityFinding {
  category: string;
  severity: string;
  title: string;
  description: string;
}

interface SecurityAuditResult {
  server_id: string;
  server_name: string;
  risk_level: string;
  findings: SecurityFinding[];
  scanned_at: string;
}

export default function Security() {
  const [results, setResults] = useState<SecurityAuditResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const i = t();
  const locale = localStorage.getItem("cchub-locale") || "zh";

  async function runAudit() {
    setLoading(true);
    try {
      const r = await invoke<SecurityAuditResult[]>("run_security_audit");
      setResults(r);
      setScanned(true);
      // Auto-expand servers with findings
      const exp: Record<string, boolean> = {};
      for (const res of r) {
        if (res.findings.length > 0) exp[res.server_id] = true;
      }
      setExpanded(exp);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { runAudit(); }, []);

  const highCount = results.filter((r) => r.risk_level === "high").length;
  const mediumCount = results.filter((r) => r.risk_level === "medium").length;
  const lowCount = results.filter((r) => r.risk_level === "low").length;
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function getSeverityIcon(severity: string) {
    switch (severity) {
      case "critical": return <AlertTriangle size={14} style={{ color: "var(--danger)" }} />;
      case "warning": return <AlertCircle size={14} style={{ color: "var(--warning)" }} />;
      default: return <Info size={14} style={{ color: "var(--text-muted)" }} />;
    }
  }

  function getRiskBadge(risk: string) {
    switch (risk) {
      case "high": return <span className="badge badge-danger">{i.security.riskHigh}</span>;
      case "medium": return <span className="badge badge-warning">{i.security.riskMedium}</span>;
      default: return <span className="badge badge-success">{i.security.riskLow}</span>;
    }
  }

  function getCategoryLabel(cat: string): string {
    const labels: Record<string, string> = locale === "zh" ? {
      env_secrets: "敏感环境变量",
      shell_exec: "Shell 执行",
      npx_risk: "npx 自动安装",
      network_access: "网络访问",
      file_access: "文件访问",
      config_changed: "配置变更",
    } : {
      env_secrets: "Env Secrets",
      shell_exec: "Shell Execution",
      npx_risk: "npx Auto-install",
      network_access: "Network Access",
      file_access: "File Access",
      config_changed: "Config Changed",
    };
    return labels[cat] || cat;
  }

  if (loading && !scanned) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.security.scanning}</span>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.security.title}</h2>
          <p className="page-subtitle">
            {tReplace(i.security.serverCount, { count: results.length })}
            {totalFindings > 0 && ` · ${totalFindings} ${locale === "zh" ? "个发现" : "findings"}`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={runAudit} disabled={loading}>
          <RefreshCw size={14} />{loading ? i.security.scanning : i.security.runAudit}
        </button>
      </div>

      {/* Summary Bar */}
      {scanned && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div className="stat-card" style={{ flex: 1, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>{highCount}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{i.security.riskHigh}</div>
              </div>
            </div>
          </div>
          <div className="stat-card" style={{ flex: 1, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={18} style={{ color: "var(--warning)" }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--warning)" }}>{mediumCount}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{i.security.riskMedium}</div>
              </div>
            </div>
          </div>
          <div className="stat-card" style={{ flex: 1, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldCheck size={18} style={{ color: "var(--success)" }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{lowCount}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{i.security.riskLow}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!scanned || results.length === 0 ? (
          <div className="card empty-state" style={{ flex: 1 }}>
            <div className="empty-icon"><Shield size={28} style={{ color: "var(--text-muted)" }} /></div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>{i.security.noIssues}</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>{i.security.noIssuesTip}</p>
          </div>
        ) : (
          <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {results.map((result) => (
              <div key={result.server_id} className="card" style={{ padding: "20px 24px" }}>
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                  onClick={() => toggleExpand(result.server_id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ cursor: "pointer" }}>
                      {expanded[result.server_id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <Shield size={18} style={{
                      color: result.risk_level === "high" ? "var(--danger)" : result.risk_level === "medium" ? "var(--warning)" : "var(--success)"
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{result.server_name}</span>
                    {getRiskBadge(result.risk_level)}
                    {result.findings.length > 0 && (
                      <span className="badge badge-muted">{result.findings.length} {locale === "zh" ? "项" : "findings"}</span>
                    )}
                  </div>
                </div>

                {expanded[result.server_id] && result.findings.length > 0 && (
                  <div style={{ marginTop: 16, paddingLeft: 28, display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.findings.map((finding, idx) => (
                      <div key={idx} style={{
                        display: "flex", gap: 10, padding: "12px 16px",
                        borderRadius: 6, background: "var(--bg-elevated)",
                      }}>
                        {getSeverityIcon(finding.severity)}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{finding.title}</span>
                            <span className="badge badge-muted" style={{ fontSize: 10 }}>{getCategoryLabel(finding.category)}</span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{finding.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {expanded[result.server_id] && result.findings.length === 0 && (
                  <div style={{ marginTop: 12, paddingLeft: 28 }}>
                    <p style={{ fontSize: 12, color: "var(--success)" }}>
                      {locale === "zh" ? "未发现安全问题" : "No security issues found"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
