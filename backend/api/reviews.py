"""任务回顾评价（需求 6）。提交回顾时同步触发能力值变更提案（需求 7 触发点之二）。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.ability_updates import generate_ability_proposals
from backend.core.storage import get_db, now_iso
from backend.models.schemas import APIResponse, ReviewIn

router = APIRouter(prefix="/api/tasks", tags=["reviews"])


@router.get("/{task_id}/review")
def list_reviews(task_id: str) -> APIResponse:
    db = get_db()
    task = (db.get_section("tasks") or {}).get(task_id)
    if not task:
        raise HTTPException(404, f"任务不存在: {task_id}")
    return APIResponse(ok=True, data=task.get("review") or [])


@router.post("/{task_id}/review")
def add_review(task_id: str, body: ReviewIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        task = (data.get("tasks") or {}).get(task_id)
        if not task:
            raise HTTPException(404, f"任务不存在: {task_id}")
        item = {
            "content": body.content,
            "author": body.author,
            "mood": body.mood,
            "date": now_iso(),
        }
        task.setdefault("review", []).append(item)
        task["updated_at"] = now_iso()

        related: list[str] = []
        for prop in task.get("proposals") or []:
            for m in prop.get("members") or []:
                if m.get("employee_id"):
                    related.append(m["employee_id"])
        related = list(dict.fromkeys(related))

        ability_proposals = generate_ability_proposals(
            data,
            trigger="review",
            task_id=task_id,
            input_text=body.content,
            related_employee_ids=related,
        )
        return APIResponse(
            ok=True,
            data={"review_item": item, "ability_proposals": ability_proposals},
            message="回顾已记录",
        )
