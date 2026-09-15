import { useEffect, useRef, useState } from "react";

/** Account dropdown — adapted from 21st.dev prebuiltui "User Select Dropdown". */
export function Menu({ trigger, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="rounded-full transition active:scale-95">
        {trigger}
      </button>
      {open ? (
        <ul role="menu" className="absolute right-0 z-30 mt-2 w-56 animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface-2/95 py-1.5 text-sm shadow-card backdrop-blur-md">
          {items.map((item) =>
            item.divider ? (
              <li key={item.key} className="my-1.5 h-px bg-line" />
            ) : item.header ? (
              <li key={item.key} className="px-4 pb-2 pt-1.5">
                {item.header}
              </li>
            ) : (
              <li key={item.key}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-brand hover:text-white ${
                    item.danger ? "text-brand-bright" : "text-fg"
                  }`}
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            )
          )}
        </ul>
      ) : null}
    </div>
  );
}
