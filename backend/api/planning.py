"""任务规划 + 多轮对话澄清（需求 3）。

流程：start -> refine（可多次） -> finalize
对话历史存于 db["conversations"][cid]，scope="planning"。
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.core.llm_client import get_llm
from backend.core.prompts import TASK_PARSE_SYSTEM, TASK_REFINE_SYSTEM
from backend.core.storage import gen_id, get_db, now_iso
from backend.models.schemas import (
    APIResponse,
    PlanningFinalizeIn,
    PlanningRefineIn,
    PlanningStartIn,
)

router = APIRouter(prefix="/api/planning", tags=["planning"])


# ---------- 离线 fallback：基于规则的简单解析 ----------


_SKILL_HINTS = [
    "前端", "后端", "架构", "数据库", "API", "测试", "运维",
    "产品", "需求", "设计", "Python", "Java", "Go", "DevOps",
]


def _heuristic_parse(description: str) -> dict[str, Any]:
    desc = description.strip()
    title = desc[:15] if len(desc) > 15 else desc
    if not title:
        title = "未命名任务"
    skills = [s for s in _SKILL_HINTS if s.lower() in desc.lower()]
    if "重构" in desc or "迁移" in desc or "全公司" in desc:
        complexity = "epic"
    elif "跨" in desc or "联合" in desc or len(skills) >= 3:
        complexity = "advanced"
    else:
        complexity = "normal"
    return {
        "title": title,
        "description": desc or "（无描述）",
        "required_skills": skills,
        "required_roles": {"leader": 1, "executor": 2, "reviewer": 1}
        if complexity == "epic"
        else {"leader": 1, "executor": 1, "reviewer": 0},
        "complexity": complexity,
        "duration_weeks": 4 if complexity == "epic" else 2,
        "clarifying_questions": [
            "希望多长时间内交付？",
            "是否有明确的负责人或必须包含的成员？",
        ],
    }


def _new_conversation(scope: str, description: str) -> str:
    db = get_db()
    cid = gen_id("conv")
    with db.transaction() as data:
        convs = data.setdefault("conversations", {})
        convs[cid] = {
            "id": cid,
            "scope": scope,
            "created_at": now_iso(),
            "messages": [{"role": "user", "content": description, "ts": now_iso()}],
            "draft": {},
        }
    return cid


def _append_message(cid: str, role: str, content: str) -> None:
    db = get_db()
    with db.transaction() as data:
        conv = (data.get("conversations") or {}).get(cid)
        if not conv:
            raise HTTPException(404, f"会话不存在: {cid}")
        conv.setdefault("messages", []).append({"role": role, "content": content, "ts": now_iso()})


def _set_draft(cid: str, draft: dict[str, Any]) -> None:
    db = get_db()
    with db.transaction() as data:
        conv = (data.get("conversations") or {}).get(cid)
        if not conv:
            raise HTTPException(404, f"会话不存在: {cid}")
        conv["draft"] = draft


# ---------- API ----------


@router.post("/start")
def start_planning(body: PlanningStartIn) -> APIResponse:
    if not body.description.strip():
        raise HTTPException(400, "任务描述不能为空")
    cid = _new_conversation("planning", body.description)

    llm = get_llm()
    res = llm.chat_json(TASK_PARSE_SYSTEM, body.description) if llm.enabled else None

    if res and res.ok and isinstance(res.data, dict):
        draft = res.data
        ai_status = "ok"
    else:
        draft = _heuristic_parse(body.description)
        ai_status = "degraded"
    if body.requester:
        draft["requester"] = body.requester

    _set_draft(cid, draft)
    _append_message(cid, "assistant", "（已生成任务草稿）")

    return APIResponse(
        ok=True,
        ai_status=ai_status,
        data={"conversation_id": cid, "draft": draft},
    )


@router.post("/{cid}/refine")
def refine(cid: str, body: PlanningRefineIn) -> APIResponse:
    db = get_db()
    conv = (db.get_section("conversations") or {}).get(cid)
    if not conv:
        raise HTTPException(404, f"会话不存在: {cid}")

    _append_message(cid, "user", body.user_message)
    history = conv.get("messages", []) + [{"role": "user", "content": body.user_message}]
    user_payload = {
        "current_draft": conv.get("draft") or {},
        "history": [{"role": m["role"], "content": m["content"]} for m in history],
    }

    llm = get_llm()
    res = llm.chat_json(TASK_REFINE_SYSTEM, str(user_payload)) if llm.enabled else None

    if res and res.ok and isinstance(res.data, dict):
        new_draft = {k: v for k, v in res.data.items() if k != "reply"}
        reply = res.data.get("reply") or "已根据您的反馈更新草稿"
        ai_status = "ok"
    else:
        new_draft = dict(conv.get("draft") or {})
        merged_desc = f"{new_draft.get('description', '')}\n[补充] {body.user_message}".strip()
        new_draft["description"] = merged_desc
        new_draft.update(_heuristic_parse(merged_desc))
        reply = "（离线模式）已把您的补充并入描述并重新启发式解析。"
        ai_status = "degraded"

    _set_draft(cid, new_draft)
    _append_message(cid, "assistant", reply)

    return APIResponse(
        ok=True,
        ai_status=ai_status,
        data={"conversation_id": cid, "draft": new_draft, "reply": reply},
    )


@router.post("/{cid}/finalize")
def finalize(cid: str, body: PlanningFinalizeIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        conv = (data.get("conversations") or {}).get(cid)
        if not conv:
            raise HTTPException(404, f"会话不存在: {cid}")
        draft = conv.get("draft") or {}
        if not draft:
            raise HTTPException(400, "尚未生成任务草稿")

        new_id = gen_id("task")
        task = {
            "id": new_id,
            "title": (body.title or draft.get("title") or "未命名任务")[:30],
            "description": draft.get("description") or "",
            "requester": draft.get("requester"),
            "complexity": draft.get("complexity") or "normal",
            "required_roles": draft.get("required_roles") or {"executor": 1},
            "required_skills": draft.get("required_skills") or [],
            "duration_weeks": int(draft.get("duration_weeks") or 1),
            "sprint_id": body.sprint_id or draft.get("sprint_id"),
            "status": "draft",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "from_conversation": cid,
            "proposals": [],
            "review": [],
        }
        data.setdefault("tasks", {})[new_id] = task
        return APIResponse(ok=True, data=task, message="任务已 finalize")


@router.get("/{cid}")
def get_conversation(cid: str) -> APIResponse:
    db = get_db()
    conv = (db.get_section("conversations") or {}).get(cid)
    if not conv:
        raise HTTPException(404, f"会话不存在: {cid}")
    return APIResponse(ok=True, data=conv)
