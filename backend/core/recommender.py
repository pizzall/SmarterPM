"""推荐引擎：搜索域 + 评分 + 候选组合（设计文档 §3 / §5）。

执行步骤：
  1. expand_scope(): 按任务复杂度逐级展开候选搜索域
  2. filter_by_skills(): 硬性筛选出技能 / 工作范围匹配的候选人
  3. weighted_score(): 多维度加权评分
  4. compose(): 按角色需求挑选 2-3 套差异化组合

最终自然语言讲解（团队适配评语 / 优势 / 风险）由 LLM 完成（proposals.py 中调用）。
"""

from __future__ import annotations

import copy
import itertools
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from backend.core.inference import (
    calc_dept_average,
    employee_with_inference,
    infer_skills,
)


COMPLEXITY_RANGE = {
    "normal": ("dept_only",),
    "advanced": ("dept_only", "parent_dept"),
    "epic": ("dept_only", "parent_dept", "all_company"),
}


@dataclass
class CandidateScore:
    employee: dict[str, Any]
    skill_score: float
    scope_score: float
    soft_score: float
    role_fit: dict[str, float]
    total: float
    notes: list[str]


# ---------- 组织树辅助 ----------


def _flatten_dept_tree(node: dict[str, Any]) -> list[dict[str, Any]]:
    out = [node]
    for child in node.get("children") or []:
        out.extend(_flatten_dept_tree(child))
    return out


def _find_dept(node: dict[str, Any], dept_id: str) -> Optional[dict[str, Any]]:
    if node.get("id") == dept_id:
        return node
    for child in node.get("children") or []:
        found = _find_dept(child, dept_id)
        if found:
            return found
    return None


