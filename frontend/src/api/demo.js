/**
 * Demo mode: a complete in-browser stand-in for the Tether backend.
 *
 * Enabled with VITE_TETHER_DEMO=true (the Vercel build sets it). Any email/password
 * signs in, any pairing code connects you to a simulated partner who reacts to what
 * you do. Data lives in this browser's localStorage, so two different browsers
 * (or a normal + incognito tab) each get their own demo — they don't sync.
 */
import { hourOffset, localInputToIso } from "../lib/time";

const TOKEN_KEY = "tether_token";
const DB_PREFIX = "tether_demo_v1:";

const PARTNER_TIMEZONES = ["America/Los_Angeles", "Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Sydney"];
const DEFAULT_AVAILABILITY = { sleep: "23:30-07:30", busy: "09:00-17:00", preferred: "20:00-22:00" };
const PARTNER_AVAILABILITY = { sleep: "23:30-07:30", busy: "09:00-17:30", preferred: "19:00-22:30" };
const REACTIONS = new Set(["seen", "smiled", "heart_spark"]);

const PROMPTS = [
  "Take a photo of something that made you pause today.",
  "Show me the view from where you're sitting right now.",
  "Something small that made you smile.",
  "What's on your plate (or in your cup) right now?",
  "A colour you noticed today.",
  "The last place you walked past.",
  "Something that reminded you of me.",
  "The sky, wherever you are.",
  "Something you'd show me if I were there.",
  "A corner of your room that feels like you.",
  "Something you're looking forward to.",
  "Light and shadow — find some."
];
const PARTNER_CAPTIONS = ["Coffee before the chaos ☕️", "Rainy walk home", "Golden hour from the office", "Made pasta, thought of you", "Found this little corner", "Late-night reading"];
const NOTE_REPLIES = ["Aww, you just made my day 🥹", "Miss you more than coffee", "Counting down till our call 💞", "Just smiled at my phone like an idiot", "Sending the biggest hug across the ocean"];

// --- tiny helpers -------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const nowIso = () => new Date().toISOString();
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function zonedParts(date, timezone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric"
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)])
  );
}

