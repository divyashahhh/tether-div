import hashlib
import hmac
import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import db
from .auth import current_user, public_user
from .pair_access import PairContext, active_pair, require_pair
from .realtime import record_event
from .scheduling import DEFAULT_AVAILABILITY, parse_window, rank_call_slots, state_at

router = APIRouter(prefix="/api", tags=["tether"])

MOMENT_WINDOW_MINUTES = 5
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
REACTIONS = {"seen", "smiled", "heart_spark"}
NUDGE_TYPES = {"nudge", "note"}
IMAGE_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}

PROMPTS = [
    "Take a photo of something that made you pause today.",
    "Show me the view from where you're sitting right now.",
    "Something small that made you smile.",
    "What's on your plate (or in your cup) right now?",
    "A colour you noticed today.",
    "The last place you walked past.",
    "Something that reminded you of me.",
    "Your hands, doing whatever they're doing.",
    "The sky, wherever you are.",
    "Something you'd show me if I were there.",
    "A corner of your room that feels like you.",
    "The most ordinary thing in front of you.",
    "Something you're looking forward to.",
    "Light and shadow — find some.",
    "What you're wearing today, in one detail.",
    "Something that sounds nice (show where it's coming from).",
    "A thing you'd normally never photograph.",
]


# --- helpers ---------------------------------------------------------------


def _secret() -> bytes:
    path = db.DATA_DIR / "secret.key"
    if not path.exists():
        db.DATA_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_hex(32))
    return path.read_text().strip().encode()


def media_url(filename: str) -> str:
    sig = hmac.new(_secret(), filename.encode(), hashlib.sha256).hexdigest()[:32]
    return f"/api/media/{filename}?sig={sig}"


def local_day(tz: str, moment: datetime | None = None) -> date:
    return (moment or db.utc_now()).astimezone(ZoneInfo(tz)).date()


def prompt_for(pair_id: str, day: date) -> str:
    seed = int(hashlib.sha256(f"{pair_id}:{day.isoformat()}".encode()).hexdigest(), 16)
    return PROMPTS[seed % len(PROMPTS)]


def get_availability(user_id: str) -> dict:
    row = db.one("select sleep, busy, preferred, updated_at from availability where user_id = ?", (user_id,))
    return row or {**DEFAULT_AVAILABILITY, "updated_at": None}


def _moment_payload(row: dict, viewer_id: str, viewer_posted_recently: bool, reactions: list[dict]) -> dict:
    created = datetime.fromisoformat(row["created_at"])
    locked = (
        row["creator_id"] != viewer_id
        and db.utc_now() - created < timedelta(hours=24)
        and not viewer_posted_recently
    )
    return {
        "id": row["id"],
        "creator_id": row["creator_id"],
        "caption": None if locked else row["caption"],
        "prompt": row["prompt"],
        "day_key": row["day_key"],
        "on_time": bool(row["on_time"]),
        "created_at": row["created_at"],
        "locked": locked,
        "image_url": None if locked else media_url(row["image_file"]),
        "reactions": reactions,
    }


# --- profile & mood ----------------------------------------------------------


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    timezone: str | None = None


