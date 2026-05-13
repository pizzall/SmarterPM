"""人员元数据查看（需求 2）。

- 列表 / 详情都附带 `_inferred` 字段，标注每条估算的来源
- 列表附带 `_load`：当前活跃任务列表（用于人员状态面板）
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from backend.core.inference import employee_with_inference
from backend.core.storage import get_db
from backend.models.schemas import APIResponse

router = APIRouter(prefix="/api/employees", tags=["employees"])


def _compute_load(employees: list[dict[str, Any]], tasks: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """聚合每个员工当前处于 active 任务（基于方案成员）。"""

    by_emp: dict[str, list[dict[str, Any]]] = {e.get("id"): [] for e in employees}
    by_emp_requester: dict[str, list[dict[str, Any]]] = {e.get("id"): [] for e in employees}
    for task in (tasks or {}).values():
        if task.get("status") != "active":
            continue
        ref = {
            "task_id": task.get("id"),
            "title": task.get("title"),
            "priority": task.get("priority"),
            "progress": task.get("progress"),
        }
        for prop in task.get("proposals") or []:
            for m in prop.get("members") or []:
                eid = m.get("employee_id")
                if eid in by_emp:
                    by_emp[eid].append({**ref, "role": m.get("role")})
        req = task.get("requester")
        if req in by_emp_requester:
            by_emp_requester[req].append(ref)
    # 去重（同一个任务可能多个方案都包含相同员工）
    for eid, items in by_emp.items():
        seen = {}
        for it in items:
            seen[it["task_id"]] = it
        by_emp[eid] = list(seen.values())
    return {"member_of": by_emp, "requester_of": by_emp_requester}


def _load_threshold(count: int) -> str:
    if count <= 0:
        return "idle"
    if count <= 2:
        return "normal"
    return "overload"


@router.get("")
def list_with_inference() -> APIResponse:
    db = get_db()
    employees = list((db.get_section("employees") or {}).values())
    tasks = db.get_section("tasks") or {}
    load_map = _compute_load(employees, tasks)
    enriched = []
    for e in employees:
        item = employee_with_inference(e, employees)
        member_tasks = load_map["member_of"].get(e.get("id"), [])
        requester_tasks = load_map["requester_of"].get(e.get("id"), [])
        item["_load"] = {
            "active_task_count": len(member_tasks),
            "active_tasks": member_tasks,
            "requester_tasks": requester_tasks,
            "level": _load_threshold(len(member_tasks)),
        }
        enriched.append(item)
    return APIResponse(ok=True, data=enriched)


@router.get("/{emp_id}")
def detail(emp_id: str) -> APIResponse:
    db = get_db()
    employees = db.get_section("employees") or {}
    if emp_id not in employees:
        raise HTTPException(404, f"员工不存在: {emp_id}")
    enriched = employee_with_inference(employees[emp_id], list(employees.values()))
    return APIResponse(ok=True, data=enriched)
