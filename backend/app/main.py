from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Leda API",
        version="0.1.0",
        description="Orders, verification queue, payments and ledger for wholesale distributors.",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_dev else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "env": settings.app_env}

    from app.api.v1 import router as v1_router

    app.include_router(v1_router, prefix="/api/v1")
    return app


app = create_app()
