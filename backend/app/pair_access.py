from fastapi import Depends, HTTPException

from . import db
from .auth import current_user


def active_pair(user_id: str) -> dict | None:
    return db.one(
        "select * from pairs where status = 'active' and (user_a = ? or user_b = ?) limit 1",
        (user_id, user_id),
    )


def partner_id(pair: dict, user_id: str) -> str:
    return pair["user_b"] if pair["user_a"] == user_id else pair["user_a"]


class PairContext:
    def __init__(self, user: dict, pair: dict):
        self.user = user
        self.pair = pair
        self.partner = db.one("select * from users where id = ?", (partner_id(pair, user["id"]),))

    @property
    def member_ids(self) -> list[str]:
        return [self.pair["user_a"], self.pair["user_b"]]


async def require_pair(user: dict = Depends(current_user)) -> PairContext:
    pair = active_pair(user["id"])
    if not pair:
        raise HTTPException(status_code=409, detail="You're not paired yet")
    return PairContext(user, pair)
