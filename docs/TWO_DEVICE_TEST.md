# Two-device proof of concept

Goal: two people, each on their own device, signed into their own account, see each other's actions live without refreshing.

## How the connection works

```
 Phone (Sam)                    Your computer                     Laptop (Alex)
 ───────────                    ─────────────                     ─────────────
 browser ──http/ws──▶  Vite :5173  ──proxy /api──▶  FastAPI :8000  ◀──http/ws── browser
                                                     │  SQLite (backend/data/tether.db)
                                                     └─ WebSocket hub: pushes every change
                                                        to all devices of both partners
```

- Every device only needs **one URL** (`http://<computer-ip>:5173`). Vite forwards API calls and the WebSocket to the backend.
- Every action (ping, note, photo, plan…) is saved to SQLite first, then pushed to every open socket for **both** partners, including the sender's other devices.
- If a phone locks its screen and the socket drops, the app reconnects when it comes back and refetches everything, so nothing is missed.

## Before you start

1. Both devices must be on the **same Wi-Fi** (see "Different networks" below if they aren't). Guest, hotel and university networks often block device-to-device traffic. A phone hotspot works as a fallback.
2. From the repo root, run:
   ```bash
   ./scripts/dev.sh
   ```
   It prints `Phones on the same Wi-Fi: http://192.168.x.x:5173`.
3. Your Mac's firewall is on. The first time a phone connects, macOS may ask whether to allow incoming connections for **node**: click **Allow**. If nothing loads on the phone, check System Settings → Network → Firewall → Options.
4. Check the computer first: open `http://localhost:5173`. You should see the black and red Tether sign-in screen.

## Test script (≈5 minutes)

Device A = laptop browser, device B = phone browser. Use two **different** emails.

| # | Do this | On device… | Expect on the *other* device, without refreshing |
|---|---|---|---|
| 1 | Sign up as Alex, keep the detected timezone, **Continue** | A | — |
| 2 | Sign up as Sam and **pick a different timezone** (e.g. America/Los_Angeles) | B | — |
| 3 | **Generate pairing code** | A | — |
| 4 | **Enter a code**, type A's 6 characters, **Tether us** | B | A switches to the Now tab by itself; a "Sam tethered with you" toast appears |
| 5 | Check the partner card | both | Green dot and **Online now** on both |
| 6 | Tap **Thinking of you** | A | Toast "Alex is thinking of you" on B (and a buzz on Android) |
| 7 | **Press and hold** the big heart | A | B's heart pulses and reads "Alex is holding — hold too" |
| 8 | Hold the heart at the same time on both | both | Both screens show **In sync 💞** |
| 9 | **Send a note** | B | Toast with the note on A; it appears in Live activity |
| 10 | **My mood** → 😴 "sleepy" | B | A's partner card shows "😴 feeling sleepy" |
| 11 | Moments → **Start a 5-minute window together** | B | A sees a live countdown |
| 12 | **Capture today's Moment**, take a photo, **Share** | A | B sees "Alex posted. Share yours to unlock." (photo hidden) |
| 13 | Capture and share a Moment | B | Both photos unlock; streak shows **1 day** and **1/7 this week** |
| 14 | Open A's photo and react **💞 Heart Spark** | B | Toast on A; reaction badge on the photo |
| 15 | Plans → **Add plan** "Movie night" with a time | A | Appears on B, shown in both local times |
| 16 | Tick the plan's dot | B | Crossed out on A |
| 17 | Change **Busy** hours, **Save availability** | B | A's "Best time to connect" and ranked call times update |
| 18 | Lock the phone for 30 s, then unlock | B | A shows B **Offline**, then **Online** again; anything sent meanwhile is there |
| 19 | Sign in as Alex in a second browser or incognito window on A, send a ping from B | A + A2 | The toast arrives on **both** of Alex's windows |
| 20 | Menu (avatar) → **Unpair** | B | A drops back to the pairing screen |

Pass criteria: every row in the right column happens within about a second, with no refresh.

## Automated version (no phone needed)

With the servers running, this simulates Alex's phone plus Sam's laptop and phone over real WebSockets and checks 22 behaviours:

```bash
backend/.venv/bin/python scripts/two_device_smoke.py http://localhost:5173
```

## Testing on one computer

Accounts are stored per browser profile, so two tabs in the same window share one login. For two accounts on one machine, use a normal window plus an **incognito/private** window, or two different browsers.

## Different networks (e.g. a partner in another city)

Serve everything from one port and tunnel it:

```bash
cd frontend && npm run build          # backend now serves the built app itself
cd ../backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
# in another terminal (brew install cloudflared):
cloudflared tunnel --url http://localhost:8000
```

Open the printed `https://….trycloudflare.com` URL on both devices. HTTPS also enables clipboard copy of the pairing code. For something permanent, deploy the backend (with a persistent disk for `backend/data/`) to a host such as Railway or Fly.io.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Phone can't load the page | Same Wi-Fi? Firewall prompt allowed? Try a phone hotspot. Use the IP printed by `dev.sh`, not `localhost`. |
| "Can't reach Tether's server" | The backend isn't running; start `./scripts/dev.sh` again. |
| "Reconnecting" pill stays up | The WebSocket is blocked (some corporate networks). Use the tunnel option. |
| Partner shows Offline while their app is open | The phone suspended the tab; bring it to the foreground and it reconnects. |
| Want a clean slate | Stop the servers and delete `backend/data/`. |
