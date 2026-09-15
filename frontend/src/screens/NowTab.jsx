import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { IconBriefcase, IconHeart, IconMail, IconMoon, IconSparkle, IconSun } from "../components/Icons";
import { BorderButton, GlowIconButton } from "../components/ui/Button";
import { GlowCard } from "../components/ui/GlowCard";
import { Avatar, Badge, ErrorText, Spinner } from "../components/ui/Primitives";
import { Sheet } from "../components/ui/Sheet";
import { useToasts } from "../components/ui/ToastStack";
import { useAuth } from "../features/auth/AuthProvider";
import { useLiveResource, usePair } from "../features/sync/PairProvider";
import { describeEvent, MOODS, REFRESH_ON } from "../lib/events";
import { cityOf, formatTime, formatWeekdayTime, hourOffset, relativeTime } from "../lib/time";

const STATE_META = {
  sleep: { label: "Asleep", icon: IconMoon, tone: "neutral" },
  busy: { label: "Busy", icon: IconBriefcase, tone: "neutral" },
  preferred: { label: "Free to talk", icon: IconSparkle, tone: "live" },
  free: { label: "Around", icon: IconSun, tone: "neutral" }
};

function useTick(ms) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function NowTab({ onPlanCall }) {
  const { user } = useAuth();
  const { partner, partnerOnline, events } = usePair();
  const { pushToast } = useToasts();
  const availability = useLiveResource(api.availability, REFRESH_ON.availability);
  const slots = useLiveResource(api.callSlots, REFRESH_ON.availability);
  const [sheet, setSheet] = useState(null);
  const [pinging, setPinging] = useState(false);
  useTick(30000);

  const partnerState = STATE_META[availability.data?.partner.state_now] || null;
  const offset = hourOffset(user.timezone, partner.timezone);
  const best = slots.data?.[0];

  async function ping() {
    setPinging(true);
    try {
      await api.sendNudge();
      pushToast({ icon: "❤️", text: `Sent to ${partner.display_name}` });
    } catch (err) {
      pushToast({ icon: "⚠️", text: err.message, tone: "error" });
    } finally {
      setTimeout(() => setPinging(false), 600);
    }
  }

  return (
    <div className="space-y-4 px-5 pb-6 pt-2">
      <GlowCard alwaysOn={partnerOnline} innerClassName="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Avatar name={user.display_name} size="md" />
            <div className="relative mx-2 h-px w-12 bg-gradient-to-r from-brand-deep via-brand to-brand-deep">
              <span className={`absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ${partnerOnline ? "animate-ping" : ""}`} />
            </div>
            <Avatar name={partner.display_name} size="md" online={partnerOnline} ring={partnerOnline} />
          </div>
          <Badge tone={partnerOnline ? "live" : "neutral"}>{partnerOnline ? "Online now" : "Offline"}</Badge>
        </div>
        <h2 className="mt-4 text-2xl font-semibold">{partner.display_name}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {partner.mood_emoji ? (
            <>
              {partner.mood_emoji} {partner.mood_note ? `feeling ${partner.mood_note}` : "set a mood"} · {relativeTime(partner.mood_at)}
            </>
          ) : (
            "No mood shared yet"
          )}
        </p>
      </GlowCard>

      <HoldTogether partnerName={partner.display_name} />

      <div className="grid grid-cols-3 gap-2.5">
        <GlowIconButton label="Send thinking of you" onClick={ping} disabled={pinging}>
          <IconHeart size={22} className={`text-brand-bright ${pinging ? "animate-heartbeat" : ""}`} />
          Thinking of you
        </GlowIconButton>
        <GlowIconButton label="Write a note" onClick={() => setSheet("note")}>
          <IconMail size={22} className="text-fg" />
          Send a note
        </GlowIconButton>
        <GlowIconButton label="Share your mood" onClick={() => setSheet("mood")}>
          <span className="text-[22px] leading-[22px]">{user.mood_emoji || "🙂"}</span>
          My mood
        </GlowIconButton>
      </div>

      <div>
        <p className="section-label">Local times</p>
        <div className="grid grid-cols-2 gap-2.5">
          <ClockCard label="You" timezone={user.timezone} state={STATE_META[availability.data?.me.state_now]} />
          <ClockCard
            label={partner.display_name}
            timezone={partner.timezone}
            state={partnerState}
            hint={offset === 0 ? "Same time as you" : `${offset > 0 ? "+" : ""}${offset}h from you`}
          />
        </div>
      </div>

      <div>
        <p className="section-label">Best time to connect</p>
        <GlowCard innerClassName="p-4">
          {best ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{formatWeekdayTime(best.starts_at, user.timezone)}</p>
                  <p className="text-xs text-muted">
                    {formatWeekdayTime(best.starts_at, partner.timezone)} for {partner.display_name}
                  </p>
                </div>
                <Badge tone="red">Score {best.score}</Badge>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-deep to-brand-bright" style={{ width: `${best.score}%` }} />
              </div>
              <button type="button" onClick={onPlanCall} className="mt-3 text-xs font-semibold text-brand-bright">
                See all times & plan a call →
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">{slots.data ? "No overlap in the next 24h — try adjusting availability in Plans." : "Finding overlap…"}</p>
          )}
        </GlowCard>
      </div>

      <div>
        <p className="section-label">Live activity</p>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted">Pings, notes, moments and plans from both of you show up here instantly.</p>
          ) : (
            events.slice(0, 10).map((event) => {
              const { icon, text } = describeEvent(event);
              const mine = event.sender_id === user.id;
              return (
                <div key={event.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm">
                      <span className={`font-semibold ${mine ? "text-muted" : "text-fg"}`}>{mine ? "You" : partner.display_name}</span> {text}
                    </p>
                    <p className="text-[11px] text-faint">{relativeTime(event.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <NoteSheet open={sheet === "note"} onClose={() => setSheet(null)} partnerName={partner.display_name} />
      <MoodSheet open={sheet === "mood"} onClose={() => setSheet(null)} />
    </div>
  );
}

function ClockCard({ label, timezone, state, hint }) {
  const Icon = state?.icon;
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatTime(new Date(), timezone)}</p>
      <p className="truncate text-[11px] text-faint">{hint || cityOf(timezone)}</p>
      {state ? (
        <Badge tone={state.tone} className="mt-3" icon={<Icon size={12} />}>
          {state.label}
        </Badge>
      ) : null}
    </div>
  );
}

/** Press and hold: your partner's screen glows while you hold. Both holding = in sync. */
function HoldTogether({ partnerName }) {
  const { partnerTouching, partnerOnline, sendTouch } = usePair();
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);

  const set = (active) => {
    if (holdingRef.current === active) return;
    holdingRef.current = active;
    setHolding(active);
    sendTouch(active);
    if (active && navigator.vibrate) navigator.vibrate(30);
  };

  useEffect(() => () => holdingRef.current && sendTouch(false), [sendTouch]);
  useEffect(() => {
    if (holding && partnerTouching && navigator.vibrate) navigator.vibrate([40, 40, 40]);
  }, [holding, partnerTouching]);

  const inSync = holding && partnerTouching;
  const status = inSync
    ? "In sync 💞"
    : partnerTouching
      ? `${partnerName} is holding — hold too`
      : holding
        ? partnerOnline
          ? `${partnerName} can feel it`
          : `${partnerName} is offline`
        : "Hold the heart together";

  return (
    <div
      className={`relative flex items-center gap-4 overflow-hidden rounded-3xl border p-4 transition-colors duration-500 ${
        inSync ? "border-brand/60 bg-brand-wine/60" : partnerTouching ? "border-brand/40 bg-brand-wine/30" : "border-line bg-surface"
      }`}
    >
      <button
        type="button"
        aria-label="Hold to send a heartbeat"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex size-16 shrink-0 touch-none select-none items-center justify-center rounded-full bg-gradient-to-b from-brand-bright to-brand-deep text-white shadow-glow"
      >
        {partnerTouching ? <span className="absolute inset-0 animate-ripple rounded-full bg-brand" /> : null}
        {inSync ? <span className="absolute inset-0 animate-ripple rounded-full bg-brand [animation-delay:0.5s]" /> : null}
        <IconHeart size={28} className={`relative ${holding || partnerTouching ? "animate-heartbeat" : ""}`} />
      </button>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{status}</p>
        <p className="text-xs text-muted">Live heartbeat — your partner sees it the moment you press.</p>
      </div>
    </div>
  );
}

function NoteSheet({ open, onClose, partnerName }) {
  const { pushToast } = useToasts();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.sendNote(message);
      pushToast({ icon: "✉️", text: `Note sent to ${partnerName}` });
      setMessage("");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Note to ${partnerName}`}>
      <form onSubmit={send}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={280}
          autoFocus
          placeholder="Good morning, you…"
          className="w-full resize-none rounded-3xl border border-line bg-surface-2 p-4 text-sm outline-none placeholder:text-faint focus:border-brand/60"
        />
        <p className="mt-1 text-right text-[11px] text-faint">{message.length}/280</p>
        <ErrorText>{error}</ErrorText>
        <BorderButton type="submit" disabled={busy || !message.trim()} className="mt-3">
          {busy ? <Spinner /> : null}Send note
        </BorderButton>
      </form>
    </Sheet>
  );
}

function MoodSheet({ open, onClose }) {
  const { user, refreshMe } = useAuth();
  const [emoji, setEmoji] = useState(user.mood_emoji || MOODS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.setMood(emoji, note);
      await refreshMe();
      setNote("");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="How are you feeling?">
      <form onSubmit={save}>
        <div className="grid grid-cols-5 gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setEmoji(m)}
              className={`flex aspect-square items-center justify-center rounded-2xl border text-2xl transition active:scale-90 ${
                emoji === m ? "border-brand bg-brand-wine/50 shadow-glow" : "border-line bg-surface-2"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={80}
          placeholder="In a word or two… (optional)"
          className="field mt-4"
        />
        <ErrorText>{error}</ErrorText>
        <BorderButton type="submit" disabled={busy} className="mt-4">
          {busy ? <Spinner /> : null}Share mood
        </BorderButton>
      </form>
    </Sheet>
  );
}
