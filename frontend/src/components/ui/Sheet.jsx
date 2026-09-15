import { useEffect } from "react";

/** Bottom sheet used for composing notes, plans, moods and profile edits. */
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[88%] w-full animate-pop-in overflow-y-auto rounded-t-[28px] border-t border-brand/20 bg-surface px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 shadow-[0_-20px_60px_-20px_rgba(240,32,62,0.35)] no-scrollbar">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:text-fg" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5 5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