@router.patch("/me/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(current_user)) -> dict:
    name = body.display_name.strip() if body.display_name else user["display_name"]
    tz = body.timezone or user["timezone"]
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Unknown timezone") from exc

    db.run(
        "update users set display_name = ?, timezone = ?, profile_complete = 1 where id = ?",
        (name, tz, user["id"]),
    )
    pair = active_pair(user["id"])
    if pair:
        await record_event(pair, user["id"], "profile_updated", {})
    return {"user": public_user(db.one("select * from users where id = ?", (user["id"],)))}


class MoodUpdate(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)
    note: str | None = Field(default=None, max_length=80)


@router.post("/me/mood")
async def set_mood(body: MoodUpdate, ctx: PairContext = Depends(require_pair)) -> dict:
    note = (body.note or "").strip() or None
    db.run(
        "update users set mood_emoji = ?, mood_note = ?, mood_at = ? where id = ?",
        (body.emoji, note, db.now_iso(), ctx.user["id"]),
    )
    await record_event(ctx.pair, ctx.user["id"], "mood_update", {"emoji": body.emoji, "note": note})
    return {"ok": True}


# --- activity (nudges & notes) ---------------------------------------------


class EventCreate(BaseModel):
    type: str
    message: str | None = Field(default=None, max_length=280)


@router.get("/events")
async def list_events(limit: int = Query(default=40, le=100), ctx: PairContext = Depends(require_pair)) -> list[dict]:
    rows = db.many(
        "select * from pair_events where pair_id = ? order by created_at desc limit ?",
        (ctx.pair["id"], limit),
    )
    return [db.decode_payload(r) for r in rows]


@router.post("/events")
async def create_event(body: EventCreate, ctx: PairContext = Depends(require_pair)) -> dict:
    if body.type not in NUDGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported event type")
    message = (body.message or "").strip()
    if body.type == "note" and not message:
        raise HTTPException(status_code=400, detail="Write something first")
    payload = {"message": message or "Thinking of you"}
    return await record_event(ctx.pair, ctx.user["id"], body.type, payload)


# --- moments ---------------------------------------------------------------


@router.get("/moments")
async def list_moments(ctx: PairContext = Depends(require_pair)) -> dict:
    pair_id, viewer_id = ctx.pair["id"], ctx.user["id"]
    rows = db.many("select * from moments where pair_id = ? order by created_at desc limit 60", (pair_id,))
    reaction_rows = db.many(
        "select r.moment_id, r.user_id, r.reaction from moment_reactions r "
        "join moments m on m.id = r.moment_id where m.pair_id = ?",
        (pair_id,),
    )
    by_moment: dict[str, list[dict]] = {}
    for r in reaction_rows:
        by_moment.setdefault(r["moment_id"], []).append({"user_id": r["user_id"], "reaction": r["reaction"]})

    cutoff = (db.utc_now() - timedelta(hours=24)).isoformat()
    viewer_posted_recently = any(r["creator_id"] == viewer_id and r["created_at"] >= cutoff for r in rows)
    moments = [_moment_payload(r, viewer_id, viewer_posted_recently, by_moment.get(r["id"], [])) for r in rows]

    today = local_day(ctx.user["timezone"]).isoformat()
    window_ends = ctx.pair["moment_window_ends_at"]
    if window_ends and datetime.fromisoformat(window_ends) < db.utc_now():
        window_ends = None

    return {
        "prompt": prompt_for(pair_id, db.utc_now().date()),
        "window_ends_at": window_ends,
        "window_started_by": ctx.pair["moment_window_started_by"] if window_ends else None,
        "posted_today": any(m["creator_id"] == viewer_id and m["day_key"] == today for m in moments),
        "moments": moments,
    }


@router.post("/moments/window")
async def start_moment_window(ctx: PairContext = Depends(require_pair)) -> dict:
    current = ctx.pair["moment_window_ends_at"]
    if current and datetime.fromisoformat(current) > db.utc_now():
        return {"window_ends_at": current}
    ends_at = (db.utc_now() + timedelta(minutes=MOMENT_WINDOW_MINUTES)).isoformat()
    db.run(
        "update pairs set moment_window_ends_at = ?, moment_window_started_by = ? where id = ?",
        (ends_at, ctx.user["id"], ctx.pair["id"]),
    )
    await record_event(ctx.pair, ctx.user["id"], "moment_window_started", {"ends_at": ends_at})
    return {"window_ends_at": ends_at}


@router.post("/moments")
async def create_moment(
    image: UploadFile = File(...),
    caption: str = Form(default=""),
    ctx: PairContext = Depends(require_pair),
) -> dict:
    content_type = (image.content_type or "").lower()
    if content_type not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Upload a JPEG, PNG, WebP or GIF image")
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large (8 MB max)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")

    day_key = local_day(ctx.user["timezone"]).isoformat()
    if db.one(
        "select id from moments where pair_id = ? and creator_id = ? and day_key = ?",
        (ctx.pair["id"], ctx.user["id"], day_key),
    ):
        raise HTTPException(status_code=409, detail="You've already shared today's Moment")

    window_ends = ctx.pair["moment_window_ends_at"]
    on_time = bool(window_ends and datetime.fromisoformat(window_ends) >= db.utc_now())

    moment_id = db.new_id()
    filename = f"{moment_id}{IMAGE_EXTENSIONS[content_type]}"
    (db.UPLOAD_DIR / filename).write_bytes(data)
    db.run(
        "insert into moments (id, pair_id, creator_id, caption, prompt, image_file, day_key, on_time, created_at) "
        "values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            moment_id,
            ctx.pair["id"],
            ctx.user["id"],
            caption.strip()[:200] or None,
            prompt_for(ctx.pair["id"], db.utc_now().date()),
            filename,
            day_key,
            int(on_time),
            db.now_iso(),
        ),
    )
    await record_event(ctx.pair, ctx.user["id"], "moment_created", {"moment_id": moment_id, "on_time": on_time})
    return {"id": moment_id, "on_time": on_time}


class ReactionCreate(BaseModel):
    reaction: str


