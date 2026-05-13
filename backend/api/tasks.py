"""任务增删改查（需求 5）。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from backend.core.storage import gen_id, get_db, now_iso
from backend.models.schemas import APIResponse, TaskIn

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
def list_tasks() -> APIResponse:
    db = get_db()
    tasks = list((db.get_section("tasks") or {}).values())
    tasks.sort(key=lambda t: t.get("updated_at", ""), reverse=True)
    return APIResponse(ok=True, data=tasks)


@router.get("/{task_id}")
def get_task(task_id: str) -> APIResponse:
    db = get_db()
    tasks = db.get_section("tasks") or {}
    if task_id not in tasks:
        raise HTTPException(404, f"任务不存在: {task_id}")
    return APIResponse(ok=True, data=tasks[task_id])


@router.post("")
def create_task(body: TaskIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        tasks = data.setdefault("tasks", {})
        new_id = body.id or gen_id("task")
        if new_id in tasks:
            raise HTTPException(409, f"任务 id 已存在: {new_id}")
        task = body.model_dump()
        task["id"] = new_id
        task.setdefault("proposals", [])
        task.setdefault("review", [])
        task["created_at"] = now_iso()
        task["updated_at"] = task["created_at"]
        tasks[new_id] = task
        return APIResponse(ok=True, data=task, message="任务已创建")


@router.put("/{task_id}")
def update_task(task_id: str, body: TaskIn) -> APIResponse:
    from backend.api.notifications import push_notification

    db = get_db()
    with db.transaction() as data:
        tasks = data.get("tasks") or {}
        if task_id not in tasks:
            raise HTTPException(404, f"任务不存在: {task_id}")
        task = tasks[task_id]
        new_data = body.model_dump()
        new_data["id"] = task_id
        new_data.setdefault("proposals", task.get("proposals", []))
        new_data.setdefault("review", task.get("review", []))
        new_data["created_at"] = task.get("created_at", now_iso())
        new_data["updated_at"] = now_iso()
        old_status = task.get("status")
        old_progress = task.get("progress")
        tasks[task_id] = new_data
        if new_data.get("status") and new_data["status"] != old_status:
            push_notification(
                data,
                title=f"任务状态变更：{new_data.get('title','')}",
                kind="task_status",
                body=f"{old_status or '-'} → {new_data['status']}",
                link=f"#/tasks/{task_id}",
                related={"task_id": task_id, "from": old_status, "to": new_data["status"]},
            )
        if (
            new_data.get("progress") is not None
            and new_data.get("progress") != old_progress
        ):
            push_notification(
                data,
                title=f"进度更新：{new_data.get('title','')}",
                kind="progress_update",
                body=f"{old_progress or 0}% → {new_data['progress']}%",
                link=f"#/tasks/{task_id}",
                related={"task_id": task_id, "progress": new_data["progress"]},
            )
        return APIResponse(ok=True, data=new_data, message="任务已更新")


@router.delete("/{task_id}")
def delete_task(task_id: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        tasks = data.get("tasks") or {}
        if task_id not in tasks:
            raise HTTPException(404, f"任务不存在: {task_id}")
        del tasks[task_id]
        # 同步从 sprint.tasks / ability_update_proposals 中清理
        for sprint in (data.get("sprints") or {}).values():
            sprint["tasks"] = [t for t in (sprint.get("tasks") or []) if t != task_id]
        proposals = data.get("ability_update_proposals") or {}
        to_remove = [k for k, v in proposals.items() if v.get("task_id") == task_id]
        for k in to_remove:
            del proposals[k]
        return APIResponse(ok=True, message="任务已删除")


@router.get("/{task_id}/conflicts")
def task_conflicts(task_id: str) -> APIResponse:
    """检查任务方案中的成员是否已在其它 active 任务里。"""

    db = get_db()
    tasks = db.get_section("tasks") or {}
    target = tasks.get(task_id)
    if not target:
        raise HTTPException(404, f"任务不存在: {task_id}")
    employees = db.get_section("employees") or {}

    # 当前任务方案涉及的成员集合
    current_members: set[str] = set()
    for prop in target.get("proposals") or []:
        for m in prop.get("members") or []:
            if m.get("employee_id"):
                current_members.add(m["employee_id"])

    if not current_members:
        return APIResponse(ok=True, data={"conflicts": []})

    # 其它 active 任务里的占用
    occupied: dict[str, list[dict[str, Any]]] = {eid: [] for eid in current_members}
    for tid, t in tasks.items():
        if tid == task_id:
            continue
        if t.get("status") != "active":
            continue
        for prop in t.get("proposals") or []:
            for m in prop.get("members") or []:
                eid = m.get("employee_id")
                if eid in occupied:
                    occupied[eid].append({
                        "task_id": tid,
                        "title": t.get("title"),
                        "role": m.get("role"),
                    })

    conflicts = []
    for eid, items in occupied.items():
        if not items:
            continue
        # 同任务多个方案占用合并
        seen: dict[str, dict[str, Any]] = {}
        for it in items:
            seen[it["task_id"]] = it
        emp = employees.get(eid, {})
        conflicts.append({
            "employee_id": eid,
            "name": emp.get("name") or eid,
            "other_tasks": [v.get("title") or k for k, v in seen.items()],
            "task_ids": list(seen.keys()),
        })

    return APIResponse(ok=True, data={"conflicts": conflicts})


@router.post("/import-json")
def import_tasks_json(body: dict[str, Any]) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        value = body.get("tasks", body)
        if isinstance(value, list):
            data["tasks"] = {t["id"]: t for t in value if t.get("id")}
        elif isinstance(value, dict):
            data["tasks"] = value
        else:
            raise HTTPException(400, "tasks 必须是 dict 或 list")
        return APIResponse(ok=True, message="任务 JSON 已写入")
