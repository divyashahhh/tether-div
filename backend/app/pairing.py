import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import db
from .auth import current_user
from .pair_access import PairContext, active_pair, partner_id, require_pair
from .realtime import manager, record_event

router = APIRouter(prefix="/api/pairing", tags=["pairing"])

# No 0/O or 1/I so codes can be read aloud or typed from another screen.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
CODE_TTL_MINUTES = 10


class RedeemCodeRequest(BaseModel):
    code: str


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def partner_summary(partner: dict) -> dict:
    return {
        "id": partner["id"],
        "display_name": partner["display_name"],
        "timezone": partner["timezone"],
        "mood_emoji": partner["mood_emoji"],
        "mood_note": partner["mood_note"],
        "mood_at": partner["mood_at"],
    }


@router.post("/create-code")
async def create_pair_code(user: dict = Depends(current_user)) -> dict:
    if active_pair(user["id"]):
        raise HTTPException(status_code=400, detail="You already have an active pair. Unpair first.")

    # Only one live code per person; older ones stop working.
    db.run(
        "update pair_codes set used_at = ? where creator_id = ? and used_at is null",
        (db.now_iso(), user["id"]),
    )
    expires_at = (db.utc_now() + timedelta(minutes=CODE_TTL_MINUTES)).isoformat()
    for _ in range(5):
        code = _generate_code()
        if not db.one("select id from pair_codes where code = ?", (code,)):
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate a pairing code")

    db.run(
        "insert into pair_codes (id, creator_id, code, expires_at, created_at) values (?, ?, ?, ?, ?)",
        (db.new_id(), user["id"], code, expires_at, db.now_iso()),
    )
    return {"code": code, "expires_at": expires_at}


@router.post("/redeem-code")
async def redeem_pair_code(body: RedeemCodeRequest, user: dict = Depends(current_user)) -> dict:
    code = body.code.strip().upper()
    if len(code) != CODE_LENGTH:
        raise HTTPException(status_code=400, detail="Codes are 6 characters")
    if active_pair(user["id"]):
        raise HTTPException(status_code=400, detail="You already have an active pair")

    row = db.one("select * from pair_codes where code = ?", (code,))
    if not row:
        raise HTTPException(status_code=404, detail="Code not found")
    if row["used_at"]:
        raise HTTPException(status_code=400, detail="That code was already used")
    if datetime.fromisoformat(row["expires_at"]) < db.utc_now():
        raise HTTPException(status_code=400, detail="That code has expired")
    if row["creator_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="You can't pair with yourself")
    if active_pair(row["creator_id"]):
        raise HTTPException(status_code=400, detail="That person is already paired")

    pair_id = db.new_id()
    c = db.conn()
    c.execute("begin immediate")
    try:
        c.execute(
            "insert into pairs (id, user_a, user_b, status, created_at) values (?, ?, ?, 'active', ?)",
            (pair_id, row["creator_id"], user["id"], db.now_iso()),
        )
        c.execute("update pair_codes set used_at = ? where id = ?", (db.now_iso(), row["id"]))
        c.execute("commit")
    except Exception:
        c.execute("rollback")
        raise

    pair = db.one("select * from pairs where id = ?", (pair_id,))
    await manager.send_to_users([pair["user_a"], pair["user_b"]], {"type": "pair_changed"})
    await record_event(pair, user["id"], "pair_connected", {})
    return {"pair_id": pair_id}


@router.get("/status")
async def pair_status(user: dict = Depends(current_user)) -> dict:
    pair = active_pair(user["id"])
    if not pair:
        return {"pair_id": None, "partner": None, "partner_online": False}
    partner = db.one("select * from users where id = ?", (partner_id(pair, user["id"]),))
    return {
        "pair_id": pair["id"],
        "paired_at": pair["created_at"],
        "partner": partner_summary(partner),
        "partner_online": manager.is_online(partner["id"]),
    }


@router.post("/unpair")
async def unpair(ctx: PairContext = Depends(require_pair)) -> dict:
    await record_event(ctx.pair, ctx.user["id"], "pair_ended", {})
    db.run(
        "update pairs set status = 'ended', ended_at = ? where id = ?",
        (db.now_iso(), ctx.pair["id"]),
    )
    await manager.send_to_users(ctx.member_ids, {"type": "pair_changed"})
    return {"ok": True}
