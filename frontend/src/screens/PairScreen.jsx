import { useEffect, useRef, useState } from "react";
import { api, DEMO_MODE } from "../api/client";
import { TopBar, Wordmark } from "../components/PhoneShell";
import { BorderButton, Button } from "../components/ui/Button";
import { GlowCard } from "../components/ui/GlowCard";
import { Badge, ErrorText, Spinner } from "../components/ui/Primitives";
import { useAuth } from "../features/auth/AuthProvider";
import { usePair } from "../features/sync/PairProvider";
import { countdown } from "../lib/time";

const CODE_LENGTH = 6;

export function PairScreen() {
  const { user, signOut } = useAuth();
  const { refreshPair, connection } = usePair();
  const [mode, setMode] = useState("choose");
  const [generated, setGenerated] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!generated) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [generated]);

  const msLeft = generated ? new Date(generated.expires_at).getTime() - now : 0;
  const expired = generated && msLeft <= 0;

  async function generate() {
    setBusy(true);
    setError("");
    try {
      setGenerated(await api.createCode());
      setNow(Date.now());
      setMode("show");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function redeem(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.redeemCode(code);
      await refreshPair();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(generated.code);
    } catch {
      /* clipboard needs https — the code is on screen anyway */
    }
  }

  return (
    <>
      <TopBar
        left={<Wordmark />}
        right={
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        }
      />
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-6 no-scrollbar">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-bright">Step 2 of 2</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">Tether with your person</h1>
        <p className="mt-2 text-sm text-muted">
          One of you creates a code, the other types it in on their own phone. You’ll both jump in the moment it connects.
        </p>
        {DEMO_MODE ? (
          <p className="mt-4 rounded-2xl border border-brand/25 bg-brand-wine/30 px-4 py-2.5 text-xs text-muted">
            <span className="font-semibold text-brand-bright">Demo mode</span> — type any code (or generate one) to connect with Sam, a simulated partner.
          </p>
        ) : null}

        {mode === "choose" ? (
          <div className="mt-8 space-y-4 animate-pop-in">
            <GlowCard alwaysOn innerClassName="p-5">
              <p className="text-sm font-semibold">Create a code</p>
              <p className="mb-4 mt-1 text-xs text-muted">Share it by text or read it out. It lasts 10 minutes.</p>
              <BorderButton onClick={generate} disabled={busy}>
                {busy ? <Spinner /> : null}Generate pairing code
              </BorderButton>
            </GlowCard>
            <GlowCard innerClassName="p-5">
              <p className="text-sm font-semibold">Got a code?</p>
              <p className="mb-4 mt-1 text-xs text-muted">Enter the 6 characters from your partner’s screen.</p>
              <Button
                variant="quiet"
                className="w-full"
                onClick={() => {
                  setMode("enter");
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                Enter a code
              </Button>
            </GlowCard>
          </div>
        ) : null}

        {mode === "show" && generated ? (
          <GlowCard alwaysOn className="mt-8 animate-pop-in" innerClassName="flex flex-col items-center p-6 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-faint">Your code</p>
            <button type="button" onClick={copyCode} className="mt-4 flex gap-1.5" aria-label={`Pairing code ${generated.code}`}>
              {generated.code.split("").map((ch, i) => (
                <span
                  key={i}
                  className={`flex h-14 w-11 items-center justify-center rounded-xl border text-2xl font-bold ${
                    expired ? "border-line text-faint line-through" : "border-brand/40 bg-brand-wine/40 text-fg"
                  }`}
                >
                  {ch}
                </span>
              ))}
            </button>
            {expired ? (
              <Badge tone="neutral" className="mt-5">Expired</Badge>
            ) : (
              <Badge tone="red" className="mt-5">Expires in {countdown(msLeft)}</Badge>
            )}
            <div className="mt-6 flex items-center gap-2 text-sm text-muted">
              {connection === "live" ? (
                <>
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
                  </span>
                  Waiting for your partner to join…
                </>
              ) : (
                <>Reconnecting…</>
              )}
            </div>
            <div className="mt-6 flex w-full gap-2">
              <Button variant="quiet" className="flex-1" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button variant="quiet" className="flex-1" onClick={generate} disabled={busy}>
                New code
              </Button>
            </div>
          </GlowCard>
        ) : null}

        {mode === "enter" ? (
          <GlowCard alwaysOn className="mt-8 animate-pop-in" innerClassName="p-6">
            <form onSubmit={redeem}>
              <label className="text-xs uppercase tracking-[0.18em] text-faint" htmlFor="pair-code">
                Partner’s code
              </label>
              <div className="relative mt-4" onClick={() => inputRef.current?.focus()}>
                <input
                  id="pair-code"
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH))}
                  className="absolute inset-0 h-full w-full opacity-0"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  inputMode="text"
                />
                <div className="pointer-events-none flex justify-center gap-1.5">
                  {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                    <span
                      key={i}
                      className={`flex h-14 w-11 items-center justify-center rounded-xl border text-2xl font-bold transition ${
                        i === code.length ? "border-brand shadow-glow" : code[i] ? "border-brand/40 bg-brand-wine/40" : "border-line bg-surface-2"
                      }`}
                    >
                      {code[i] || ""}
                    </span>
                  ))}
                </div>
              </div>
              <ErrorText>{error}</ErrorText>
              <BorderButton type="submit" disabled={busy || code.length < (DEMO_MODE ? 1 : CODE_LENGTH)} className="mt-6">
                {busy ? <Spinner /> : null}Tether us
              </BorderButton>
              <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => setMode("choose")}>
                Back
              </Button>
            </form>
          </GlowCard>
        ) : null}

        {mode !== "enter" ? <ErrorText>{error}</ErrorText> : null}
        <p className="mt-auto pt-8 text-center text-xs text-faint">Signed in as {user.email}</p>
      </div>
    </>
  );
}
