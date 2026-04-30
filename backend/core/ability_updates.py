"""能力值变更提案的生成（设计 §6.2）。

被两个触发点调用：
- proposals.py 中的方案二次修改提交后
- reviews.py 中的任务回顾提交后

调用必须在某个 `db.transaction()` 上下文内（直接修改 data 引用，不另起事务）。
"""

from __future__ import annotations

import json
import re
from typing import Any

from backend.core.llm_client import get_llm
from backend.core.prompts import ABILITY_UPDATE_SYSTEM
from backend.core.storage import gen_id, now_iso

NUMERIC_FIELDS = {"communication", "responsibility", "growth_rate"}
ENUM_FIELDS = {"performance_trend": {"rising", "stable", "declining"}}


def _clamp(old: Any, new: Any) -> float | None:
    try:
        old_v = float(old) if old is not None else 3.0
        new_v = float(new)
    except (TypeError, ValueError):
        return None
    delta = max(min(new_v - old_v, 0.5), -0.5)
    final = max(1.0, min(5.0, old_v + delta))
    return round(final, 1)


def _heuristic_ability_proposals(
    input_text: str,
    related: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """无 LLM 时的简单关键字规则。"""
    text = input_text or ""
    out: list[dict[str, Any]] = []
    for emp in related:
        eid = emp["id"]
        name = emp.get("name") or eid
        if name not in text and eid not in text:
            continue
        if re.search(r"沟通(更|很)?(好|强|超预期)", text):
            out.append({
                "employee_id": eid, "field": "communication",
                "old_value": emp.get("communication"),
                "proposed_value": _clamp(emp.get("communication"), (emp.get("communication") or 3) + 0.5),
                "reason": f"输入中提及 {name} 沟通能力优于评分",
            })
        if re.search(r"沟通(差|弱|不足|不够)", text):
            out.append({
                "employee_id": eid, "field": "communication",
                "old_value": emp.get("communication"),
                "proposed_value": _clamp(emp.get("communication"), (emp.get("communication") or 3) - 0.5),
                "reason": f"输入中提及 {name} 沟通能力低于预期",
            })
        if re.search(r"(责任心|负责|尽责)(强|很好|超出)", text):
            out.append({
                "employee_id": eid, "field": "responsibility",
                "old_value": emp.get("responsibility"),
                "proposed_value": _clamp(emp.get("responsibility"), (emp.get("responsibility") or 3) + 0.5),
                "reason": f"输入中提及 {name} 责任度突出",
            })
        if re.search(r"状态(差|不好|下滑)", text):
            out.append({
                "employee_id": eid, "field": "performance_trend",
                "old_value": emp.get("performance_trend") or "stable",
                "proposed_value": "declining",
                "reason": f"输入中提及 {name} 近期状态下滑",
            })
        if re.search(r"(进步|提升|超预期|表现优秀)", text):
            out.append({
                "employee_id": eid, "field": "performance_trend",
                "old_value": emp.get("performance_trend") or "stable",
                "proposed_value": "rising",
                "reason": f"输入中提及 {name} 近期表现上升",
            })
    return out


def _validate_proposal(item: dict[str, Any], emp: dict[str, Any]) -> dict[str, Any] | None:
    field = item.get("field")
    if not field:
        return None
    if field in ENUM_FIELDS:
        if item.get("proposed_value") not in ENUM_FIELDS[field]:
            return None
        return {**item, "old_value": emp.get(field) or "stable"}
    if field in NUMERIC_FIELDS or field.startswith("skill:"):
        old = emp.get(field) if field in NUMERIC_FIELDS else _skill_level(emp, field.split(":", 1)[1])
        clamped = _clamp(old, item.get("proposed_value"))
        if clamped is None:
            return None
        return {**item, "old_value": old, "proposed_value": clamped}
    return None


def _skill_level(emp: dict[str, Any], tag: str) -> float | None:
    for s in emp.get("skills") or []:
        if s.get("tag") == tag:
            return s.get("level")
    return None


def generate_ability_proposals(
    data: dict[str, Any],
    *,
    trigger: str,
    task_id: str | None,
    input_text: str,
    related_employee_ids: list[str],
) -> list[dict[str, Any]]:
    """生成能力值变更提案，写入 db["ability_update_proposals"]，返回提案列表。

    注意：调用方必须已经处于 db.transaction() 上下文内。
    """
    employees = data.get("employees") or {}
    related: list[dict[str, Any]] = [employees[eid] for eid in related_employee_ids if eid in employees]

    raw_items: list[dict[str, Any]] = []
    summary = ""
    llm = get_llm()
    if llm.enabled and input_text.strip():
        payload = json.dumps(
            {
                "input_text": input_text,
                "related_employees": [
                    {
                        "id": e["id"],
                        "name": e.get("name"),
                        "communication": e.get("communication"),
                        "responsibility": e.get("responsibility"),
                        "growth_rate": e.get("growth_rate"),
                        "performance_trend": e.get("performance_trend"),
                        "skills": e.get("skills"),
                    }
                    for e in related
                ],
            },
            ensure_ascii=False,
        )
        res = llm.chat_json(ABILITY_UPDATE_SYSTEM, payload)
        if res.ok and isinstance(res.data, dict):
            raw_items = res.data.get("updates") or []
            summary = res.data.get("summary") or ""
    if not raw_items:
        raw_items = _heuristic_ability_proposals(input_text, related)
        summary = summary or "（离线模式）基于关键词规则生成"

    proposals_section = data.setdefault("ability_update_proposals", {})
    out: list[dict[str, Any]] = []
    for item in raw_items:
        eid = item.get("employee_id")
        if eid not in employees:
            continue
        validated = _validate_proposal(item, employees[eid])
        if not validated:
            continue
        uid = gen_id("au")
        record = {
            "id": uid,
            "employee_id": eid,
            "field": validated["field"],
            "old_value": validated.get("old_value"),
            "proposed_value": validated.get("proposed_value"),
            "reason": validated.get("reason") or item.get("reason") or "",
            "source": trigger,
            "task_id": task_id,
            "input_text": input_text,
            "summary": summary,
            "status": "pending",
            "created_at": now_iso(),
        }
        proposals_section[uid] = record
        out.append(record)
    return out
