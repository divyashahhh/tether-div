import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

/** Live-activity toasts — styled after 21st.dev prebuiltui "Success Alert Fill". */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const pushToast = useCallback(
    ({ icon, title, text, tone = "brand" }) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-1), { id, icon, title, text, tone }]);
      setTimeout(() => dismiss(id), 3800);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ pushToast, toasts, dismiss }), [pushToast, toasts, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** Rendered inside the phone frame so toasts sit at the top of the "screen". */
export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),14px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-white shadow-card backdrop-blur-md ${
              t.tone === "error" ? "border-white/10 bg-surface-3/90" : "border-brand/40 bg-brand-deep/80"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/25 text-base">{t.icon}</span>
              <p className="min-w-0 text-sm leading-snug">
                {t.title ? <span className="font-semibold">{t.title} </span> : null}
                <span className="text-white/85">{t.text}</span>
              </p>
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="shrink-0 text-white/70 transition active:scale-90">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M15 5 5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
  );
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used within ToastProvider");
  return ctx;
}
