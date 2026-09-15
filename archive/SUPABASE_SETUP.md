# Supabase setup for Tether (auth + multi-device sync)

Follow these steps in order. Total time: ~20 minutes.

---

## Part 1 — Create the Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose an organization, name it `tether` (or any name), set a **database password** (save it), pick a region close to you.
4. Wait until the project status is **Active**.

---

## Part 2 — Run the database SQL

1. In the Supabase dashboard, open **SQL Editor**.
2. Click **New query**.
3. Copy the full contents of `supabase/schema.sql` from this repo, paste, and click **Run**.
4. New query → paste `supabase/policies.sql` → **Run**.
5. New query → paste `supabase/realtime_setup.sql` → **Run**.

If you see errors about objects already existing, that usually means you ran a file twice — safe to ignore for `create table if not exists`.

---

## Part 3 — Enable authentication (sign up / log in)

1. Open **Authentication** → **Providers**.
2. Ensure **Email** is enabled.
3. For development (recommended while testing), open **Authentication** → **Providers** → **Email** and:
   - Turn **OFF** “Confirm email” (so sign-up logs you in immediately without checking inbox).
   - For production later, turn it back **ON**.

4. Open **Authentication** → **URL configuration**:
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs**: add `http://localhost:5173` and `http://localhost:5173/**`

---

## Part 4 — Enable Realtime (live sync between devices)

1. Open **Database** → **Publications** (or **Replication** depending on UI).
2. Confirm `supabase_realtime` publication includes:
   - `pair_events`
   - `moments`  
   (The `realtime_setup.sql` script adds these; if missing, add them manually.)

---

## Part 5 — Copy API keys into the app

Supabase now has **two key types** (do not mix them up):

| Key in dashboard | Starts with | Goes in |
|------------------|-------------|---------|
| **Publishable** | `sb_publishable_` | `frontend/.env` only |
| **Secret** | `sb_secret_` | `backend/.env` only |
| Legacy **anon** | `eyJ` | frontend (if you use legacy tab) |
| Legacy **service_role** | `eyJ` | backend (if you use legacy tab) |

### Where to find keys

1. Open **Project Settings** → **API** (or **API Keys**).
2. **Publishable key** → copy to frontend `VITE_SUPABASE_ANON_KEY`.
3. **Secret key**:
   - If you see no secret key, click **Create new API key** / opt in to new keys.
   - Copy the **Secret** value (`sb_secret_...`) → `backend/.env` as `SUPABASE_SECRET_KEY`.
4. **Or** open the **Legacy API Keys** tab:
   - `anon` → frontend
   - `service_role` → backend as `SUPABASE_SERVICE_ROLE_KEY`

**Common mistakes:**

| Wrong value (do NOT use in backend) | Where people copy it from |
|-------------------------------------|---------------------------|
| `sb_publishable_...` | Publishable key (frontend only) |
| Short base64 string ending in `==` | JWT Secret (Auth settings) or DB password |
| Random alphanumeric, no `sb_secret_` or `eyJ` | Wrong field in dashboard |

**Correct backend key** must literally start with `sb_secret_` or `eyJ` (legacy service_role).

1. Also copy **Project URL** → both `VITE_SUPABASE_URL` and `SUPABASE_URL`.

### Frontend `.env`

Create `frontend/.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_API_BASE_URL=http://localhost:8000
```

### Backend `.env`

Create `backend/.env`:

```env
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxx
```

(Or legacy: `SUPABASE_SERVICE_ROLE_KEY=eyJ...` — **not** the publishable key.)

Restart both servers after creating or changing `.env` files.

---

## Part 6 — Run Tether locally

**Terminal 1 — backend**

```bash
cd backend
source .venv/bin/activate   # or: python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check: open `http://localhost:8000/health` — should show:

```json
"supabase_backend_client_ok": true,
"supabase_backend_error": null
```

If `supabase_backend_error` mentions publishable key, fix `backend/.env` and restart uvicorn.

**Terminal 2 — frontend**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

You should **not** see “Demo mode (no Supabase)” on the login screen when `.env` is correct.

---

## Part 7 — Test auth and pairing (two users)

### User A (e.g. Chrome)

1. **Create account** with email + password + display name.
2. Complete **Your profile** (name + timezone) once.
3. **Generate pairing code** and note the 6-character code.

### User B (e.g. Safari or phone)

1. **Create account** with a different email.
2. Complete profile.
3. **Enter code** from User A.

### Sync test

1. User A: tap the heart **ping** on the Now tab.
2. User B: should see the event under **Live activity** within a second (no refresh).
3. Close both tabs, reopen — both should still be **signed in** (session stored in browser).
4. User A on laptop + phone (same account): both stay signed in; partner shows **Online** when both are open.

---

## How “stay logged in” works

| What | Where | How long |
|------|--------|----------|
| Supabase session (access + refresh token) | Browser `localStorage` key `tether-auth` | Access token ~1 hour; refresh token renews automatically for ~7 days (Supabase default) |
| Profile (name, timezone) | `localStorage` `tether_profile_<userId>` | Until you clear site data |
| After refresh token expires | — | App shows **Sign in** again (not sign up) |

You only complete **Your profile** once per account. Pairing persists in Supabase until you unpair (future feature).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Still says “Demo mode” | Restart `npm run dev` after adding `frontend/.env`. Keys must start with `VITE_`. |
| Sign up then back at login | Turn off **Confirm email** in Supabase, or confirm email then use **Sign in**. |
| `Invalid API key` / pairing 500 | Backend has **publishable** key — use **secret** (`sb_secret_`) or **service_role** (`eyJ`). |
| `supabase_backend_client_ok: false` on `/health` | Read `supabase_backend_error`; fix `backend/.env`; restart uvicorn. |
| Pairing fails “Invalid token” | Sign out and in again; ensure backend and frontend use the **same** Supabase project URL. |
| Realtime not updating | Run `realtime_setup.sql`; check `pair_events` is in `supabase_realtime` publication. |
| RLS errors on insert | Re-run `policies.sql`; ensure user completed profile (row in `profiles`). |

---

## Production checklist (later)

- Turn **Confirm email** back on.
- Set Site URL to your real domain.
- Use HTTPS only.
- Never commit `.env` files (they are gitignored).
- Rotate service role key if it was ever exposed.
