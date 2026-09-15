"""SQLite storage for Tether.

A single connection is shared by the app: every endpoint is `async def`, so all
queries run on the event-loop thread and never overlap.
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(os.getenv("TETHER_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "tether.db"

SCHEMA = """
create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  timezone text not null default 'UTC',
  profile_complete integer not null default 0,
  mood_emoji text,
  mood_note text,
  mood_at text,
  created_at text not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at text not null
);

create table if not exists pair_codes (
  id text primary key,
  creator_id text not null references users(id) on delete cascade,
  code text not null unique,
  expires_at text not null,
  used_at text,
  created_at text not null
);

create table if not exists pairs (
  id text primary key,
  user_a text not null references users(id) on delete cascade,
  user_b text not null references users(id) on delete cascade,
  status text not null default 'active',
  moment_window_ends_at text,
  moment_window_started_by text,
  created_at text not null,
  ended_at text,
  check (user_a <> user_b)
);
create index if not exists pairs_user_a_idx on pairs (user_a, status);
create index if not exists pairs_user_b_idx on pairs (user_b, status);

create table if not exists pair_events (
  id text primary key,
  pair_id text not null references pairs(id) on delete cascade,
  sender_id text not null references users(id) on delete cascade,
  event_type text not null,
  payload text not null default '{}',
  created_at text not null
);
create index if not exists pair_events_pair_idx on pair_events (pair_id, created_at desc);

create table if not exists moments (
  id text primary key,
  pair_id text not null references pairs(id) on delete cascade,
  creator_id text not null references users(id) on delete cascade,
  caption text,
  prompt text,
  image_file text not null,
  day_key text not null,
  on_time integer not null default 0,
  created_at text not null,
  unique (pair_id, creator_id, day_key)
);
create index if not exists moments_pair_idx on moments (pair_id, created_at desc);

create table if not exists moment_reactions (
  moment_id text not null references moments(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  reaction text not null,
  created_at text not null,
  primary key (moment_id, user_id)
);

create table if not exists plans (
  id text primary key,
  pair_id text not null references pairs(id) on delete cascade,
  creator_id text not null references users(id) on delete cascade,
  title text not null,
  notes text,
  starts_at text,
  done integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists plans_pair_idx on plans (pair_id, deleted_at);

create table if not exists availability (
  user_id text primary key references users(id) on delete cascade,
  sleep text not null,
  busy text not null,
  preferred text not null,
  updated_at text not null
);
"""

_conn: sqlite3.Connection | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return utc_now().isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("pragma journal_mode = wal")
        _conn.execute("pragma foreign_keys = on")
        _conn.executescript(SCHEMA)
    return _conn


def one(sql: str, params: tuple = ()) -> dict | None:
    row = conn().execute(sql, params).fetchone()
    return dict(row) if row else None


def many(sql: str, params: tuple = ()) -> list[dict]:
    return [dict(r) for r in conn().execute(sql, params).fetchall()]


def run(sql: str, params: tuple = ()) -> None:
    conn().execute(sql, params)


def decode_payload(row: dict) -> dict:
    row["payload"] = json.loads(row.get("payload") or "{}")
    return row