def _parent_of(node: dict[str, Any], dept_id: str, parent: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
    if node.get("id") == dept_id:
        return parent
    for child in node.get("children") or []:
        found = _parent_of(child, dept_id, node)
        if found:
            return found
    return None


def _dept_employee_ids(employees: dict[str, dict[str, Any]], dept_id: str) -> set[str]:
    return {eid for eid, emp in employees.items() if dept_id in (emp.get("departments") or [])}


# ---------- 搜索域 ----------


def expand_scope(
    org: dict[str, Any],
    employees: dict[str, dict[str, Any]],
    requester_id: Optional[str],
    complexity: str,
) -> list[dict[str, Any]]:
    levels = COMPLEXITY_RANGE.get(complexity, COMPLEXITY_RANGE["normal"])
    if not requester_id or requester_id not in employees:
        return list(employees.values())

    requester = employees[requester_id]
    requester_depts = requester.get("departments") or []
    primary_dept = requester_depts[0] if requester_depts else None

    scope_ids: set[str] = set()

    if "dept_only" in levels and primary_dept:
        node = _find_dept(org, primary_dept)
        if node:
            for sub in _flatten_dept_tree(node):
                scope_ids |= _dept_employee_ids(employees, sub["id"])

    if "parent_dept" in levels and primary_dept:
        parent = _parent_of(org, primary_dept)
        if parent and parent.get("id"):
            for sub in _flatten_dept_tree(parent):
                scope_ids |= _dept_employee_ids(employees, sub["id"])

    if "all_company" in levels:
        scope_ids |= set(employees.keys())

    return [employees[eid] for eid in scope_ids if eid in employees]


# ---------- 评分 ----------


def _skill_score(emp: dict[str, Any], required_skills: list[str]) -> tuple[float, list[str]]:
    if not required_skills:
        return 0.0, []
    skills_inf = infer_skills(emp)
    skills = skills_inf.value or []
    notes: list[str] = []
    if not emp.get("skills") and skills:
        notes.append(skills_inf.source)

    matched = 0.0
    for req in required_skills:
        best = 0.0
        for s in skills:
            if req in s.get("tag", "") or s.get("tag", "") in req:
                best = max(best, float(s.get("level", 0)))
        matched += best
    avg = matched / len(required_skills)
    return min(5.0, avg), notes


def _scope_score(emp: dict[str, Any], required_skills: list[str]) -> float:
    scope = " ".join(emp.get("work_scope") or [])
    if not scope or not required_skills:
        return 0.0
    hits = sum(1 for kw in required_skills if kw in scope)
    return min(5.0, hits / max(1, len(required_skills)) * 5.0)


def _soft_score(
    emp: dict[str, Any],
    dept_comm_avg: Optional[float],
    dept_resp_avg: Optional[float],
) -> tuple[float, list[str]]:
    notes: list[str] = []
    comm = emp.get("communication")
    if comm is None and dept_comm_avg is not None:
        comm = dept_comm_avg
        notes.append(f"沟通能力使用部门均值估算（{round(comm, 1)}）")
    resp = emp.get("responsibility")
    if resp is None and dept_resp_avg is not None:
        resp = dept_resp_avg
        notes.append(f"工作负责度使用部门均值估算（{round(resp, 1)}）")

    growth = emp.get("growth_rate") or 3
    parts = [v for v in (comm, resp, growth) if isinstance(v, (int, float))]
    if not parts:
        return 0.0, notes
    return sum(parts) / len(parts), notes


def _role_fit(emp: dict[str, Any]) -> dict[str, float]:
    tendency = emp.get("role_tendency")
    base = {"leader": 1.0, "executor": 1.0, "reviewer": 1.0}
    if tendency == "leader":
        base["leader"] = 1.5
    elif tendency == "executor":
        base["executor"] = 1.5
    elif tendency == "reviewer":
        base["reviewer"] = 1.5
    return base


def _trend_bonus(emp: dict[str, Any]) -> float:
    return {"rising": 0.3, "stable": 0.0, "declining": -0.3}.get(
        emp.get("performance_trend") or "", 0.0
    )


def score_candidate(
    emp: dict[str, Any],
    required_skills: list[str],
    dept_comm_avg: Optional[float],
    dept_resp_avg: Optional[float],
) -> CandidateScore:
    skill_s, skill_notes = _skill_score(emp, required_skills)
    scope_s = _scope_score(emp, required_skills)
    soft_s, soft_notes = _soft_score(emp, dept_comm_avg, dept_resp_avg)
    role_fit = _role_fit(emp)
    bonus = _trend_bonus(emp)
    total = skill_s * 0.45 + scope_s * 0.2 + soft_s * 0.35 + bonus
    return CandidateScore(
        employee=emp,
        skill_score=round(skill_s, 2),
        scope_score=round(scope_s, 2),
        soft_score=round(soft_s, 2),
        role_fit=role_fit,
        total=round(total, 2),
        notes=skill_notes + soft_notes,
    )


# ---------- 组合 ----------


def _pick_for_role(
    pool: list[CandidateScore],
    role: str,
    needed: int,
    used: set[str],
) -> list[CandidateScore]:
    candidates = [c for c in pool if c.employee["id"] not in used]
    candidates.sort(key=lambda c: c.total * c.role_fit.get(role, 1.0), reverse=True)
    pick = candidates[:needed]
    for c in pick:
        used.add(c.employee["id"])
    return pick


def _diversify(pool: list[CandidateScore], skip: set[str]) -> list[CandidateScore]:
    """生成第二套时排除主要成员，强制走差异化。"""
    return [c for c in pool if c.employee["id"] not in skip]


def build_candidate_groups(
    pool: list[CandidateScore],
    required_roles: dict[str, int],
    *,
    variants: int = 3,
) -> list[list[dict[str, Any]]]:
    """返回 variants 套候选组合，每个成员含角色 + 评分 + 备注。"""
    if not pool:
        return []

    groups: list[list[dict[str, Any]]] = []
    pool_sorted = sorted(pool, key=lambda c: c.total, reverse=True)

    for variant in range(variants):
        used: set[str] = set()
        # 第二、三套尝试避开第一套核心成员
        if groups:
            avoid = {m["employee_id"] for g in groups[: variant] for m in g}
            attempt_pool = _diversify(pool_sorted, avoid)
            if not attempt_pool:
                attempt_pool = pool_sorted
        else:
            attempt_pool = pool_sorted

        members: list[dict[str, Any]] = []
        for role, count in (required_roles or {"executor": 1}).items():
            picks = _pick_for_role(attempt_pool, role, count, used)
            for c in picks:
                members.append(
                    {
                        "employee_id": c.employee["id"],
                        "employee_name": c.employee.get("name", c.employee["id"]),
                        "role": role,
                        "score": c.total,
                        "skill_score": c.skill_score,
                        "scope_score": c.scope_score,
                        "soft_score": c.soft_score,
                        "notes": c.notes,
                    }
                )
        if not members:
            continue
        groups.append(members)
        if len({m["employee_id"] for m in members}) < 1:
            break
    # 去重相同组合
    unique: list[list[dict[str, Any]]] = []
    seen_keys: set[tuple] = set()
    for g in groups:
        key = tuple(sorted(m["employee_id"] for m in g))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique.append(g)
    return unique


# ---------- 顶层入口 ----------


def generate_candidate_groups(db_data: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    org = db_data.get("org") or {}
    employees: dict[str, dict[str, Any]] = db_data.get("employees") or {}
    required_skills = task.get("required_skills") or []
    required_roles = task.get("required_roles") or {"executor": 1}
    complexity = task.get("complexity") or "normal"

    scope = expand_scope(org, employees, task.get("requester"), complexity)
    if not scope:
        scope = list(employees.values())

    primary_dept = None
    requester = employees.get(task.get("requester") or "")
    if requester and requester.get("departments"):
        primary_dept = requester["departments"][0]
    same_dept = [e for e in employees.values() if primary_dept and primary_dept in (e.get("departments") or [])]
    dept_comm_avg = calc_dept_average(same_dept, "communication")
    dept_resp_avg = calc_dept_average(same_dept, "responsibility")

    scored = [score_candidate(e, required_skills, dept_comm_avg, dept_resp_avg) for e in scope]
    scored = [s for s in scored if s.total > 0 or required_skills == []]
    if not scored:
        scored = [score_candidate(e, required_skills, dept_comm_avg, dept_resp_avg) for e in scope]

    groups = build_candidate_groups(scored, required_roles, variants=3)

    candidates_for_llm = []
    for idx, group in enumerate(groups):
        candidates_for_llm.append(
            {
                "id": f"p{idx + 1}",
                "members": group,
            }
        )

    return {
        "scope_size": len(scope),
        "scored_count": len(scored),
        "candidate_groups": candidates_for_llm,
    }


def employees_summary_for_proposal(db_data: dict[str, Any], group: list[dict[str, Any]]) -> list[dict[str, Any]]:
    employees = db_data.get("employees") or {}
    all_list = list(employees.values())
    out = []
    for m in group:
        emp = employees.get(m["employee_id"])
        if not emp:
            continue
        enriched = employee_with_inference(emp, all_list)
        out.append(
            {
                "employee_id": emp["id"],
                "name": emp.get("name"),
                "role": m.get("role"),
                "score": m.get("score"),
                "skills": enriched.get("skills"),
                "departments": enriched.get("departments"),
                "mbti": enriched["_inferred"]["mbti"],
                "communication": enriched["_inferred"]["communication"],
                "responsibility": enriched["_inferred"]["responsibility"],
                "notes": m.get("notes"),
            }
        )
    return out


__all__ = [
    "generate_candidate_groups",
    "employees_summary_for_proposal",
]
