// Relative by default: in dev Vite proxies /api to the backend, and in production the
// backend serves this app itself — so every device only ever needs one URL.
const API_BASE = (import.meta.env.VITE_TETHER_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "tether_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — session lasts until the tab closes */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", json, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body });
  } catch {
    throw new ApiError("Can't reach Tether's server. Is the backend running?", 0);
  }

  if (!response.ok) {
    if (!(response.headers.get("content-type") || "").includes("application/json")) {
      // A static host (e.g. Vercel) answered instead of the Tether backend.
      throw new ApiError(
        "Tether's server isn't connected to this site. Set VITE_TETHER_API_URL to the backend's URL and redeploy.",
        response.status
      );
    }
    let detail = `Something went wrong (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail[0]?.msg || detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, response.status);
  }
  return response.json();
}

export function mediaUrl(path) {
  return path ? `${API_BASE}${path}` : null;
}

export function websocketUrl() {
  if (API_BASE) return `${API_BASE.replace(/^http/, "ws")}/api/ws`;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/api/ws`;
}

export const api = {
  signUp: (email, password, display_name) =>
    request("/api/auth/signup", { method: "POST", json: { email, password, display_name } }),
  signIn: (email, password) => request("/api/auth/signin", { method: "POST", json: { email, password } }),
  signOut: () => request("/api/auth/signout", { method: "POST" }),
  me: () => request("/api/auth/me"),
  updateProfile: (fields) => request("/api/me/profile", { method: "PATCH", json: fields }),
  setMood: (emoji, note) => request("/api/me/mood", { method: "POST", json: { emoji, note } }),

  pairStatus: () => request("/api/pairing/status"),
  createCode: () => request("/api/pairing/create-code", { method: "POST" }),
  redeemCode: (code) => request("/api/pairing/redeem-code", { method: "POST", json: { code } }),
  unpair: () => request("/api/pairing/unpair", { method: "POST" }),

  events: () => request("/api/events"),
  sendNudge: () => request("/api/events", { method: "POST", json: { type: "nudge" } }),
  sendNote: (message) => request("/api/events", { method: "POST", json: { type: "note", message } }),

  moments: () => request("/api/moments"),
  startMomentWindow: () => request("/api/moments/window", { method: "POST" }),
  createMoment: (file, caption) => {
    const form = new FormData();
    form.append("image", file);
    form.append("caption", caption || "");
    return request("/api/moments", { method: "POST", form });
  },
  react: (momentId, reaction) =>
    request(`/api/moments/${momentId}/reactions`, { method: "POST", json: { reaction } }),
  stats: () => request("/api/stats"),

  plans: () => request("/api/plans"),
  createPlan: (plan) => request("/api/plans", { method: "POST", json: plan }),
  updatePlan: (id, fields) => request(`/api/plans/${id}`, { method: "PATCH", json: fields }),
  deletePlan: (id) => request(`/api/plans/${id}`, { method: "DELETE" }),

  availability: () => request("/api/availability"),
  saveAvailability: (windows) => request("/api/availability", { method: "PUT", json: windows }),
  callSlots: () => request("/api/call-slots"),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`)
};
