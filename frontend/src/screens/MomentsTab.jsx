import { useEffect, useRef, useState } from "react";
import { api, mediaUrl } from "../api/client";
import { IconCamera } from "../components/Icons";
import { BorderButton, Button } from "../components/ui/Button";
import { GlowCard } from "../components/ui/GlowCard";
import { Badge, ErrorText, Spinner } from "../components/ui/Primitives";
import { Sheet } from "../components/ui/Sheet";
import { useToasts } from "../components/ui/ToastStack";
import { useAuth } from "../features/auth/AuthProvider";
import { useLiveResource, usePair } from "../features/sync/PairProvider";
import { REACTIONS, reactionMeta, REFRESH_ON } from "../lib/events";
import { compressImage } from "../lib/image";
import { countdown, formatDayTime, relativeTime } from "../lib/time";

const DAY_MS = 24 * 3600 * 1000;

export function MomentsTab() {
  const { user } = useAuth();
  const { partner } = usePair();
  const { pushToast } = useToasts();
  const moments = useLiveResource(api.moments, REFRESH_ON.moments);
  const stats = useLiveResource(api.stats, ["moment_created"]);
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [startingWindow, setStartingWindow] = useState(false);
  const fileRef = useRef(null);

  const data = moments.data;
  const windowEnds = data?.window_ends_at ? new Date(data.window_ends_at).getTime() : null;
  const windowLeft = windowEnds ? windowEnds - now : 0;
  const windowOpen = windowLeft > 0;

  useEffect(() => {
    if (!windowOpen) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [windowOpen]);

  useEffect(() => {
    setNow(Date.now());
  }, [data?.window_ends_at]);

  if (!data) {
    return <div className="p-6 text-sm text-muted">{moments.error || "Loading moments…"}</div>;
  }

  const mine = data.moments.find((m) => m.creator_id === user.id && Date.now() - new Date(m.created_at) < DAY_MS);
  const theirs = data.moments.find((m) => m.creator_id === partner.id && Date.now() - new Date(m.created_at) < DAY_MS);
  const viewingMoment = viewing ? data.moments.find((m) => m.id === viewing) : null;

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreparing(true);
    try {
      const compressed = await compressImage(file);
      setDraft({ file: compressed, preview: URL.createObjectURL(compressed) });
    } catch (err) {
      pushToast({ icon: "⚠️", text: err.message, tone: "error" });
    } finally {
      setPreparing(false);
    }
  }

  async function startWindow() {
    setStartingWindow(true);
    try {
      await api.startMomentWindow();
      await moments.reload();
    } catch (err) {
      pushToast({ icon: "⚠️", text: err.message, tone: "error" });
    } finally {
      setStartingWindow(false);
    }
  }

  return (
    <div className="space-y-4 px-5 pb-6 pt-2">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} />

      <GlowCard alwaysOn={windowOpen} innerClassName="overflow-hidden">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[23px] bg-gradient-to-br from-brand-blood via-surface-2 to-ink">
          {mine?.image_url ? <img src={mediaUrl(mine.image_url)} alt="Your moment today" className="absolute inset-0 h-full w-full object-cover" /> : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90" />

          <div className="absolute inset-x-4 top-4 flex gap-1">
            {[mine, theirs].map((m, i) => (
              <span key={i} className={`h-[3px] flex-1 rounded-full ${m ? "bg-white" : "bg-white/30"}`} />
            ))}
          </div>

          {theirs ? (
            <button
              type="button"
              onClick={() => !theirs.locked && setViewing(theirs.id)}
              className="absolute right-4 top-9 h-28 w-[5.5rem] overflow-hidden rounded-2xl border-2 border-ink shadow-card"
              aria-label={`${partner.display_name}'s moment`}
            >
              {theirs.locked ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-brand-wine/80 text-[10px] text-white/80 backdrop-blur">
                  <span className="text-lg">🔒</span>
                  {partner.display_name}
                </div>
              ) : (
                <img src={mediaUrl(theirs.image_url)} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ) : null}

          <div className="absolute inset-x-5 bottom-5">
            <Badge tone="glass">Today’s prompt</Badge>
            <h2 className="mt-2 text-xl font-semibold leading-snug text-white">{data.prompt}</h2>
            {mine ? (
              <p className="mt-1 text-sm text-white/75">
                {mine.caption ? `“${mine.caption}” · ` : ""}shared {relativeTime(mine.created_at)}
                {mine.on_time ? " · on time ⚡️" : ""}
              </p>
            ) : null}

            {/* Glass notice — from 21st.dev prebuiltui "Notify Card With Glass Effect" */}
            {theirs?.locked ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
                <p>{partner.display_name} posted. Share yours to unlock.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {windowOpen ? (
            <div className="flex items-center justify-between rounded-2xl border border-brand/40 bg-brand-wine/40 px-4 py-2.5">
              <div>
                <p className="text-xs text-muted">
                  {data.window_started_by === user.id ? "You opened" : `${partner.display_name} opened`} a capture window
                </p>
                <p className="text-sm font-semibold">Post now to be on time</p>
              </div>
              <span className="text-2xl font-bold tabular-nums text-brand-bright">{countdown(windowLeft)}</span>
            </div>
          ) : null}

          {data.posted_today ? (
            <p className="text-center text-sm text-muted">You’ve shared today’s Moment. See you tomorrow ✨</p>
          ) : (
            <>
              <BorderButton onClick={() => fileRef.current?.click()} disabled={preparing}>
                {preparing ? <Spinner /> : <IconCamera size={18} />}
                Capture today’s Moment
              </BorderButton>
              {!windowOpen ? (
                <Button variant="quiet" className="w-full" onClick={startWindow} disabled={startingWindow}>
                  ⏱ Start a 5-minute window together
                </Button>
              ) : null}
            </>
          )}
        </div>
      </GlowCard>

      <div>
        <p className="section-label">Streak</p>
        <div className="rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">
                {stats.data?.streak ?? 0}
                <span className="ml-1 text-base font-medium text-muted">day{stats.data?.streak === 1 ? "" : "s"}</span>
              </p>
              <p className="text-xs text-muted">both of you posting in a row</p>
            </div>
            <Badge tone={stats.data?.streak ? "red" : "neutral"}>🔥 {stats.data?.week_both ?? 0}/7 this week</Badge>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {(stats.data?.week || []).map((d) => {
              const both = d.me && d.partner;
              return (
                <div
                  key={d.day_key}
                  className={`flex flex-col items-center rounded-2xl border py-2 ${both ? "border-brand/50 bg-brand-wine/50" : "border-line bg-surface-2"}`}
                >
                  <span className="text-[10px] text-faint">{d.weekday}</span>
                  <span className="text-sm font-semibold">{d.day}</span>
                  <span className="mt-1 flex gap-0.5">
                    <span className={`size-1.5 rounded-full ${d.me ? "bg-brand-bright" : "bg-white/15"}`} title="You" />
                    <span className={`size-1.5 rounded-full ${d.partner ? "bg-fg" : "bg-white/15"}`} title={partner.display_name} />
                  </span>
                </div>
              );
            })}
          </div>
          {stats.data ? (
            <p className="mt-3 text-xs text-muted">
              Weekly recap: you posted {stats.data.week_me}/7, {partner.display_name} posted {stats.data.week_partner}/7 ·{" "}
              {stats.data.total_moments} moments together.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="section-label">Timeline</p>
        {data.moments.length === 0 ? (
          <p className="rounded-3xl border border-line bg-surface p-4 text-sm text-muted">Your shared photo timeline starts with today’s Moment.</p>
        ) : (
          /* Grid — from 21st.dev prebuiltui "Image Grid Gallery" with hover caption overlay */
          <div className="grid grid-cols-2 gap-2.5">
            {data.moments.map((m) => {
              const mineMoment = m.creator_id === user.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => !m.locked && setViewing(m.id)}
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-surface-2 text-left"
                >
                  {m.locked ? (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-brand-wine to-ink text-xs text-muted">
                      <span className="text-2xl">🔒</span>Post yours to see
                    </div>
                  ) : (
                    <img src={mediaUrl(m.image_url)} alt={m.caption || "Moment"} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  )}
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/10 to-transparent p-3 opacity-90 transition group-hover:opacity-100">
                    <p className="text-xs font-semibold text-white">{mineMoment ? "You" : partner.display_name}</p>
                    <p className="truncate text-[11px] text-white/70">{m.caption || relativeTime(m.created_at)}</p>
                  </div>
                  {m.reactions.length ? (
                    <span className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-xs backdrop-blur">
                      {m.reactions.map((r) => reactionMeta(r.reaction).emoji).join("")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DraftSheet
        draft={draft}
        onClose={() => {
          if (draft) URL.revokeObjectURL(draft.preview);
          setDraft(null);
        }}
        onPosted={moments.reload}
        windowOpen={windowOpen}
      />
      <MomentViewer moment={viewingMoment} onClose={() => setViewing(null)} onReacted={moments.reload} />
    </div>
  );
}

function DraftSheet({ draft, onClose, onPosted, windowOpen }) {
  const { pushToast } = useToasts();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post() {
    setBusy(true);
    setError("");
    try {
      const result = await api.createMoment(draft.file, caption);
      pushToast({ icon: "📸", text: result.on_time ? "Moment shared — right on time!" : "Moment shared" });
      setCaption("");
      await onPosted();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title="Share this Moment?">
      {draft ? (
        <>
          <img src={draft.preview} alt="Preview" className="aspect-[4/5] w-full rounded-3xl object-cover" />
          <p className="mt-2 text-center text-[11px] text-faint">
            {Math.round(draft.file.size / 1024)} KB · {windowOpen ? "inside the window ⚡️" : "only one per day"}
          </p>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Add a caption (optional)" className="field mt-3" />
          <ErrorText>{error}</ErrorText>
          <BorderButton onClick={post} disabled={busy} className="mt-4">
            {busy ? <Spinner /> : null}Share with your partner
          </BorderButton>
        </>
      ) : null}
    </Sheet>
  );
}

function MomentViewer({ moment, onClose, onReacted }) {
  const { user } = useAuth();
  const { partner } = usePair();
  const [error, setError] = useState("");
  if (!moment) return null;

  const mine = moment.creator_id === user.id;
  const myReaction = moment.reactions.find((r) => r.user_id === user.id)?.reaction;
  const theirReaction = moment.reactions.find((r) => r.user_id !== user.id)?.reaction;

  async function react(id) {
    setError("");
    try {
      await api.react(moment.id, id);
      await onReacted();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet open onClose={onClose} title={mine ? "Your Moment" : `${partner.display_name}’s Moment`}>
      <img src={mediaUrl(moment.image_url)} alt={moment.caption || "Moment"} className="w-full rounded-3xl object-cover" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{formatDayTime(moment.created_at, user.timezone)}</Badge>
        {moment.on_time ? <Badge tone="red">On time ⚡️</Badge> : null}
      </div>
      {moment.caption ? <p className="mt-3 text-base">“{moment.caption}”</p> : null}
      <p className="mt-1 text-xs text-faint">Prompt: {moment.prompt}</p>

      {theirReaction ? (
        <p className="mt-4 text-sm text-muted">
          {mine ? partner.display_name : "They"} reacted {reactionMeta(theirReaction).emoji} {reactionMeta(theirReaction).label}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => react(r.id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border py-3 text-xs transition active:scale-95 ${
              myReaction === r.id ? "border-brand bg-brand-wine/50 text-fg shadow-glow" : "border-line bg-surface-2 text-muted"
            }`}
          >
            <span className="text-2xl">{r.emoji}</span>
            {r.label}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
