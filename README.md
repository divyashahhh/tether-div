# Tether

A private two-person app for long-distance couples and close pairs. Pair two accounts with a code, then stay close across timezones with live **Now**, daily **Moments** and shared **Plans**. Everything syncs live across every device either of you is signed into.

## Features

- **Now**
  - Partner online status and mood
  - "Hold the heart together" live heartbeat
  - Thinking-of-you pings and notes
  - Both local times, with asleep/busy state
  - Best time to call
  - Live activity feed
- **Moments**
  - One photo per day, with a shared daily prompt
  - A 5-minute capture window either of you can open for both
  - Your partner's photo stays locked until you post yours
  - Reactions, a streak, a weekly recap and a photo timeline
- **Plans**
  - Call times ranked across both timezones, using each person's sleep, busy and preferred hours
  - Shared plans shown in both local times, with tick-off
  - Search across plans, moments and notes
- **Account**
  - Email sign-in; multiple devices per account
  - Pairing codes that expire in 10 minutes
  - Edit name and timezone; unpair

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS. Components are adapted from [21st.dev · prebuiltui](https://21st.dev/@prebuiltui) and themed black and dark red.
- **Backend:** FastAPI, SQLite and WebSockets, all self-hosted with no cloud accounts needed.
  - Passwords are hashed with scrypt.
  - Photos are stored on disk and served via signed URLs.

## Run it

```bash
./scripts/dev.sh
```

The script installs dependencies on first run, starts both servers, and prints:

- `http://localhost:5173` for this computer
- `http://<your-ip>:5173` for phones on the same Wi-Fi

Or run them manually:

```bash
# backend
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# frontend (proxies /api and the WebSocket to :8000)
cd frontend && npm install && npm run dev
```

Data lives in `backend/data/` (SQLite database plus uploaded photos). Delete the folder to reset.

## Test two devices

See **[docs/TWO_DEVICE_TEST.md](docs/TWO_DEVICE_TEST.md)** for the step-by-step two-device test script, the network setup, and a tunnel option for devices on different networks.

Automated check (simulates 3 devices over real WebSockets):

```bash
backend/.venv/bin/python scripts/two_device_smoke.py http://localhost:5173
```

## Project layout

```
backend/app/
  main.py          app, health check, serves frontend/dist in production
  db.py            SQLite schema + helpers
  auth.py          sign up / sign in / sessions
  pairing.py       pairing codes, status, unpair
  realtime.py      WebSocket hub: live events, presence, heartbeat relay
  features.py      profile, mood, notes, moments, reactions, plans, availability, stats, search
  scheduling.py    cross-timezone call-slot ranking
frontend/src/
  features/auth/   AuthProvider (token session)
  features/sync/   PairProvider (WebSocket, presence, live refetch)
  components/ui/   21st.dev-derived UI kit (GlowCard, BorderButton, Toasts, Sheet, …)
  screens/         Auth, Profile, Pair, Now, Moments, Plans
scripts/
  dev.sh                 start everything
  two_device_smoke.py    automated multi-device test
archive/           original Supabase-based plan (no longer used)
```

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup`, `/signin`, `/signout`, `GET /api/auth/me` | Accounts & sessions |
| `PATCH /api/me/profile`, `POST /api/me/mood` | Name, timezone, mood |
| `POST /api/pairing/create-code`, `/redeem-code`, `/unpair`, `GET /api/pairing/status` | Pairing |
| `GET/POST /api/events` | Activity feed, pings, notes |
| `GET/POST /api/moments`, `POST /api/moments/window`, `POST /api/moments/{id}/reactions` | Moments |
| `GET/POST /api/plans`, `PATCH/DELETE /api/plans/{id}` | Plans |
| `GET/PUT /api/availability`, `GET /api/call-slots` | Availability & ranked call times |
| `GET /api/stats`, `GET /api/search?q=` | Streaks, recap, memory search |
| `WS /api/ws` | Live events, presence, "hold together" |
