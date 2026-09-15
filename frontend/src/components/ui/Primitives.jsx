import { initials } from "../../lib/events";

/** Pill input with a leading icon — from 21st.dev prebuiltui "Modern Login Form With Icons". */
export function IconInput({ icon, className = "", ...props }) {
  return (
    <label
      className={`flex h-12 w-full items-center gap-3 overflow-hidden rounded-full border border-line bg-surface-2 pl-5 pr-4 transition focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/20 ${className}`}
    >
      <span className="text-faint">{icon}</span>
      <input className="h-full w-full bg-transparent text-sm outline-none placeholder:text-faint" {...props} />
    </label>
  );
}

/** Rounded tag — from 21st.dev prebuiltui "Growth Badge Tag" / "Info Status Badge". */
export function Badge({ children, tone = "red", icon, className = "" }) {
  const tones = {
    red: "border-brand/30 bg-brand/10 text-brand-bright",
    neutral: "border-line bg-white/5 text-muted",
    live: "border-live/30 bg-live/10 text-live",
    glass: "border-white/20 bg-white/10 text-white backdrop-blur-sm"
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/** Sparkle announcement badge — from 21st.dev prebuiltui "Announcement Badge With Sparkle". */
export function SparkleBadge({ children }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-wine/30 py-1 pl-2 pr-3 text-xs text-muted">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M5 4a.75.75 0 0 1 .738.616l.252 1.388A1.25 1.25 0 0 0 6.996 7.01l1.388.252a.75.75 0 0 1 0 1.476l-1.388.252A1.25 1.25 0 0 0 5.99 9.996l-.252 1.388a.75.75 0 0 1-1.476 0L4.01 9.996A1.25 1.25 0 0 0 3.004 8.99l-1.388-.252a.75.75 0 0 1 0-1.476l1.388-.252A1.25 1.25 0 0 0 4.01 6.004l.252-1.388A.75.75 0 0 1 5 4m7-3a.75.75 0 0 1 .721.544l.195.682c.118.415.443.74.858.858l.682.195a.75.75 0 0 1 0 1.442l-.682.195a1.25 1.25 0 0 0-.858.858l-.195.682a.75.75 0 0 1-1.442 0l-.195-.682a1.25 1.25 0 0 0-.858-.858l-.682-.195a.75.75 0 0 1 0-1.442l.682-.195a1.25 1.25 0 0 0 .858-.858l.195-.682A.75.75 0 0 1 12 1m-2 10a.75.75 0 0 1 .728.568.97.97 0 0 0 .704.704.75.75 0 0 1 0 1.456.97.97 0 0 0-.704.704.75.75 0 0 1-1.456 0 .97.97 0 0 0-.704-.704.75.75 0 0 1 0-1.456.97.97 0 0 0 .704-.704A.75.75 0 0 1 10 11"
          fill="#ff3552"
        />
      </svg>
      <span className="font-medium text-brand-bright">{children}</span>
    </div>
  );
}

/** Avatar with presence dot — from 21st.dev prebuiltui "Avatar Group". */
export function Avatar({ name, online, size = "md", ring = false, className = "" }) {
  const sizes = { sm: "size-8 text-[11px]", md: "size-12 text-sm", lg: "size-16 text-lg" };
  const dot = { sm: "size-2.5", md: "size-3", lg: "size-3.5" };
  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`flex items-center justify-center rounded-full bg-gradient-to-br from-brand-deep to-brand-wine font-semibold text-white ${sizes[size]} ${
          ring ? "ring-2 ring-brand/60 ring-offset-2 ring-offset-surface" : ""
        }`}
      >
        {initials(name)}
      </div>
      {online !== undefined ? (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-surface ${dot[size]} ${
            online ? "animate-live-dot bg-live" : "bg-faint"
          }`}
        />
      ) : null}
    </div>
  );
}

/** Toggle — from 21st.dev prebuiltui "Toggle Switch Medium", red when on. */
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`relative inline-flex cursor-pointer items-center gap-3 text-sm text-muted ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="h-7 w-12 rounded-full bg-surface-3 transition-colors duration-200 peer-checked:bg-brand" />
      <span className="absolute left-1 top-1 size-5 rounded-full bg-white transition-transform duration-200 ease-in-out peer-checked:translate-x-5" />
      {label}
    </label>
  );
}

/** Round dot checkbox — from 21st.dev prebuiltui "Dot Checkbox". */
export function DotCheckbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center" aria-label={label}>
      <input type="checkbox" className="peer hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative flex size-6 items-center justify-center rounded-full border border-faint transition peer-checked:border-brand peer-checked:after:absolute peer-checked:after:size-3 peer-checked:after:rounded-full peer-checked:after:bg-brand peer-checked:after:content-['']" />
    </label>
  );
}

export function Spinner({ className = "" }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`} />;
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="mt-3 rounded-2xl border border-brand/25 bg-brand/10 px-4 py-2.5 text-xs text-brand-bright">{children}</p>;
}
