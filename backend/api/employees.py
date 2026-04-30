"""人员元数据查看（需求 2）。

- 列表 / 详情都附带 `_inferred` 字段，标注每条估算的来源
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.inference import employee_with_inference
from backend.core.storage import get_db
from backend.models.schemas import APIResponse

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("")
def list_with_inference() -> APIResponse:
    db = get_db()
    employees = list((db.get_section("employees") or {}).values())
    enriched = [employee_with_inference(e, employees) for e in employees]
    return APIResponse(ok=True, data=enriched)


@router.get("/{emp_id}")
def detail(emp_id: str) -> APIResponse:
    db = get_db()
    employees = db.get_section("employees") or {}
    if emp_id not in employees:
        raise HTTPException(404, f"员工不存在: {emp_id}")
    enriched = employee_with_inference(employees[emp_id], list(employees.values()))
    return APIResponse(ok=True, data=enriched)
