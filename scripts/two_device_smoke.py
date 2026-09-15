"""End-to-end proof that two accounts on separate devices stay in sync.

Simulates three live devices against a running Tether server:
  - "Alex's phone"
  - "Sam's laptop" and "Sam's phone" (same account, two devices)

and checks every shared feature arrives over WebSockets without refreshing.

Usage (from the repo root, with the backend running):
    backend/.venv/bin/python scripts/two_device_smoke.py [http://localhost:8000]
"""

import asyncio
import io
import json
import sys
import time
import uuid

import httpx
import websockets

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
WS_BASE = BASE.replace("http://", "ws://").replace("https://", "wss://")

# 1x1 red JPEG
TINY_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3ffd9"
)

passed = 0


def ok(label: str) -> None:
    global passed
    passed += 1
    print(f"  ✓ {label}")


class Device:
    def __init__(self, name: str, token: str):
        self.name = name
        self.token = token
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.ws = None
        self.task = None

    async def connect(self) -> dict:
        self.ws = await websockets.connect(f"{WS_BASE}/api/ws")
        await self.ws.send(json.dumps({"type": "auth", "token": self.token}))
        hello = json.loads(await self.ws.recv())
        assert hello["type"] == "hello", hello
        self.task = asyncio.create_task(self._pump())
        return hello

    async def _pump(self) -> None:
        try:
            async for raw in self.ws:
                await self.inbox.put(json.loads(raw))
        except websockets.ConnectionClosed:
            pass

    async def expect(self, predicate, what: str, timeout: float = 3.0) -> dict:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError(f"{self.name} never received: {what}")
            try:
                msg = await asyncio.wait_for(self.inbox.get(), remaining)
            except asyncio.TimeoutError as exc:
                raise AssertionError(f"{self.name} never received: {what}") from exc
            if predicate(msg):
                return msg

    async def expect_event(self, event_type: str, timeout: float = 3.0) -> dict:
        msg = await self.expect(
            lambda m: m["type"] == "event" and m["event"]["event_type"] == event_type,
            f"event {event_type}",
            timeout,
        )
        return msg["event"]

    async def close(self) -> None:
        await self.ws.close()
        if self.task:
            await self.task


