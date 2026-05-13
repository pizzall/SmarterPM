"""任务多套方案生成 + 二次修改（需求 4）。"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.core.llm_client import get_llm
from backend.core.prompts import PROPOSAL_MODIFY_SYSTEM, PROPOSAL_NARRATE_SYSTEM
from backend.core.recommender import (
    employees_summary_for_proposal,
    generate_candidate_groups,
)
from backend.core.storage import gen_id, get_db, now_iso
from backend.models.schemas import APIResponse, ProposalModifyIn

router = APIRouter(prefix="/api/tasks", tags=["proposals"])


def _fallback_narrate(group: list[dict[str, Any]], idx: int, summaries: list[dict[str, Any]]) -> dict[str, Any]:
    members_view = []
    for s, m in zip(summaries, group):
        notes = m.get("notes") or []
        reason = (
            f"{s.get('name')}："
            + ("、".join(t["tag"] for t in (s.get("skills") or [])) or "技能数据缺失")
            + (f"；{'；'.join(notes)}" if notes else "")
        )
        members_view.append(
            {
                "employee_id": s["employee_id"],
                "role": s.get("role"),
                "reason": reason,
            }
        )
    titles = ["优先匹配能力", "兼顾跨部门协作", "重视成长潜力"]
    return {
        "id": f"p{idx + 1}",
        "title": titles[idx % len(titles)],
        "members": members_view,
        "team_fit": "（离线模式）团队适配性评语暂以打分汇总：" + ", ".join(
            f"{s['name']}({s.get('mbti', {}).get('value') or 'MBTI 未知'})" for s in summaries
        ),
        "advantages": "核心技能覆盖完整，结构匹配负责人需求",
        "risks": "部分软性维度依赖估算，需结合实际了解",
        "cross_dept_notes": "请确认跨部门成员的协调路径",
    }


@router.post("/{task_id}/proposals/generate")
def generate(task_id: str) -> APIResponse:
    db = get_db()
    snap = db.snapshot()
    task = (snap.get("tasks") or {}).get(task_id)
    if not task:
        raise HTTPException(404, f"任务不存在: {task_id}")

    rec = generate_candidate_groups(snap, task)
    candidate_groups = rec["candidate_groups"]
    if not candidate_groups:
        raise HTTPException(400, "候选搜索域为空，请检查组织结构与任务要求")

    enriched_inputs = []
    for cg in candidate_groups:
        summaries = employees_summary_for_proposal(snap, cg["members"])
        enriched_inputs.append({"id": cg["id"], "members_summary": summaries, "members_raw": cg["members"]})

    llm = get_llm()
    proposals_payload: list[dict[str, Any]] = []
    if llm.enabled:
        prompt_user = json.dumps(
            {
                "task": {
                    "title": task.get("title"),
                    "description": task.get("description"),
                    "required_skills": task.get("required_skills"),
                    "required_roles": task.get("required_roles"),
                    "complexity": task.get("complexity"),
                },
                "candidate_groups": enriched_inputs,
            },
            ensure_ascii=False,
        )
        res = llm.chat_json(PROPOSAL_NARRATE_SYSTEM, prompt_user)
        if res.ok and isinstance(res.data, dict):
            proposals_payload = res.data.get("proposals") or []
    if not proposals_payload:
        proposals_payload = [
            _fallback_narrate(g["members_raw"], i, g["members_summary"])
            for i, g in enumerate(enriched_inputs)
        ]

    with db.transaction() as data:
        task = (data.get("tasks") or {}).get(task_id)
        if not task:
            raise HTTPException(404, f"任务不存在: {task_id}")
        task["proposals"] = []
        for i, p in enumerate(proposals_payload):
            pid = p.get("id") or f"p{i + 1}"
            task["proposals"].append(
                {
                    "id": pid,
                    "version": 1,
                    "title": p.get("title", f"方案 {pid}"),
                    "members": p.get("members", []),
                    "team_fit": p.get("team_fit"),
                    "advantages": p.get("advantages"),
                    "risks": p.get("risks"),
                    "cross_dept_notes": p.get("cross_dept_notes"),
                    "modifications": [],
                    "created_at": now_iso(),
                }
            )
        task["updated_at"] = now_iso()
        return APIResponse(
            ok=True,
            ai_status="ok" if llm.enabled and proposals_payload else "degraded",
            data=task["proposals"],
        )


@router.get("/{task_id}/proposals")
def list_proposals(task_id: str) -> APIResponse:
    db = get_db()
    task = (db.get_section("tasks") or {}).get(task_id)
    if not task:
        raise HTTPException(404, f"任务不存在: {task_id}")
    return APIResponse(ok=True, data=task.get("proposals") or [])


@router.post("/{task_id}/proposals/{pid}/modify")
def modify_proposal(task_id: str, pid: str, body: ProposalModifyIn) -> APIResponse:
    db = get_db()
    snap = db.snapshot()
    task = (snap.get("tasks") or {}).get(task_id)
    if not task:
        raise HTTPException(404, f"任务不存在: {task_id}")
    proposal = next((p for p in task.get("proposals") or [] if p.get("id") == pid), None)
    if not proposal:
        raise HTTPException(404, f"方案不存在: {pid}")

    employees = snap.get("employees") or {}
    llm = get_llm()
    new_proposal: dict[str, Any] = {}
    diff_explanation = ""
    if llm.enabled:
        prompt_user = json.dumps(
            {
                "task": {
                    "title": task.get("title"),
                    "required_skills": task.get("required_skills"),
                    "required_roles": task.get("required_roles"),
                },
                "current_proposal": proposal,
                "instruction": body.instruction,
                "available_employees": [
                    {
                        "id": e["id"],
                        "name": e.get("name"),
                        "departments": e.get("departments"),
                        "skills": e.get("skills"),
                        "role_tendency": e.get("role_tendency"),
                    }
                    for e in employees.values()
                ],
            },
            ensure_ascii=False,
        )
        res = llm.chat_json(PROPOSAL_MODIFY_SYSTEM, prompt_user)
        if res.ok and isinstance(res.data, dict):
            new_proposal = res.data
            diff_explanation = new_proposal.pop("diff_explanation", "")

    if not new_proposal:
        new_proposal = {
            "members": proposal.get("members", []),
            "team_fit": proposal.get("team_fit"),
            "advantages": proposal.get("advantages"),
            "risks": (proposal.get("risks") or "") + f"\n[补充] {body.instruction}",
            "cross_dept_notes": proposal.get("cross_dept_notes"),
        }
        diff_explanation = "（离线模式）已把您的修改意见追加到 risks 字段，未实际重排成员"

    with db.transaction() as data:
        task = (data.get("tasks") or {}).get(task_id)
        if not task:
            raise HTTPException(404, f"任务不存在: {task_id}")
        proposal = next((p for p in task.get("proposals") or [] if p.get("id") == pid), None)
        if not proposal:
            raise HTTPException(404, f"方案不存在: {pid}")
        snapshot_version = {
            "version": proposal.get("version", 1),
            "members": proposal.get("members"),
            "team_fit": proposal.get("team_fit"),
            "advantages": proposal.get("advantages"),
            "risks": proposal.get("risks"),
            "cross_dept_notes": proposal.get("cross_dept_notes"),
            "saved_at": now_iso(),
        }
        proposal.setdefault("modifications", []).append(
            {
                "instruction": body.instruction,
                "diff_explanation": diff_explanation,
                "previous": snapshot_version,
                "ts": now_iso(),
            }
        )
        proposal["version"] = proposal.get("version", 1) + 1
        proposal["members"] = new_proposal.get("members", proposal.get("members"))
        proposal["team_fit"] = new_proposal.get("team_fit", proposal.get("team_fit"))
        proposal["advantages"] = new_proposal.get("advantages", proposal.get("advantages"))
        proposal["risks"] = new_proposal.get("risks", proposal.get("risks"))
        proposal["cross_dept_notes"] = new_proposal.get(
            "cross_dept_notes", proposal.get("cross_dept_notes")
        )
        proposal["updated_at"] = now_iso()
        task["updated_at"] = now_iso()

        from backend.core.ability_updates import generate_ability_proposals
        from backend.api.notifications import push_notification

        ability_proposals = generate_ability_proposals(
            data,
            trigger="proposal_modify",
            task_id=task_id,
            input_text=body.instruction,
            related_employee_ids=[m.get("employee_id") for m in proposal.get("members") or []],
        )
        push_notification(
            data,
            title=f"方案已修改：{task.get('title','')}",
            kind="proposal_modified",
            body=body.instruction[:80] if body.instruction else "",
            link=f"#/tasks/{task_id}/proposals",
            related={"task_id": task_id, "proposal_id": pid},
        )
        if ability_proposals:
            push_notification(
                data,
                title=f"能力值待审 +{len(ability_proposals)}",
                kind="ability_pending",
                body="由方案修改触发，请到「能力值待审」处理",
                link="#/ability-updates",
                related={"task_id": task_id, "count": len(ability_proposals)},
            )

        return APIResponse(
            ok=True,
            data={
                "proposal": proposal,
                "diff_explanation": diff_explanation,
                "ability_proposals": ability_proposals,
            },
        )