function dayKey(timezone, date = new Date()) {
  const p = zonedParts(date, timezone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function shiftDay(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO instant for wall-clock `HH:MM` on the day `daysFromToday` in `timezone`. */
function wallTime(timezone, daysFromToday, hhmm) {
  return localInputToIso(`${shiftDay(dayKey(timezone), daysFromToday)}T${hhmm}`, timezone);
}

function art(seed) {
  const palettes = [
    ["#3d0812", "#f0203e", "#ff9a8b"],
    ["#0f172a", "#6366f1", "#f472b6"],
    ["#052e2b", "#10b981", "#fde68a"],
    ["#1c1917", "#f59e0b", "#fb7185"],
    ["#172554", "#38bdf8", "#e0f2fe"],
    ["#2e1065", "#a855f7", "#fbcfe8"]
  ];
  const emojis = ["☕️", "🌧", "🌇", "🌿", "📚", "🍜", "🌙", "🚲", "🎧", "🌸"];
  const h = hash(seed);
  const [a, b, c] = palettes[h % palettes.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 1000'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient><radialGradient id='r' cx='.72' cy='.28' r='.6'><stop offset='0' stop-color='${c}' stop-opacity='.85'/><stop offset='1' stop-color='${c}' stop-opacity='0'/></radialGradient></defs><rect width='800' height='1000' fill='url(#g)'/><rect width='800' height='1000' fill='url(#r)'/><circle cx='${180 + (h % 440)}' cy='${640 + ((h >> 5) % 220)}' r='${110 + ((h >> 9) % 90)}' fill='white' fill-opacity='.08'/><text x='400' y='560' font-size='230' text-anchor='middle'>${emojis[(h >> 3) % emojis.length]}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function promptFor(pairId, date = new Date()) {
  return PROMPTS[hash(`${pairId}:${date.toISOString().slice(0, 10)}`) % PROMPTS.length];
}

// --- storage -----------------------------------------------------------------

function sessionEmail() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token?.startsWith("demo:") ? token.slice(5) : null;
  } catch {
    return null;
  }
}

function readDb(email) {
  try {
    const raw = localStorage.getItem(DB_PREFIX + email);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function load() {
  const email = sessionEmail();
  const db = email && readDb(email);
  if (!db) throw fail("Please sign in again", 401);
  return db;
}

function save(db) {
  const write = () => localStorage.setItem(DB_PREFIX + db.user.email, JSON.stringify(db));
  try {
    write();
  } catch {
    // Browser storage is ~5 MB: swap older uploaded photos for placeholder art and retry.
    db.moments
      .filter((m) => m.image_url.startsWith("data:image/jpeg"))
      .slice(2)
      .forEach((m) => {
        m.image_url = art(m.id);
      });
    try {
      write();
    } catch {
      /* still too big — keep going in memory */
    }
  }
}

function publicUser(user) {
  return { ...user };
}

// --- live "socket" -----------------------------------------------------------

const sockets = new Set();

function broadcast(message) {
  sockets.forEach((s) => s.deliver(message));
}

/** Mimics the WebSocket interface PairProvider uses. */
export class DemoSocket {
  constructor() {
    this.readyState = 0;
    sockets.add(this);
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.();
    }, 30);
  }

  send(raw) {
    const msg = JSON.parse(raw);
    if (msg.type === "auth") {
      const email = msg.token?.startsWith("demo:") ? msg.token.slice(5) : null;
      const db = email && readDb(email);
      if (!db) {
        this.deliver({ type: "auth_failed" });
        this.close();
        return;
      }
      this.deliver({ type: "hello", user_id: db.user.id, partner_online: Boolean(db.pair) });
    } else if (msg.type === "ping") {
      this.deliver({ type: "pong" });
    } else if (msg.type === "touch") {
      simulateTouch(Boolean(msg.active));
    }
  }

  deliver(message) {
    if (this.readyState !== 1) return;
    setTimeout(() => this.onmessage?.({ data: JSON.stringify(message) }), 0);
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    sockets.delete(this);
    this.onclose?.();
  }
}

// --- the simulated partner ---------------------------------------------------

function later(ms, fn) {
  setTimeout(() => {
    try {
      fn();
    } catch {
      /* signed out or unpaired in the meantime */
    }
  }, ms);
}

function record(db, senderId, eventType, payload = {}) {
  const event = { id: uid(), pair_id: db.pair.id, sender_id: senderId, event_type: eventType, payload, created_at: nowIso() };
  db.events.unshift(event);
  db.events = db.events.slice(0, 80);
  return event;
}

function commit(db, event) {
  save(db);
  if (event) broadcast({ type: "event", event });
}

function partnerDoes(ms, eventType, payload, mutate) {
  later(ms, () => {
    const db = load();
    if (!db.pair) return;
    const extra = mutate ? mutate(db) : undefined;
    if (extra === false) return;
    commit(db, record(db, db.partner.id, eventType, typeof payload === "function" ? payload(db) : payload));
  });
}

function partnerPostsMoment(ms) {
  later(ms, () => {
    const db = load();
    if (!db.pair) return;
    const key = dayKey(db.partner.timezone);
    if (db.moments.some((m) => m.creator_id === db.partner.id && m.day_key === key)) return;
    const onTime = Boolean(db.pair.window_ends_at && new Date(db.pair.window_ends_at) > new Date());
    const moment = {
      id: uid(),
      creator_id: db.partner.id,
      caption: pick(PARTNER_CAPTIONS),
      prompt: promptFor(db.pair.id),
      image_url: art(uid()),
      day_key: key,
      on_time: onTime,
      created_at: nowIso(),
      reactions: []
    };
    db.moments.unshift(moment);
    commit(db, record(db, db.partner.id, "moment_created", { moment_id: moment.id, on_time: onTime }));
  });
}

let partnerHolding = false;
function simulateTouch(active) {
  let db;
  try {
    db = load();
  } catch {
    return;
  }
  if (!db.pair) return;
  const partnerId = db.partner.id;
  // Sam "feels" your hold and holds back a moment later, then lets go when you do.
  setTimeout(() => {
    if (partnerHolding === active) return;
    partnerHolding = active;
    broadcast({ type: "touch", user_id: partnerId, active });
  }, active ? 650 : 250);
}

function seedPair(db, partnerTz) {
  const userTz = db.user.timezone;
  const partnerId = uid();
  const pairId = uid();
  db.partner = {
    id: partnerId,
    display_name: "Sam",
    timezone: partnerTz,
    mood_emoji: "😌",
    mood_note: "cozy",
    mood_at: new Date(Date.now() - 90 * 60000).toISOString(),
    availability: PARTNER_AVAILABILITY
  };
  db.pair = { id: pairId, created_at: wallTime(userTz, -4, "19:00"), window_ends_at: null, window_started_by: null };
  db.moments = [];
  db.events = [];
  db.plans = [];

  const captionsMine = ["Sunset from the bus stop", "Desk plant is thriving", "Tried the new ramen place"];
  for (let daysAgo = 3; daysAgo >= 1; daysAgo -= 1) {
    const mineAt = wallTime(userTz, -daysAgo, "12:10");
    const theirsAt = wallTime(userTz, -daysAgo, "13:40");
    db.moments.push(
      { id: uid(), creator_id: partnerId, caption: pick(PARTNER_CAPTIONS), prompt: promptFor(pairId, new Date(theirsAt)), image_url: art(`${pairId}p${daysAgo}`), day_key: dayKey(partnerTz, new Date(theirsAt)), on_time: daysAgo === 2, created_at: theirsAt, reactions: [{ user_id: db.user.id, reaction: "heart_spark" }] },
      { id: uid(), creator_id: db.user.id, caption: captionsMine[daysAgo - 1], prompt: promptFor(pairId, new Date(mineAt)), image_url: art(`${pairId}u${daysAgo}`), day_key: dayKey(userTz, new Date(mineAt)), on_time: daysAgo === 2, created_at: mineAt, reactions: [{ user_id: partnerId, reaction: daysAgo === 1 ? "smiled" : "heart_spark" }] }
    );
  }
  // Sam already shared today — blurred until you post yours.
  const todayStart = new Date(wallTime(userTz, 0, "00:05")).getTime();
  const partnerToday = new Date(Math.min(Date.now() - 60000, Math.max(Date.now() - 2 * 3600000, todayStart))).toISOString();
  db.moments.push({ id: uid(), creator_id: partnerId, caption: "Morning light through the blinds", prompt: promptFor(pairId), image_url: art(`${pairId}today`), day_key: dayKey(partnerTz, new Date(partnerToday)), on_time: false, created_at: partnerToday, reactions: [] });
  db.moments.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const now = Date.now();
  db.plans = [
    { id: uid(), pair_id: pairId, creator_id: partnerId, title: "Friday video dinner", notes: "Same recipe, two kitchens", starts_at: wallTime(userTz, 3, "20:30"), done: false, created_at: new Date(now - 2 * 86400000).toISOString(), updated_at: nowIso() },
    { id: uid(), pair_id: pairId, creator_id: db.user.id, title: "Send a postcard", notes: null, starts_at: null, done: false, created_at: new Date(now - 86400000).toISOString(), updated_at: nowIso() },
    { id: uid(), pair_id: pairId, creator_id: partnerId, title: "Watch a movie together", notes: null, starts_at: null, done: true, created_at: new Date(now - 3 * 86400000).toISOString(), updated_at: nowIso() }
  ];

  const ev = (sender, type, payload, minutesAgo) => ({ id: uid(), pair_id: pairId, sender_id: sender, event_type: type, payload, created_at: new Date(now - minutesAgo * 60000).toISOString() });
  db.events = [
    ev(partnerId, "moment_created", { on_time: false }, 110),
    ev(partnerId, "mood_update", { emoji: "😌", note: "cozy" }, 90),
    ev(partnerId, "note", { message: "Good morning ☀️ have the best day" }, 300),
    ev(db.user.id, "nudge", { message: "Thinking of you" }, 720),
    ev(partnerId, "plan_created", { title: "Friday video dinner" }, 2880)
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// --- scheduling (mirror of backend/app/scheduling.py) --------------------------

const POINTS = { preferred: 50, free: 30, busy: 8 };

function parseWindow(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec((value || "").trim());
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

function inWindow(minute, window) {
  if (!window || window[0] === window[1]) return false;
  const [start, end] = window;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function stateAt(date, timezone, availability) {
  const p = zonedParts(date, timezone);
  const minute = p.hour * 60 + p.minute;
  for (const key of ["sleep", "busy", "preferred"]) {
    if (inWindow(minute, parseWindow(availability[key]))) return key;
  }
  return "free";
}

function slotState(start, timezone, availability) {
  const states = [0, 15, 29].map((o) => stateAt(new Date(start.getTime() + o * 60000), timezone, availability));
  return ["sleep", "busy", "free"].find((s) => states.includes(s)) || "preferred";
}

function rankCallSlots(people) {
  const now = new Date();
  const first = new Date(now.getTime() + (30 - (now.getUTCMinutes() % 30)) * 60000);
  first.setUTCSeconds(0, 0);
  const candidates = [];
  for (let i = 0; i < 48; i += 1) {
    const start = new Date(first.getTime() + i * 30 * 60000);
    const states = people.map((p) => slotState(start, p.timezone, p.availability));
    if (states.includes("sleep")) continue;
    candidates.push({ start, states, score: states.reduce((sum, s) => sum + POINTS[s], 0) });
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [];
  for (const c of candidates) {
    if (picked.every((p) => Math.abs(c.start - p.start) >= 90 * 60000)) picked.push(c);
    if (picked.length === 3) break;
  }
  return picked.map((c) => ({
    starts_at: c.start.toISOString(),
    ends_at: new Date(c.start.getTime() + 30 * 60000).toISOString(),
    score: c.score,
    states: c.states
  }));
}

// --- API ----------------------------------------------------------------------

function requirePair(db) {
  if (!db.pair) throw fail("You're not paired yet", 409);
  return db;
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function signInAs(email, displayName) {
  const normalized = email.trim().toLowerCase();
  let db = readDb(normalized);
  if (!db) {
    db = {
      user: {
        id: uid(),
        email: normalized,
        display_name: (displayName || normalized.split("@")[0] || "You").slice(0, 40),
        timezone: detectTimezone(),
        profile_complete: true,
        mood_emoji: null,
        mood_note: null,
        mood_at: null
      },
      availability: DEFAULT_AVAILABILITY,
      pair: null,
      partner: null,
      moments: [],
      events: [],
      plans: []
    };
  } else if (displayName) {
    db.user.display_name = displayName.slice(0, 40);
  }
  save(db);
  return { token: `demo:${normalized}`, user: publicUser(db.user) };
}

function connectPartner(db) {
  const partnerTz =
    PARTNER_TIMEZONES.find((tz) => Math.abs(hourOffset(db.user.timezone, tz)) >= 5) || "America/Los_Angeles";
  seedPair(db, partnerTz);
  const event = record(db, db.partner.id, "pair_connected", {});
  save(db);
  broadcast({ type: "pair_changed" });
  broadcast({ type: "event", event });
  partnerDoes(4000, "note", { message: `Hi ${db.user.display_name}! So happy we're tethered 💞` });
}

function statusFor(db) {
  if (!db.pair) return { pair_id: null, partner: null, partner_online: false };
  const { availability, ...partner } = db.partner;
  return { pair_id: db.pair.id, paired_at: db.pair.created_at, partner, partner_online: true };
}

function momentView(db) {
  const userToday = dayKey(db.user.timezone);
  const postedToday = db.moments.some((m) => m.creator_id === db.user.id && m.day_key === userToday);
  return db.moments.map((m) => {
    const locked = m.creator_id !== db.user.id && Date.now() - new Date(m.created_at) < 86400000 && !postedToday;
    return { ...m, locked, caption: locked ? null : m.caption, image_url: locked ? null : m.image_url };
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(fail("Couldn't read that image"));
    reader.readAsDataURL(file);
  });
}

export const demoApi = {
  async signUp(email, password, displayName) {
    await sleep(250);
    return signInAs(email, displayName);
  },
  async signIn(email) {
    await sleep(250);
    return signInAs(email);
  },
  async signOut() {
    return { ok: true };
  },
  async me() {
    return { user: publicUser(load().user) };
  },
  async updateProfile(fields) {
    const db = load();
    if (fields.display_name) db.user.display_name = fields.display_name.trim().slice(0, 40);
    if (fields.timezone) db.user.timezone = fields.timezone;
    db.user.profile_complete = true;
    const event = db.pair ? record(db, db.user.id, "profile_updated", {}) : null;
    commit(db, event);
    return { user: publicUser(db.user) };
  },
  async setMood(emoji, note) {
    const db = requirePair(load());
    Object.assign(db.user, { mood_emoji: emoji, mood_note: note?.trim() || null, mood_at: nowIso() });
    commit(db, record(db, db.user.id, "mood_update", { emoji, note: note?.trim() || null }));
    partnerDoes(3500, "nudge", { message: "Sending you a hug" });
    return { ok: true };
  },

  async pairStatus() {
    return statusFor(load());
  },
  async createCode() {
    const db = load();
    if (db.pair) throw fail("You already have an active pair. Unpair first.");
    const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    later(2500, () => {
      const fresh = load();
      if (!fresh.pair) connectPartner(fresh);
    });
    return { code, expires_at: new Date(Date.now() + 10 * 60000).toISOString() };
  },
  async redeemCode(code) {
    await sleep(400);
    const db = load();
    if (!String(code || "").trim()) throw fail("Type any code to connect");
    if (db.pair) throw fail("You already have an active pair");
    connectPartner(db);
    return { pair_id: db.pair.id };
  },
  async unpair() {
    const db = requirePair(load());
    Object.assign(db, { pair: null, partner: null, moments: [], events: [], plans: [] });
    save(db);
    broadcast({ type: "pair_changed" });
    return { ok: true };
  },

  async events() {
    return requirePair(load()).events.slice(0, 40);
  },
  async sendNudge() {
    const db = requirePair(load());
    const event = record(db, db.user.id, "nudge", { message: "Thinking of you" });
    commit(db, event);
    partnerDoes(2800, "nudge", { message: "Thinking of you too" });
    return event;
  },
  async sendNote(message) {
    if (!message?.trim()) throw fail("Write something first");
    const db = requirePair(load());
    const event = record(db, db.user.id, "note", { message: message.trim().slice(0, 280) });
    commit(db, event);
    partnerDoes(4200, "note", () => ({ message: pick(NOTE_REPLIES) }));
    return event;
  },

  async moments() {
    const db = requirePair(load());
    const windowOpen = db.pair.window_ends_at && new Date(db.pair.window_ends_at) > new Date();
    const view = momentView(db);
    return {
      prompt: promptFor(db.pair.id),
      window_ends_at: windowOpen ? db.pair.window_ends_at : null,
      window_started_by: windowOpen ? db.pair.window_started_by : null,
      posted_today: db.moments.some((m) => m.creator_id === db.user.id && m.day_key === dayKey(db.user.timezone)),
      moments: view
    };
  },
  async startMomentWindow() {
    const db = requirePair(load());
    if (db.pair.window_ends_at && new Date(db.pair.window_ends_at) > new Date()) {
      return { window_ends_at: db.pair.window_ends_at };
    }
    db.pair.window_ends_at = new Date(Date.now() + 5 * 60000).toISOString();
    db.pair.window_started_by = db.user.id;
    commit(db, record(db, db.user.id, "moment_window_started", { ends_at: db.pair.window_ends_at }));
    partnerPostsMoment(9000);
    return { window_ends_at: db.pair.window_ends_at };
  },
  async createMoment(file, caption) {
    const db = requirePair(load());
    const key = dayKey(db.user.timezone);
    if (db.moments.some((m) => m.creator_id === db.user.id && m.day_key === key)) {
      throw fail("You've already shared today's Moment", 409);
    }
    const onTime = Boolean(db.pair.window_ends_at && new Date(db.pair.window_ends_at) >= new Date());
    const moment = {
      id: uid(),
      creator_id: db.user.id,
      caption: caption?.trim().slice(0, 200) || null,
      prompt: promptFor(db.pair.id),
      image_url: await readFileAsDataUrl(file),
      day_key: key,
      on_time: onTime,
      created_at: nowIso(),
      reactions: []
    };
    db.moments.unshift(moment);
    commit(db, record(db, db.user.id, "moment_created", { moment_id: moment.id, on_time: onTime }));
    partnerDoes(3500, "reaction_added", { moment_id: moment.id, reaction: "heart_spark" }, (fresh) => {
      const m = fresh.moments.find((x) => x.id === moment.id);
      if (!m) return false;
      m.reactions = [...m.reactions.filter((r) => r.user_id !== fresh.partner.id), { user_id: fresh.partner.id, reaction: "heart_spark" }];
      return undefined;
    });
    partnerPostsMoment(8000);
    return { id: moment.id, on_time: onTime };
  },
  async react(momentId, reaction) {
    if (!REACTIONS.has(reaction)) throw fail("Unknown reaction");
    const db = requirePair(load());
    const moment = db.moments.find((m) => m.id === momentId);
    if (!moment) throw fail("Moment not found", 404);
    moment.reactions = [...moment.reactions.filter((r) => r.user_id !== db.user.id), { user_id: db.user.id, reaction }];
    commit(db, record(db, db.user.id, "reaction_added", { moment_id: momentId, reaction }));
    return { ok: true };
  },
  async stats() {
    const db = requirePair(load());
    const tz = db.user.timezone;
    const days = (id) => new Set(db.moments.filter((m) => m.creator_id === id).map((m) => dayKey(tz, new Date(m.created_at))));
    const mine = days(db.user.id);
    const theirs = days(db.partner.id);
    const both = new Set([...mine].filter((d) => theirs.has(d)));
    const today = dayKey(tz);
    let cursor = both.has(today) ? today : shiftDay(today, -1);
    let streak = 0;
    while (both.has(cursor)) {
      streak += 1;
      cursor = shiftDay(cursor, -1);
    }
    const week = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const key = shiftDay(today, -offset);
      const date = new Date(`${key}T12:00:00Z`);
      week.push({ day_key: key, weekday: "SMTWTFS"[date.getUTCDay()], day: date.getUTCDate(), me: mine.has(key), partner: theirs.has(key) });
    }
    return {
      reference_timezone: tz,
      streak,
      week,
      week_both: week.filter((w) => w.me && w.partner).length,
      week_me: week.filter((w) => w.me).length,
      week_partner: week.filter((w) => w.partner).length,
      total_moments: db.moments.length,
      plans_done: db.plans.filter((p) => p.done).length
    };
  },

  async plans() {
    const db = requirePair(load());
    return [...db.plans].sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        Number(!a.starts_at) - Number(!b.starts_at) ||
        (a.starts_at || "").localeCompare(b.starts_at || "") ||
        b.created_at.localeCompare(a.created_at)
    );
  },
  async createPlan({ title, notes, starts_at: startsAt }) {
    if (!title?.trim()) throw fail("Give the plan a name");
    const db = requirePair(load());
    const plan = {
      id: uid(),
      pair_id: db.pair.id,
      creator_id: db.user.id,
      title: title.trim().slice(0, 120),
      notes: notes?.trim() || null,
      starts_at: startsAt || null,
      done: false,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    db.plans.push(plan);
    commit(db, record(db, db.user.id, "plan_created", { plan_id: plan.id, title: plan.title }));
    partnerDoes(4000, "note", { message: `Can't wait for “${plan.title}” 💞` });
    return plan;
  },
  async updatePlan(id, fields) {
    const db = requirePair(load());
    const plan = db.plans.find((p) => p.id === id);
    if (!plan) throw fail("Plan not found", 404);
    if (fields.title !== undefined && fields.title.trim()) plan.title = fields.title.trim().slice(0, 120);
    if (fields.notes !== undefined) plan.notes = fields.notes?.trim() || null;
    if (fields.starts_at !== undefined) plan.starts_at = fields.starts_at || null;
    if (fields.done !== undefined) plan.done = Boolean(fields.done);
    plan.updated_at = nowIso();
    const payload = { plan_id: id, title: plan.title };
    if (fields.done !== undefined) payload.done = plan.done;
    commit(db, record(db, db.user.id, "plan_updated", payload));
    return plan;
  },
  async deletePlan(id) {
    const db = requirePair(load());
    const plan = db.plans.find((p) => p.id === id);
    if (!plan) throw fail("Plan not found", 404);
    db.plans = db.plans.filter((p) => p.id !== id);
    commit(db, record(db, db.user.id, "plan_deleted", { plan_id: id, title: plan.title }));
    return { ok: true };
  },

  async availability() {
    const db = requirePair(load());
    const now = new Date();
    const person = (availability, timezone, updatedAt) => ({ ...availability, updated_at: updatedAt, timezone, state_now: stateAt(now, timezone, availability) });
    return {
      me: person(db.availability, db.user.timezone, db.availability_updated_at || null),
      partner: person(db.partner.availability, db.partner.timezone, db.pair.created_at)
    };
  },
  async saveAvailability(windows) {
    for (const [key, value] of Object.entries(windows)) {
      if (value && !parseWindow(value)) throw fail(`${key[0].toUpperCase()}${key.slice(1)} must look like 22:30-07:00`);
    }
    const db = requirePair(load());
    db.availability = { sleep: windows.sleep, busy: windows.busy, preferred: windows.preferred };
    db.availability_updated_at = nowIso();
    commit(db, record(db, db.user.id, "availability_updated", {}));
    return { ok: true };
  },
  async callSlots() {
    const db = requirePair(load());
    return rankCallSlots([
      { timezone: db.user.timezone, availability: db.availability },
      { timezone: db.partner.timezone, availability: db.partner.availability }
    ]);
  },
  async search(q) {
    const db = requirePair(load());
    const needle = q.trim().toLowerCase();
    const has = (text) => (text || "").toLowerCase().includes(needle);
    const results = [
      ...db.plans.filter((p) => has(p.title) || has(p.notes)).map((p) => ({ kind: "plan", id: p.id, text: p.title, detail: p.notes, at: p.starts_at || p.created_at })),
      ...db.moments.filter((m) => has(m.caption) || has(m.prompt)).map((m) => ({ kind: "moment", id: m.id, text: m.caption || m.prompt, detail: null, at: m.created_at })),
      ...db.events
        .filter((e) => (e.event_type === "note" && has(e.payload.message)) || (e.event_type === "mood_update" && (has(e.payload.note) || has(e.payload.emoji))))
        .map((e) => ({ kind: e.event_type, id: e.id, text: e.payload.message || `${e.payload.emoji || ""} ${e.payload.note || ""}`.trim(), detail: null, at: e.created_at, sender_id: e.sender_id }))
    ];
    return results.sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 20);
  }
};
