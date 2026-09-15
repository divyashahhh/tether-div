import { useMemo, useState } from "react";
import { IconGlobe, IconUser } from "../components/Icons";
import { BorderButton } from "../components/ui/Button";
import { ErrorText, IconInput, Spinner } from "../components/ui/Primitives";
import { useAuth } from "../features/auth/AuthProvider";
import { allTimezones, cityOf, detectTimezone, formatTime } from "../lib/time";

export function ProfileForm({ submitLabel = "Continue", onDone }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.display_name);
  const [timezone, setTimezone] = useState(user.profile_complete ? user.timezone : detectTimezone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zones = useMemo(() => allTimezones(), []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await updateProfile({ display_name: name, timezone });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <IconInput icon={<IconUser size={18} />} value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" required maxLength={40} />
      <label className="flex h-12 w-full items-center gap-3 rounded-full border border-line bg-surface-2 pl-5 pr-4 focus-within:border-brand/60">
        <span className="text-faint">
          <IconGlobe size={18} />
        </span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-full w-full bg-transparent text-sm outline-none">
          {zones.map((tz) => (
            <option key={tz} value={tz} className="bg-surface">
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <p className="px-2 text-xs text-faint">
        It’s {formatTime(new Date(), timezone)} in {cityOf(timezone)}. Your partner sees your local time and when you’re asleep.
      </p>
      <ErrorText>{error}</ErrorText>
      <BorderButton type="submit" disabled={busy || !name.trim()} className="!mt-5">
        {busy ? <Spinner /> : null}
        {submitLabel}
      </BorderButton>
    </form>
  );
}

export function ProfileSetupScreen() {
  const { user } = useAuth();
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-7 pb-8 pt-20 no-scrollbar">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-bright">Step 1 of 2</p>
      <h1 className="mt-2 text-3xl font-semibold">Hi {user.display_name} 👋</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Confirm your name and where in the world you are.</p>
      <ProfileForm />
    </div>
  );
}
