"""自由对话（需求 8）。

默认只读：AI 可读取数据快照后回答 / 提建议。任何写操作必须由用户在 UI 二次确认后调对应业务接口。
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.core.llm_client import get_llm
from backend.core.prompts import FREE_CHAT_SYSTEM
from backend.core.storage import gen_id, get_db, now_iso
from backend.models.schemas import APIResponse, ChatIn

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _data_snapshot_summary(data: dict[str, Any]) -> dict[str, Any]:
    employees = data.get("employees") or {}
    tasks = data.get("tasks") or {}
    return {
        "org": data.get("org"),
        "project_groups": data.get("project_groups"),
        "employees_brief": [
            {
                "id": e["id"],
                "name": e.get("name"),
                "departments": e.get("departments"),
                "role_tendency": e.get("role_tendency"),
                "skills": e.get("skills"),
                "performance_trend": e.get("performance_trend"),
            }
            for e in employees.values()
        ],
        "tasks_brief": [
            {
                "id": t["id"],
                "title": t.get("title"),
                "complexity": t.get("complexity"),
                "status": t.get("status"),
                "required_skills": t.get("required_skills"),
                "proposal_count": len(t.get("proposals") or []),
            }
            for t in tasks.values()
        ],
    }


@router.post("")
def chat(body: ChatIn) -> APIResponse:
    db = get_db()
    cid = None if body.new_conversation else body.conversation_id
    with db.transaction() as data:
        convs = data.setdefault("conversations", {})
        if not cid or cid not in convs:
            cid = gen_id("chat")
            convs[cid] = {
                "id": cid,
                "scope": "free_chat",
                "created_at": now_iso(),
                "updated_at": now_iso(),
                "messages": [],
            }
        convs[cid]["messages"].append(
            {"role": "user", "content": body.user_message, "ts": now_iso()}
        )
        convs[cid]["updated_at"] = now_iso()
        history = convs[cid]["messages"][-20:]

    snap = db.snapshot()
    summary = _data_snapshot_summary(snap)

    llm = get_llm()
    reply_text = ""
    suggested_actions: list[dict[str, Any]] = []
    ai_status = "degraded"
    if llm.enabled:
        prompt_user = json.dumps(
            {
                "snapshot": summary,
                "history": [{"role": m["role"], "content": m["content"]} for m in history],
                "current_input": body.user_message,
            },
            ensure_ascii=False,
        )
        res = llm.chat_json(FREE_CHAT_SYSTEM, prompt_user)
        if res.ok and isinstance(res.data, dict):
            reply_text = res.data.get("reply") or ""
            suggested_actions = res.data.get("suggested_actions") or []
            ai_status = "ok"

    if not reply_text:
        emp_count = len(summary["employees_brief"])
        task_count = len(summary["tasks_brief"])
        reply_text = (
            "（离线模式）已收到您的输入，但当前未配置 LLM。\n"
            f"- 现有员工 {emp_count} 人，任务 {task_count} 项\n"
            "- 您可以在 `config.json` 中配置 `llm.api_key` 后重启以获得智能回复。"
        )

    with db.transaction() as data:
        conv = (data.get("conversations") or {}).get(cid)
        if conv is not None:
            conv["messages"].append(
                {"role": "assistant", "content": reply_text, "ts": now_iso()}
            )
            conv["updated_at"] = now_iso()

    return APIResponse(
        ok=True,
        ai_status=ai_status,
        data={
            "conversation_id": cid,
            "reply": reply_text,
            "suggested_actions": suggested_actions,
        },
    )


@router.get("/conversations")
def list_chat_conversations() -> APIResponse:
    """列出所有 free_chat 会话，按 updated_at（或 created_at）倒序。"""
    db = get_db()
    convs = db.get_section("conversations") or {}
    items: list[dict[str, Any]] = []
    for conv in convs.values():
        if conv.get("scope") != "free_chat":
            continue
        messages = conv.get("messages") or []
        preview = ""
        for m in messages:
            if m.get("role") == "user":
                text = (m.get("content") or "").strip().replace("\n", " ")
                preview = text[:30] + ("…" if len(text) > 30 else "")
                break
        items.append(
            {
                "id": conv.get("id"),
                "created_at": conv.get("created_at"),
                "updated_at": conv.get("updated_at") or conv.get("created_at"),
                "message_count": len(messages),
                "preview": preview,
            }
        )
    items.sort(key=lambda x: (x.get("updated_at") or x.get("created_at") or ""), reverse=True)
    return APIResponse(ok=True, data=items)


@router.get("/conversations/{cid}")
def get_chat(cid: str) -> APIResponse:
    db = get_db()
    conv = (db.get_section("conversations") or {}).get(cid)
    if not conv:
        return APIResponse(ok=False, data=None, message="会话不存在")
    return APIResponse(ok=True, data=conv)


@router.delete("/conversations/{cid}")
def delete_chat_conversation(cid: str) -> APIResponse:
    """删除整个 free_chat 会话。"""
    db = get_db()
    with db.transaction() as data:
        convs = data.get("conversations") or {}
        conv = convs.get(cid)
        if not conv:
            raise HTTPException(status_code=404, detail="会话不存在")
        if conv.get("scope") != "free_chat":
            raise HTTPException(status_code=400, detail="仅支持删除 free_chat 会话")
        convs.pop(cid, None)
    return APIResponse(ok=True, data={"id": cid}, message="会话已删除")


@router.delete("/conversations/{cid}/messages/{idx}")
def delete_chat_message(cid: str, idx: int) -> APIResponse:
    """删除会话中第 idx 条消息（0-based）。"""
    db = get_db()
    with db.transaction() as data:
        convs = data.get("conversations") or {}
        conv = convs.get(cid)
        if not conv:
            raise HTTPException(status_code=404, detail="会话不存在")
        if conv.get("scope") != "free_chat":
            raise HTTPException(status_code=400, detail="仅支持操作 free_chat 会话")
        messages = conv.get("messages") or []
        if idx < 0 or idx >= len(messages):
            raise HTTPException(status_code=404, detail="消息下标越界")
        removed = messages.pop(idx)
        conv["messages"] = messages
        conv["updated_at"] = now_iso()
    return APIResponse(ok=True, data={"id": cid, "removed_index": idx, "removed": removed}, message="消息已删除")