async def main() -> None:
    run = uuid.uuid4().hex[:6]
    async with httpx.AsyncClient(base_url=BASE, timeout=10) as http:

        async def call(method: str, path: str, token: str | None = None, **kwargs) -> dict:
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            r = await http.request(method, path, headers=headers, **kwargs)
            if r.status_code >= 400:
                raise AssertionError(f"{method} {path} -> {r.status_code}: {r.text}")
            return r.json()

        print(f"Tether two-device smoke test against {BASE}\n")
        print("Accounts & profiles")
        alex = await call("POST", "/api/auth/signup", json={"email": f"alex-{run}@test.dev", "password": "secret123", "display_name": "Alex"})
        sam = await call("POST", "/api/auth/signup", json={"email": f"sam-{run}@test.dev", "password": "secret123", "display_name": "Sam"})
        sam_phone_login = await call("POST", "/api/auth/signin", json={"email": f"sam-{run}@test.dev", "password": "secret123"})
        a, s, s2 = alex["token"], sam["token"], sam_phone_login["token"]
        await call("PATCH", "/api/me/profile", a, json={"timezone": "Asia/Singapore"})
        await call("PATCH", "/api/me/profile", s, json={"timezone": "America/Los_Angeles"})
        ok("Alex and Sam signed up; Sam signed in on a second device")

        alex_phone, sam_laptop, sam_phone = Device("Alex's phone", a), Device("Sam's laptop", s), Device("Sam's phone", s2)
        for d in (alex_phone, sam_laptop, sam_phone):
            await d.connect()
        ok("All three devices connected over WebSockets")

        print("\nPairing")
        code = (await call("POST", "/api/pairing/create-code", a))["code"]
        await call("POST", "/api/pairing/redeem-code", s, json={"code": code})
        await alex_phone.expect(lambda m: m["type"] == "pair_changed", "pair_changed")
        await sam_phone.expect(lambda m: m["type"] == "pair_changed", "pair_changed")
        ok(f"Sam redeemed code {code}; Alex's waiting screen was notified live")
        status = await call("GET", "/api/pairing/status", a)
        assert status["partner"]["display_name"] == "Sam" and status["partner_online"], status
        ok("Alex sees Sam as partner, online")

        print("\nPresence")
        await sam_laptop.close()
        await sam_phone.close()
        await alex_phone.expect(lambda m: m["type"] == "presence" and not m["online"], "Sam offline")
        ok("Sam closed both devices -> Alex sees Sam go offline")
        sam_laptop, sam_phone = Device("Sam's laptop", s), Device("Sam's phone", s2)
        await sam_laptop.connect()
        await alex_phone.expect(lambda m: m["type"] == "presence" and m["online"], "Sam online")
        await sam_phone.connect()
        ok("Sam reopened -> Alex sees Sam come back online")

        print("\nNow tab")
        await call("POST", "/api/events", a, json={"type": "nudge"})
        await sam_laptop.expect_event("nudge")
        await sam_phone.expect_event("nudge")
        ok("Alex's 'thinking of you' ping reached both of Sam's devices")
        await call("POST", "/api/events", s, json={"type": "note", "message": "Good morning from LA"})
        note = await alex_phone.expect_event("note")
        assert note["payload"]["message"] == "Good morning from LA"
        ok("Sam's note reached Alex")
        await call("POST", "/api/me/mood", a, json={"emoji": "\U0001f634", "note": "long day"})
        await sam_phone.expect_event("mood_update")
        assert (await call("GET", "/api/pairing/status", s))["partner"]["mood_emoji"] == "\U0001f634"
        ok("Alex's mood shows up for Sam")
        await alex_phone.ws.send(json.dumps({"type": "touch", "active": True}))
        await sam_phone.expect(lambda m: m["type"] == "touch" and m["active"], "touch start")
        await alex_phone.ws.send(json.dumps({"type": "touch", "active": False}))
        await sam_laptop.expect(lambda m: m["type"] == "touch" and not m["active"], "touch end")
        ok("'Hold together' heartbeat relayed live (not stored)")

        print("\nMoments")
        await call("POST", "/api/moments/window", s)
        await alex_phone.expect_event("moment_window_started")
        ok("Sam opened a shared 5-minute capture window; Alex got the countdown")
        created = await call("POST", "/api/moments", a, files={"image": ("m.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")}, data={"caption": "Rain on the window"})
        assert created["on_time"]
        await sam_phone.expect_event("moment_created")
        ok("Alex posted a photo inside the window (on time)")
        sam_view = await call("GET", "/api/moments", s)
        assert sam_view["moments"][0]["locked"] and sam_view["moments"][0]["image_url"] is None
        ok("Sam can't see Alex's photo until posting their own")
        await call("POST", "/api/moments", s, files={"image": ("m.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")})
        sam_view = await call("GET", "/api/moments", s)
        alex_moment = next(m for m in sam_view["moments"] if m["creator_id"] == alex["user"]["id"])
        assert not alex_moment["locked"] and alex_moment["caption"] == "Rain on the window"
        img = await http.get(alex_moment["image_url"])
        assert img.status_code == 200 and img.content == TINY_JPEG
        ok("After posting, Sam sees Alex's photo (served via signed URL)")
        r = await http.post("/api/moments", headers={"Authorization": f"Bearer {s}"}, files={"image": ("m.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")})
        assert r.status_code == 409
        ok("A second Moment the same day is rejected")
        await call("POST", f"/api/moments/{alex_moment['id']}/reactions", s, json={"reaction": "heart_spark"})
        await alex_phone.expect_event("reaction_added")
        ok("Sam's Heart Spark reaction reached Alex")
        stats = await call("GET", "/api/stats", a)
        assert stats["streak"] == 1 and stats["week_both"] == 1, stats
        ok("Streak = 1 day, weekly recap counts both posts")

        print("\nPlans")
        plan = await call("POST", "/api/plans", a, json={"title": "Friday video dinner", "starts_at": "2030-01-04T12:30:00Z"})
        await sam_laptop.expect_event("plan_created")
        ok("Alex created a plan; Sam's laptop got it")
        await call("PATCH", f"/api/plans/{plan['id']}", s, json={"done": True})
        await alex_phone.expect_event("plan_updated")
        assert (await call("GET", "/api/plans", a))[0]["done"]
        ok("Sam ticked it off; Alex sees it done")
        await call("PUT", "/api/availability", s, json={"sleep": "23:00-07:00", "busy": "09:00-18:00", "preferred": "07:00-08:30"})
        await alex_phone.expect_event("availability_updated")
        slots = await call("GET", "/api/call-slots", a)
        assert slots and all(0 < sl["score"] <= 100 for sl in slots)
        ok(f"Sam updated availability; {len(slots)} ranked call slots (best score {slots[0]['score']})")
        results = await call("GET", "/api/search", s, params={"q": "dinner"})
        assert any(res["kind"] == "plan" for res in results)
        ok("Memory search finds the plan")

        print("\nUnpairing")
        await call("POST", "/api/pairing/unpair", s)
        await alex_phone.expect(lambda m: m["type"] == "pair_changed", "pair_changed")
        assert (await call("GET", "/api/pairing/status", a))["pair_id"] is None
        ok("Sam unpaired; Alex's app was told immediately")

        for d in (alex_phone, sam_laptop, sam_phone):
            await d.close()

    print(f"\nAll {passed} checks passed.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as exc:
        print(f"\n✗ FAILED: {exc}")
        sys.exit(1)
