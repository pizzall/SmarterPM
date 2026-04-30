"""数据库整体导入 / 导出 / 重置。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from backend.core.storage import get_db
from backend.models.schemas import APIResponse

router = APIRouter(prefix="/api/database", tags=["database"])


@router.get("/export")
def export_database() -> Response:
    db = get_db()
    return Response(
        content=db.export_bytes(),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="database.json"'},
    )


@router.post("/import")
async def import_database(file: UploadFile = File(...)) -> APIResponse:
    raw = await file.read()
    try:
        get_db().import_bytes(raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return APIResponse(ok=True, message="数据库已整体导入（旧库已自动备份）")


@router.post("/reset")
def reset_database() -> APIResponse:
    get_db().reset_to_default()
    return APIResponse(ok=True, message="数据库已重置为内置示例数据")


@router.get("/snapshot")
def snapshot() -> APIResponse:
    return APIResponse(ok=True, data=get_db().snapshot())
