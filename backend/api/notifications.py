"""通知中心 API（UX §3.1 P2）。

事件源：方案 finalize / 提交回顾 / 能力值待审产生 / 任务状态变更 / 进度更新等。
存储：database.json 顶层 `notifications` 数组（按时间倒序），最多保留 200 条。
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core.storage import gen_id, get_db, now_iso
from backend.models.schemas import APIResponse

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


MAX_KEEP = 200


class NotificationCreate(BaseModel):
    title: str
    body: Optional[str] = None
    kind: Literal[
        "task_created",
        "task_status",
        "proposal_finalize",
        "proposal_modified",
        "review_added",
        "ability_pending",
        "progress_update",
        "info",
    ] = "info"
    link: Optional[str] = None
    related: dict[str, Any] = Field(default_factory=dict)


class NotificationMark(BaseModel):
    ids: list[str] = Field(default_factory=list)
    all: bool = False


def push_notification(
    data: dict[str, Any],
    *,
    title: str,
    kind: str = "info",
    body: str | None = None,
    link: str | None = None,
    related: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """供其它后端模块直接调用：把通知写入事务中的 data 引用。"""

    notifications = data.setdefault("notifications", [])
    item = {
        "id": gen_id("ntf"),
        "title": title,
        "body": body or "",
        "kind": kind,
        "link": link,
        "related": related or {},
        "created_at": now_iso(),
        "read": False,
    }
    notifications.insert(0, item)
    if len(notifications) > MAX_KEEP:
        del notifications[MAX_KEEP:]
    return item


@router.get("")
def list_notifications(limit: int = 50, only_unread: bool = False) -> APIResponse:
    db = get_db()
    items = list(db.get_section("notifications") or [])
    if only_unread:
        items = [n for n in items if not n.get("read")]
    return APIResponse(ok=True, data=items[: max(1, min(limit, MAX_KEEP))])


@router.get("/unread_count")
def unread_count() -> APIResponse:
    db = get_db()
    items = db.get_section("notifications") or []
    n = sum(1 for x in items if not x.get("read"))
    return APIResponse(ok=True, data={"count": n})


@router.post("")
def create_notification(body: NotificationCreate) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        item = push_notification(
            data,
            title=body.title,
            body=body.body,
            kind=body.kind,
            link=body.link,
            related=body.related,
        )
    return APIResponse(ok=True, data=item)


@router.post("/mark_read")
def mark_read(body: NotificationMark) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        items = data.setdefault("notifications", [])
        changed = 0
        target = set(body.ids or [])
        for it in items:
            if body.all or it.get("id") in target:
                if not it.get("read"):
                    it["read"] = True
                    it["read_at"] = now_iso()
                    changed += 1
        return APIResponse(ok=True, data={"updated": changed})


@router.delete("/{nid}")
def delete_notification(nid: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        items = data.setdefault("notifications", [])
        new_items = [x for x in items if x.get("id") != nid]
        if len(new_items) == len(items):
            raise HTTPException(404, f"通知不存在: {nid}")
        data["notifications"] = new_items
        return APIResponse(ok=True, message="已删除")
