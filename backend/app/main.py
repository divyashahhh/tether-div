from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import db
from .auth import router as auth_router
from .features import router as features_router
from .pairing import router as pairing_router
from .realtime import manager
from .realtime import router as realtime_router

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

app = FastAPI(title="Tether API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    db.conn()


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "database": str(db.DB_PATH),
        "connected_users": sum(1 for sockets in manager.sockets.values() if sockets),
    }


app.include_router(auth_router)
app.include_router(pairing_router)
app.include_router(features_router)
app.include_router(realtime_router)


# Serve the built frontend (npm run build) so one port can host the whole app.
if FRONTEND_DIST.exists():

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
