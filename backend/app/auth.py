import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from . import db

router = APIRouter(prefix="/api/auth", tags=["auth"])

SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$", 1)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **SCRYPT)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    db.run(
        "insert into sessions (token_hash, user_id, created_at) values (?, ?, ?)",
        (_token_hash(token), user_id, db.now_iso()),
    )
    return token


def user_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    return db.one(
        "select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = ?",
        (_token_hash(token),),
    )


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "timezone": user["timezone"],
        "profile_complete": bool(user["profile_complete"]),
        "mood_emoji": user["mood_emoji"],
        "mood_note": user["mood_note"],
        "mood_at": user["mood_at"],
    }


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


async def current_user(authorization: str | None = Header(default=None)) -> dict:
    user = user_for_token(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in again")
    return user


class SignUpRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=200)
    display_name: str = Field(min_length=1, max_length=40)


class SignInRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def signup(body: SignUpRequest) -> dict:
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email")
    if db.one("select id from users where email = ?", (email,)):
        raise HTTPException(status_code=400, detail="An account with that email already exists")
    user_id = db.new_id()
    db.run(
        "insert into users (id, email, password_hash, display_name, created_at) values (?, ?, ?, ?, ?)",
        (user_id, email, hash_password(body.password), body.display_name.strip(), db.now_iso()),
    )
    user = db.one("select * from users where id = ?", (user_id,))
    return {"token": create_session(user_id), "user": public_user(user)}


@router.post("/signin")
async def signin(body: SignInRequest) -> dict:
    user = db.one("select * from users where email = ?", (body.email.strip().lower(),))
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    return {"token": create_session(user["id"]), "user": public_user(user)}


@router.post("/signout")
async def signout(authorization: str | None = Header(default=None)) -> dict:
    token = _bearer(authorization)
    if token:
        db.run("delete from sessions where token_hash = ?", (_token_hash(token),))
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(current_user)) -> dict:
    return {"user": public_user(user)}
