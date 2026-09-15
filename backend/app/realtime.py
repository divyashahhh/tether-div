"""Live sync over WebSockets.

Each open tab/device holds one socket, grouped by user. Anything that changes
shared data is written to `pair_events` first and then pushed to every socket
of both partners — so a device that was offline catches up by refetching.
"""

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import db
from .auth import user_for_token
from .pair_access import active_pair, partner_id

router = APIRouter(tags=["realtime"])


class ConnectionManager:
    def __init__(self) -> None:
        self.sockets: dict[str, set[WebSocket]] = defaultdict(set)

    def is_online(self, user_id: str) -> bool:
        return bool(self.sockets.get(user_id))

    async def send_to_user(self, user_id: str, message: dict) -> None:
        dead = []
        for ws in list(self.sockets.get(user_id, ())):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:  # noqa: BLE001 — a broken socket must not block others
                dead.append(ws)
        for ws in dead:
            self.sockets[user_id].discard(ws)

    async def send_to_users(self, user_ids: list[str], message: dict) -> None:
        await asyncio.gather(*(self.send_to_user(uid, message) for uid in user_ids))


manager = ConnectionManager()


async def record_event(pair: dict, sender_id: str, event_type: str, payload: dict | None = None) -> dict:
    event = {
        "id": db.new_id(),
        "pair_id": pair["id"],
        "sender_id": sender_id,
        "event_type": event_type,
        "payload": payload or {},
        "created_at": db.now_iso(),
    }
    db.run(
        "insert into pair_events (id, pair_id, sender_id, event_type, payload, created_at) values (?, ?, ?, ?, ?, ?)",
        (event["id"], event["pair_id"], sender_id, event_type, json.dumps(event["payload"]), event["created_at"]),
    )
    await manager.send_to_users([pair["user_a"], pair["user_b"]], {"type": "event", "event": event})
    return event


async def _announce_presence(user_id: str, online: bool) -> None:
    pair = active_pair(user_id)
    if pair:
        await manager.send_to_user(
            partner_id(pair, user_id), {"type": "presence", "user_id": user_id, "online": online}
        )


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
    except Exception:  # noqa: BLE001
        await ws.close(code=4401)
        return

    user = user_for_token(first.get("token")) if first.get("type") == "auth" else None
    if not user:
        await ws.send_text(json.dumps({"type": "auth_failed"}))
        await ws.close(code=4401)
        return

    user_id = user["id"]
    first_socket = not manager.is_online(user_id)
    manager.sockets[user_id].add(ws)

    pair = active_pair(user_id)
    await ws.send_text(
        json.dumps(
            {
                "type": "hello",
                "user_id": user_id,
                "partner_online": bool(pair) and manager.is_online(partner_id(pair, user_id)),
            }
        )
    )
    if first_socket:
        await _announce_presence(user_id, True)

    try:
        while True:
            message = json.loads(await ws.receive_text())
            kind = message.get("type")
            if kind == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
            elif kind == "touch":
                # Ephemeral "hold together" signal — relayed live, never stored.
                pair = active_pair(user_id)
                if pair:
                    await manager.send_to_user(
                        partner_id(pair, user_id),
                        {"type": "touch", "user_id": user_id, "active": bool(message.get("active"))},
                    )
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        manager.sockets[user_id].discard(ws)
        if not manager.is_online(user_id):
            pair = active_pair(user_id)
            if pair:
                await manager.send_to_user(
                    partner_id(pair, user_id), {"type": "touch", "user_id": user_id, "active": False}
                )
            await _announce_presence(user_id, False)
