import { useState } from "react";
import { IconLock, IconMail, IconUser } from "../components/Icons";
import { Wordmark } from "../components/PhoneShell";
import { BorderButton } from "../components/ui/Button";
import { ErrorText, IconInput, SparkleBadge, Spinner } from "../components/ui/Primitives";
import { useAuth } from "../features/auth/AuthProvider";

/** Sign in / sign up — layout from 21st.dev prebuiltui "Modern Login Form With Icons". */
export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSignUp = mode === "signup";

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isSignUp) await signUp(form.email, form.password, form.displayName);
      else await signIn(form.email, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-7 pb-8 pt-16 no-scrollbar sm:pt-20">
      <div className="relative mb-10 flex flex-col items-center text-center">
        <div className="pointer-events-none absolute -top-10 size-56 rounded-full bg-brand/25 blur-3xl" />
        <div className="relative mb-6 flex size-20 items-center justify-center rounded-[28px] border border-brand/30 bg-gradient-to-br from-brand-blood to-ink shadow-glow">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
            <circle cx="14" cy="20" r="7.5" stroke="#ff3552" strokeWidth="2.6" />
            <circle cx="26" cy="20" r="7.5" stroke="#f5eeee" strokeWidth="2.6" />
          </svg>
        </div>
        <SparkleBadge>Two people · one tether</SparkleBadge>
        <Wordmark className="mt-4 text-5xl" />
        <p className="mt-2 text-sm text-muted">Stay close, whatever the distance or timezone.</p>
      </div>

      <form onSubmit={submit} className="animate-pop-in">
        <h1 className="text-2xl font-semibold">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{isSignUp ? "It takes ten seconds." : "Please sign in to continue."}</p>

        <div className="space-y-3">
          {isSignUp ? (
            <IconInput
              icon={<IconUser size={18} />}
              placeholder="Your name"
              value={form.displayName}
              onChange={update("displayName")}
              autoComplete="given-name"
              required
              maxLength={40}
            />
          ) : null}
          <IconInput
            icon={<IconMail size={18} />}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={update("email")}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
          <IconInput
            icon={<IconLock size={18} />}
            type="password"
            placeholder={isSignUp ? "Password (6+ characters)" : "Password"}
            value={form.password}
            onChange={update("password")}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 6 : undefined}
            required
          />
        </div>

        <ErrorText>{error}</ErrorText>

        <BorderButton type="submit" disabled={busy} className="mt-6">
          {busy ? <Spinner /> : null}
          {isSignUp ? "Create account" : "Sign in"}
        </BorderButton>

        <p className="mt-5 text-center text-sm text-muted">
          {isSignUp ? "Already have an account? " : "Don’t have an account? "}
          <button
            type="button"
            className="font-semibold text-brand-bright"
            onClick={() => {
              setMode(isSignUp ? "signin" : "signup");
              setError("");
            }}
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </form>
    </div>
  );
}
