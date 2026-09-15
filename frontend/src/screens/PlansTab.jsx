import { useEffect, useState } from "react";
import { api } from "../api/client";
import { IconBriefcase, IconMoon, IconPlus, IconSearch, IconSparkle, IconTrash } from "../components/Icons";
import { BorderButton, Button } from "../components/ui/Button";
import { GlowCard } from "../components/ui/GlowCard";
import { Badge, DotCheckbox, ErrorText, IconInput, Spinner } from "../components/ui/Primitives";
import { Sheet } from "../components/ui/Sheet";
import { useToasts } from "../components/ui/ToastStack";
import { useAuth } from "../features/auth/AuthProvider";
import { useLiveResource, usePair } from "../features/sync/PairProvider";
import { REFRESH_ON } from "../lib/events";
import { formatDayTime, formatWeekdayTime, isoToLocalInput, localInputToIso, relativeTime } from "../lib/time";

const WINDOWS = [
  { key: "sleep", label: "Sleep", icon: IconMoon },
  { key: "busy", label: "Busy", icon: IconBriefcase },
  { key: "preferred", label: "Best for calls", icon: IconSparkle }
];

export function PlansTab() {
  const { user } = useAuth();
  const { partner } = usePair();
  const { pushToast } = useToasts();
  const plans = useLiveResource(api.plans, REFRESH_ON.plans);
  const slots = useLiveResource(api.callSlots, REFRESH_ON.availability);
  const [editor, setEditor] = useState(null);

  async function toggleDone(plan, done) {
    plans.setData((all) => all.map((p) => (p.id === plan.id ? { ...p, done } : p)));
    try {
      await api.updatePlan(plan.id, { done });
    } catch (err) {
      pushToast({ icon: "⚠️", text: err.message, tone: "error" });
      plans.reload();
    }
  }

  async function remove(plan) {
    plans.setData((all) => all.filter((p) => p.id !== plan.id));
    try {
      await api.deletePlan(plan.id);
    } catch (err) {
      pushToast({ icon: "⚠️", text: err.message, tone: "error" });
      plans.reload();
    }
  }

  const upcoming = (plans.data || []).filter((p) => !p.done);
  const done = (plans.data || []).filter((p) => p.done);

  return (
    <div className="space-y-4 px-5 pb-6 pt-2">
      <div>
        <p className="section-label">Ranked call times · next 24h</p>
        <GlowCard innerClassName="divide-y divide-line">
          {!slots.data ? (
            <p className="p-4 text-sm text-muted">Finding overlap…</p>
          ) : slots.data.length === 0 ? (
            <p className="p-4 text-sm text-muted">No time when you’re both awake. Adjust availability below.</p>
          ) : (
            slots.data.map((slot, i) => (
              <div key={slot.starts_at} className="flex items-center gap-3 p-4">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-brand text-white shadow-glow" : "bg-surface-3 text-muted"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatWeekdayTime(slot.starts_at, user.timezone)} for you</p>
                  <p className="truncate text-xs text-muted">
                    {formatWeekdayTime(slot.starts_at, partner.timezone)} for {partner.display_name} · score {slot.score}
                  </p>
                </div>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => setEditor({ title: `Call with ${partner.display_name}`, starts_at: slot.starts_at })}
                >
                  Plan
                </Button>
              </div>
            ))
          )}
        </GlowCard>
      </div>

      <div>
        <div className="flex items-end justify-between">
          <p className="section-label">Shared plans</p>
          <button type="button" onClick={() => setEditor({})} className="mb-2 flex items-center gap-1 text-xs font-semibold text-brand-bright">
            <IconPlus size={14} /> Add plan
          </button>
        </div>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          {plans.data && plans.data.length === 0 ? (
            <p className="p-4 text-sm text-muted">Video dinners, postcards, the next visit — plan them together here.</p>
          ) : null}
          {[...upcoming, ...done].map((plan) => (
            <div key={plan.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="pt-0.5">
                <DotCheckbox checked={plan.done} onChange={(v) => toggleDone(plan, v)} label={`Mark ${plan.title} done`} />
              </div>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditor(plan)}>
                <p className={`text-sm font-semibold ${plan.done ? "text-faint line-through" : ""}`}>{plan.title}</p>
                {plan.starts_at ? (
                  <p className="text-xs text-muted">
                    {formatDayTime(plan.starts_at, user.timezone)} · {formatWeekdayTime(plan.starts_at, partner.timezone)} for {partner.display_name}
                  </p>
                ) : (
                  <p className="text-xs text-faint">Someday · added {relativeTime(plan.created_at)}</p>
                )}
                {plan.notes ? <p className="mt-1 text-xs text-muted">{plan.notes}</p> : null}
              </button>
              <span className="text-[10px] text-faint">{plan.creator_id === user.id ? "You" : partner.display_name}</span>
              <button type="button" aria-label={`Delete ${plan.title}`} onClick={() => remove(plan)} className="text-faint hover:text-brand-bright">
                <IconTrash size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <AvailabilityCard />
      <MemorySearch />

      <PlanSheet editor={editor} onClose={() => setEditor(null)} onSaved={plans.reload} />
    </div>
  );
}

function PlanSheet({ editor, onClose, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", notes: "", when: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(editor?.id);

  useEffect(() => {
    if (!editor) return;
    setForm({
      title: editor.title || "",
      notes: editor.notes || "",
      when: editor.starts_at ? isoToLocalInput(editor.starts_at, user.timezone) : ""
    });
    setError("");
  }, [editor, user.timezone]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = { title: form.title, notes: form.notes, starts_at: localInputToIso(form.when, user.timezone) };
    try {
      if (editing) await api.updatePlan(editor.id, payload);
      else await api.createPlan(payload);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(editor)} onClose={onClose} title={editing ? "Edit plan" : "New plan"}>
      <form onSubmit={save} className="space-y-3">
        <input className="field" placeholder="Friday video dinner" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required autoFocus />
        <label className="block">
          <span className="mb-1 block px-2 text-xs text-faint">When (your time, optional)</span>
          <input type="datetime-local" className="field" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
        </label>
        <textarea
          className="w-full resize-none rounded-3xl border border-line bg-surface-2 p-4 text-sm outline-none placeholder:text-faint focus:border-brand/60"
          rows={3}
          placeholder="Notes (optional)"
          maxLength={500}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <ErrorText>{error}</ErrorText>
        <BorderButton type="submit" disabled={busy || !form.title.trim()}>
          {busy ? <Spinner /> : null}
          {editing ? "Save changes" : "Add to our plans"}
        </BorderButton>
      </form>
    </Sheet>
  );
}

function TimeInput({ label, value, onChange }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/60"
    />
  );
}

const splitWindow = (value) => (value ? value.split("-") : ["", ""]);

function AvailabilityCard() {
  const { partner } = usePair();
  const { pushToast } = useToasts();
  const availability = useLiveResource(api.availability, REFRESH_ON.availability);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (availability.data && !draft) {
      const { sleep, busy: b, preferred } = availability.data.me;
      setDraft({ sleep: splitWindow(sleep), busy: splitWindow(b), preferred: splitWindow(preferred) });
    }
  }, [availability.data, draft]);

  if (!availability.data || !draft) return null;
  const theirs = availability.data.partner;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const join = ([a, b]) => (a && b ? `${a}-${b}` : "");
      await api.saveAvailability({ sleep: join(draft.sleep), busy: join(draft.busy), preferred: join(draft.preferred) });
      pushToast({ icon: "🌙", text: `Saved — ${partner.display_name}’s call times updated too` });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="section-label">Availability (your local time)</p>
      <div className="rounded-3xl border border-line bg-surface p-4">
        {WINDOWS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="border-b border-line py-3 first:pt-0 last:border-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">
                <Icon size={17} />
              </span>
              {label}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <TimeInput label={`${label} from`} value={draft[key][0]} onChange={(v) => setDraft({ ...draft, [key]: [v, draft[key][1]] })} />
              <span className="text-xs text-faint">to</span>
              <TimeInput label={`${label} until`} value={draft[key][1]} onChange={(v) => setDraft({ ...draft, [key]: [draft[key][0], v] })} />
            </div>
          </div>
        ))}
        <ErrorText>{error}</ErrorText>
        <Button className="mt-3 w-full" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : null}Save availability
        </Button>
        <p className="mt-4 text-xs text-muted">
          <span className="font-semibold text-fg">{partner.display_name}</span> ({theirs.timezone.replace(/_/g, " ")}): sleeps {theirs.sleep || "—"}, busy{" "}
          {theirs.busy || "—"}, prefers calls {theirs.preferred || "—"}
          {theirs.updated_at ? "" : " (defaults)"}
        </p>
      </div>
    </div>
  );
}

function MemorySearch() {
  const { user } = useAuth();
  const { partner } = usePair();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const id = setTimeout(async () => {
      try {
        setResults(await api.search(q.trim()));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const kindLabel = { plan: "Plan", moment: "Moment", note: "Note", mood_update: "Mood" };

  return (
    <div>
      <p className="section-label">Memory search</p>
      <IconInput icon={<IconSearch size={18} />} placeholder="Search plans, moments, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results ? (
        <div className="mt-2 overflow-hidden rounded-3xl border border-line bg-surface">
          {results.length === 0 ? <p className="p-4 text-sm text-muted">Nothing matches “{q}”.</p> : null}
          {results.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
              <Badge tone={r.kind === "plan" ? "red" : "neutral"} className="mt-0.5 shrink-0">
                {kindLabel[r.kind]}
              </Badge>
              <div className="min-w-0">
                <p className="break-words text-sm">{r.text}</p>
                <p className="text-[11px] text-faint">
                  {r.sender_id ? (r.sender_id === user.id ? "You · " : `${partner.display_name} · `) : ""}
                  {r.at ? formatDayTime(r.at, user.timezone) : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
