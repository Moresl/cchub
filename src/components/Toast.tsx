import { useState, useEffect, useCallback } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

let addToastFn: ((type: ToastType, message: string) => void) | null = null;

export function showToast(type: ToastType, message: string) {
  addToastFn?.(type, message);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const icons = { success: CheckCircle, error: AlertCircle, info: Info };
  const colors = {
    success: { bg: "var(--success-subtle)", border: "var(--success)", icon: "var(--success)" },
    error: { bg: "var(--danger-subtle)", border: "var(--danger)", icon: "var(--danger)" },
    info: { bg: "var(--accent-subtle)", border: "var(--accent)", icon: "var(--accent)" },
  };

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
      {toasts.map(toast => {
        const Icon = icons[toast.type];
        const color = colors[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px",
              borderRadius: 8, background: color.bg, border: `1px solid ${color.border}`,
              animation: "slideIn 0.2s ease",
            }}
          >
            <Icon size={16} style={{ color: color.icon, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1, lineHeight: 1.5 }}>{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