@router.post("/moments/{moment_id}/reactions")
async def react_to_moment(moment_id: str, body: ReactionCreate, ctx: PairContext = Depends(require_pair)) -> dict:
    if body.reaction not in REACTIONS:
        raise HTTPException(status_code=400, detail="Unknown reaction")
    moment = db.one("select * from moments where id = ? and pair_id = ?", (moment_id, ctx.pair["id"]))
    if not moment:
        raise HTTPException(status_code=404, detail="Moment not found")
    db.run(
        "insert into moment_reactions (moment_id, user_id, reaction, created_at) values (?, ?, ?, ?) "
        "on conflict (moment_id, user_id) do update set reaction = excluded.reaction, created_at = excluded.created_at",
        (moment_id, ctx.user["id"], body.reaction, db.now_iso()),
    )
    await record_event(ctx.pair, ctx.user["id"], "reaction_added", {"moment_id": moment_id, "reaction": body.reaction})
    return {"ok": True}


@router.get("/media/{filename}")
async def media(filename: str, sig: str = "") -> FileResponse:
    expected = hmac.new(_secret(), filename.encode(), hashlib.sha256).hexdigest()[:32]
    path = (db.UPLOAD_DIR / filename).resolve()
    if not hmac.compare_digest(sig, expected) or path.parent != db.UPLOAD_DIR.resolve() or not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})


# --- plans -----------------------------------------------------------------


class PlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=500)
    starts_at: datetime | None = None


class PlanUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=500)
    starts_at: datetime | None = None
    done: bool | None = None


def _plan_out(row: dict) -> dict:
    return {**row, "done": bool(row["done"])}


@router.get("/plans")
async def list_plans(ctx: PairContext = Depends(require_pair)) -> list[dict]:
    rows = db.many(
        "select * from plans where pair_id = ? and deleted_at is null "
        "order by done asc, case when starts_at is null then 1 else 0 end, starts_at asc, created_at desc",
        (ctx.pair["id"],),
    )
    return [_plan_out(r) for r in rows]


@router.post("/plans")
async def create_plan(body: PlanCreate, ctx: PairContext = Depends(require_pair)) -> dict:
    plan_id, now = db.new_id(), db.now_iso()
    starts_at = body.starts_at.isoformat() if body.starts_at else None
    db.run(
        "insert into plans (id, pair_id, creator_id, title, notes, starts_at, created_at, updated_at) "
        "values (?, ?, ?, ?, ?, ?, ?, ?)",
        (plan_id, ctx.pair["id"], ctx.user["id"], body.title.strip(), (body.notes or "").strip() or None, starts_at, now, now),
    )
    await record_event(ctx.pair, ctx.user["id"], "plan_created", {"plan_id": plan_id, "title": body.title.strip()})
    return _plan_out(db.one("select * from plans where id = ?", (plan_id,)))


