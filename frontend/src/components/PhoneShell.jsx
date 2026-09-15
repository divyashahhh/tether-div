import { ToastViewport } from "./ui/ToastStack";

/**
 * On a real phone the app fills the screen; on a laptop it sits in an iPhone-sized
 * frame so both views look the same during demos.
 */
export function PhoneShell({ children }) {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-ink sm:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(163,17,42,0.35),transparent),radial-gradient(40%_40%_at_90%_100%,rgba(94,11,25,0.45),transparent)] sm:py-6">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-ink sm:h-[860px] sm:max-h-[calc(100dvh-48px)] sm:w-[400px] sm:rounded-[54px] sm:border-[10px] sm:border-[#171213] sm:shadow-[0_40px_120px_-30px_rgba(240,32,62,0.35),0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute left-1/2 top-3 z-50 hidden h-[30px] w-[112px] -translate-x-1/2 rounded-full bg-black sm:block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(163,17,42,0.28),transparent)]" />
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
        <ToastViewport />
      </div>
    </div>
  );
}

export function TopBar({ left, right }) {
  return (
    <header className="relative z-20 flex items-center justify-between px-5 pb-2 pt-[max(env(safe-area-inset-top),14px)] sm:pt-12">
      <div className="min-w-0">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}

export function Wordmark({ className = "" }) {
  return (
    <span className={`bg-gradient-to-r from-brand-bright to-brand bg-clip-text text-2xl font-extrabold tracking-tight text-transparent ${className}`}>
      tether
    </span>
  );
}

export function BottomTabs({ tabs, active, onChange }) {
  return (
    <nav
      className="relative z-20 flex items-stretch justify-around border-t border-line bg-ink/90 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur-xl sm:pb-6"
      role="tablist"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`relative flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold tracking-wide transition ${
              isActive ? "text-brand-bright" : "text-faint hover:text-muted"
            }`}
          >
            {isActive ? <span className="absolute -top-2 h-0.5 w-8 rounded-full bg-brand shadow-glow" /> : null}
            <Icon size={23} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
