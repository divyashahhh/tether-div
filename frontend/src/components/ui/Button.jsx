/**
 * Buttons adapted from 21st.dev prebuiltui "Button UI":
 *  - BorderButton: "Button With Dual Border Animation" (spinning conic border), in Tether red
 *  - Button variant="glow": "Glowing Button With Hover Effect"
 *  - Button variant="quiet": "Quick Action Buttons" (bordered, icon + label)
 */

export function BorderButton({ children, className = "", disabled, ...props }) {
  return (
    <div
      className={`group relative block w-full overflow-hidden rounded-full p-[1.5px] transition duration-300 before:absolute before:inset-[-150%] before:animate-spin-gradient before:bg-[conic-gradient(from_0deg,_#ff3552,_#5e0b19_25%,_#f0203e_50%,_#5e0b19_75%,_#ff3552)] before:content-[''] ${
        disabled ? "opacity-50" : "hover:scale-[1.02] active:scale-[0.98]"
      } ${className}`}
    >
      <button
        disabled={disabled}
        className="relative z-10 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-brand-blood to-ink text-sm font-semibold text-fg disabled:cursor-not-allowed"
        {...props}
      >
        {children}
      </button>
    </div>
  );
}

const VARIANTS = {
  primary:
    "bg-gradient-to-b from-brand-bright to-brand-deep text-white shadow-glow hover:brightness-110 disabled:shadow-none",
  quiet: "border border-line bg-surface-2 text-fg hover:bg-surface-3",
  ghost: "text-muted hover:text-fg",
  danger: "border border-brand/30 bg-brand/10 text-brand-bright hover:bg-brand/20"
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const sizes = { sm: "h-9 px-4 text-xs", md: "h-11 px-5 text-sm", lg: "h-12 px-6 text-sm" };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlowIconButton({ children, label, className = "", ...props }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-white/10 p-px transition-all duration-300 hover:scale-105 active:scale-95 ${className}`}>
      <div className="pointer-events-none absolute -bottom-12 left-1/2 size-14 -translate-x-1/2 rounded-full bg-brand blur-xl transition-all duration-200 group-hover:-bottom-9 group-active:-bottom-9" />
      <button
        aria-label={label}
        className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-1 rounded-[15px] bg-gradient-to-t from-black/40 to-ink px-3 py-3 text-xs font-medium text-fg"
        {...props}
      >
        {children}
      </button>
    </div>
  );
}
