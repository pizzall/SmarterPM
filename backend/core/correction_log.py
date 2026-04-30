"""纠正日志写入工具（设计 §6.2）。

所有更新只追加、不覆盖原值，保证可追溯。
"""

from __future__ import annotations

from typing import Any

from backend.core.storage import now_iso


def append_correction(
    employee: dict[str, Any],
    *,
    field: str,
    old_value: Any,
    new_value: Any,
    source: str,
    updated_by: str | None = None,
    task_id: str | None = None,
) -> dict[str, Any]:
    log_item = {
        "date": now_iso(),
        "task_id": task_id,
        "field": field,
        "old_value": old_value,
        "new_value": new_value,
        "source": source,
        "updated_by": updated_by,
    }
    employee.setdefault("correction_log", []).append(log_item)
    return log_item


def apply_field_change(employee: dict[str, Any], field: str, new_value: Any) -> Any:
    """更新档案字段，处理 skill:技能名 这种特殊字段。返回旧值。"""
    if field.startswith("skill:"):
        tag = field.split(":", 1)[1]
        skills = employee.setdefault("skills", [])
        for s in skills:
            if s.get("tag") == tag:
                old = s.get("level")
                s["level"] = new_value
                return old
        skills.append({"tag": tag, "level": new_value})
        return None

    old = employee.get(field)
    employee[field] = new_value
    return old
