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

        from backend.api.notifications import push_notification

        push_notification(
            data,
            title=f"新增回顾：{task.get('title','')}",
            kind="review_added",
            body=(body.content or "")[:80],
            link=f"#/tasks/{task_id}/review",
            related={"task_id": task_id, "mood": body.mood},
        )
        if ability_proposals:
            push_notification(
                data,
                title=f"能力值待审 +{len(ability_proposals)}",
                kind="ability_pending",
                body="由回顾触发，请到「能力值待审」处理",
                link="#/ability-updates",
                related={"task_id": task_id, "count": len(ability_proposals)},
            )

        return APIResponse(
            ok=True,
            data={"review_item": item, "ability_proposals": ability_proposals},
            message="回顾已记录",
        )