def _get_plan(plan_id: str, ctx: PairContext) -> dict:
    plan = db.one(
        "select * from plans where id = ? and pair_id = ? and deleted_at is null", (plan_id, ctx.pair["id"])
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.patch("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanUpdate, ctx: PairContext = Depends(require_pair)) -> dict:
    plan = _get_plan(plan_id, ctx)
    fields = body.model_dump(exclude_unset=True)
    title = fields["title"].strip() if fields.get("title") else plan["title"]
    notes = (fields["notes"] or "").strip() or None if "notes" in fields else plan["notes"]
    starts_at = (fields["starts_at"].isoformat() if fields["starts_at"] else None) if "starts_at" in fields else plan["starts_at"]
    done = int(fields["done"]) if fields.get("done") is not None else plan["done"]
    db.run(
        "update plans set title = ?, notes = ?, starts_at = ?, done = ?, updated_at = ? where id = ?",
        (title, notes, starts_at, done, db.now_iso(), plan_id),
    )
    payload = {"plan_id": plan_id, "title": title}
    if "done" in fields:
        payload["done"] = bool(done)
    await record_event(ctx.pair, ctx.user["id"], "plan_updated", payload)
    return _plan_out(db.one("select * from plans where id = ?", (plan_id,)))


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, ctx: PairContext = Depends(require_pair)) -> dict:
    plan = _get_plan(plan_id, ctx)
    db.run("update plans set deleted_at = ? where id = ?", (db.now_iso(), plan_id))
    await record_event(ctx.pair, ctx.user["id"], "plan_deleted", {"plan_id": plan_id, "title": plan["title"]})
    return {"ok": True}


# --- availability & call slots ----------------------------------------------


class AvailabilityUpdate(BaseModel):
    sleep: str
    busy: str
    preferred: str


@router.get("/availability")
async def availability(ctx: PairContext = Depends(require_pair)) -> dict:
    now = db.utc_now()

    def person(user: dict) -> dict:
        avail = get_availability(user["id"])
        return {**avail, "timezone": user["timezone"], "state_now": state_at(now, user["timezone"], avail)}

    return {"me": person(ctx.user), "partner": person(ctx.partner)}


@router.put("/availability")
async def set_availability(body: AvailabilityUpdate, ctx: PairContext = Depends(require_pair)) -> dict:
    values = {"sleep": body.sleep.strip(), "busy": body.busy.strip(), "preferred": body.preferred.strip()}
    for key, value in values.items():
        if value and parse_window(value) is None:
            raise HTTPException(status_code=400, detail=f"{key.title()} must look like 22:30-07:00")
    db.run(
        "insert into availability (user_id, sleep, busy, preferred, updated_at) values (?, ?, ?, ?, ?) "
        "on conflict (user_id) do update set sleep = excluded.sleep, busy = excluded.busy, "
        "preferred = excluded.preferred, updated_at = excluded.updated_at",
        (ctx.user["id"], values["sleep"], values["busy"], values["preferred"], db.now_iso()),
    )
    await record_event(ctx.pair, ctx.user["id"], "availability_updated", {})
    return {"ok": True}


@router.get("/call-slots")
async def call_slots(ctx: PairContext = Depends(require_pair)) -> list[dict]:
    people = [
        {"timezone": u["timezone"], "availability": get_availability(u["id"])} for u in (ctx.user, ctx.partner)
    ]
    return rank_call_slots(people, db.utc_now())


# --- stats & search ----------------------------------------------------------


@router.get("/stats")
async def stats(ctx: PairContext = Depends(require_pair)) -> dict:
    me, partner = ctx.user["id"], ctx.partner["id"]
    # Partners can be on different calendar dates, so shared days are counted in one
    # reference timezone (whoever created the pair code) — both see the same streak.
    ref_user = ctx.user if ctx.user["id"] == ctx.pair["user_a"] else ctx.partner
    ref_tz = ref_user["timezone"]
    rows = db.many("select creator_id, created_at from moments where pair_id = ?", (ctx.pair["id"],))

    def pair_day(row: dict) -> str:
        return local_day(ref_tz, datetime.fromisoformat(row["created_at"])).isoformat()

    mine = {pair_day(r) for r in rows if r["creator_id"] == me}
    theirs = {pair_day(r) for r in rows if r["creator_id"] == partner}
    both = mine & theirs

    today = local_day(ref_tz)
    streak, day = 0, today
    if day.isoformat() not in both:
        day -= timedelta(days=1)  # today isn't over yet — don't break the streak
    while day.isoformat() in both:
        streak += 1
        day -= timedelta(days=1)

    week = []
    for offset in range(6, -1, -1):
        d = today - timedelta(days=offset)
        key = d.isoformat()
        week.append({"day_key": key, "weekday": d.strftime("%a")[0], "day": d.day, "me": key in mine, "partner": key in theirs})

    return {
        "reference_timezone": ref_tz,
        "streak": streak,
        "week": week,
        "week_both": sum(1 for w in week if w["me"] and w["partner"]),
        "week_me": sum(1 for w in week if w["me"]),
        "week_partner": sum(1 for w in week if w["partner"]),
        "total_moments": len(rows),
        "plans_done": db.one(
            "select count(*) as n from plans where pair_id = ? and done = 1 and deleted_at is null", (ctx.pair["id"],)
        )["n"],
    }


@router.get("/search")
async def search(q: str = Query(min_length=2, max_length=60), ctx: PairContext = Depends(require_pair)) -> list[dict]:
    like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    pair_id = ctx.pair["id"]
    results = []
    for r in db.many(
        "select id, title, notes, starts_at, created_at from plans where pair_id = ? and deleted_at is null "
        "and (title like ? escape '\\' or notes like ? escape '\\') order by created_at desc limit 10",
        (pair_id, like, like),
    ):
        results.append({"kind": "plan", "id": r["id"], "text": r["title"], "detail": r["notes"], "at": r["starts_at"] or r["created_at"]})
    for r in db.many(
        "select id, caption, prompt, created_at from moments where pair_id = ? "
        "and (caption like ? escape '\\' or prompt like ? escape '\\') order by created_at desc limit 10",
        (pair_id, like, like),
    ):
        results.append({"kind": "moment", "id": r["id"], "text": r["caption"] or r["prompt"], "detail": r["prompt"] if r["caption"] else None, "at": r["created_at"]})
    for r in db.many(
        "select id, sender_id, event_type, payload, created_at from pair_events where pair_id = ? "
        "and event_type in ('note', 'mood_update') and payload like ? escape '\\' order by created_at desc limit 10",
        (pair_id, like),
    ):
        r = db.decode_payload(r)
        text = r["payload"].get("message") or f'{r["payload"].get("emoji", "")} {r["payload"].get("note") or ""}'.strip()
        results.append({"kind": r["event_type"], "id": r["id"], "text": text, "detail": None, "at": r["created_at"], "sender_id": r["sender_id"]})
    results.sort(key=lambda x: x["at"] or "", reverse=True)
    return results[:20]
