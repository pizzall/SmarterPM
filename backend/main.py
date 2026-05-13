"""FastAPI 应用入口（需求 9）。

启动：
    python -m backend.main

端口与 LLM 配置从项目根目录的 `config.json` 读取，默认 127.0.0.1:11011。
"""

from __future__ import annotations

import logging
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import (
    ability_updates,
    chat,
    database,
    employees,
    meta,
    notifications,
    org,
    planning,
    proposals,
    reviews,
    tasks,
)
from backend.core.storage import get_db
from backend.settings import get_settings


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="SmarterPM 公司执行模拟系统", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(org.router)
    app.include_router(employees.router)
    app.include_router(tasks.router)
    app.include_router(planning.router)
    app.include_router(proposals.router)
    app.include_router(reviews.router)
    app.include_router(ability_updates.router)
    app.include_router(chat.router)
    app.include_router(database.router)
    app.include_router(meta.router)
    app.include_router(notifications.router)

    @app.get("/api/health")
    def health() -> dict:
        return {
            "ok": True,
            "app": "SmarterPM",
            "version": app.version,
            "llm_enabled": settings.llm.enabled,
            "database_file": str(settings.database_path.relative_to(settings.project_root)),
        }

    get_db()

    frontend_dir = settings.project_root / "frontend"
    if frontend_dir.exists():
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app


app = create_app()


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "backend.main:app",
        host=settings.server.host,
        port=settings.server.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
