"""字段缺失逐级推断（设计文档 §4.2）。

每条推断结果同时返回：value（推断值，可能为 None）+ source_note（来源说明）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional


@dataclass
class Inferred:
    value: Any
    source: str


# ---- 工具：基于工作范围 / 技能 / 部门均值的推断 ----


_WORK_SCOPE_TO_SKILL = {
    "前端": "前端开发",
    "后端": "后端开发",
    "API": "API 设计",
    "数据库": "数据库优化",
    "架构": "系统架构",
    "测试": "测试",
    "产品": "产品设计",
    "需求": "需求分析",
    "设计": "UI 设计",
    "运维": "运维",
}


def infer_skills(emp: dict[str, Any]) -> Inferred:
    if emp.get("skills"):
        return Inferred(emp["skills"], "档案直接录入")
    scope: list[str] = emp.get("work_scope") or []
    if scope:
        guessed: list[dict[str, Any]] = []
        for item in scope:
            for kw, tag in _WORK_SCOPE_TO_SKILL.items():
                if kw in item:
                    guessed.append({"tag": tag, "level": 3.0})
                    break
        if guessed:
            return Inferred(guessed, "由 work_scope 文本推断（默认等级 3）")
    return Inferred([], "技能与工作范围均缺失")


def infer_mbti(emp: dict[str, Any]) -> Inferred:
    if emp.get("mbti"):
        return Inferred(emp["mbti"], "档案直接录入")
    role = emp.get("role_tendency")
    comm = emp.get("communication")
    if role and comm is not None:
        ie = "I" if comm <= 3 else "E"
        tf = "T" if role in {"leader", "reviewer"} else "F"
        return Inferred(f"{ie}_{tf}_*", "由 role_tendency + communication 行为字段估算")
    return Inferred(None, "MBTI 数据缺失，团队适配性评估时跳过该成员")


def infer_communication(emp: dict[str, Any], dept_avg: Optional[float]) -> Inferred:
    if emp.get("communication") is not None:
        return Inferred(emp["communication"], "档案直接录入")
    if emp.get("correction_log"):
        for log in reversed(emp["correction_log"]):
            if log.get("field") == "communication":
                return Inferred(log.get("new_value"), "由 correction_log 历史记录推断")
    if dept_avg is not None:
        return Inferred(round(dept_avg, 1), "使用部门均值估算")
    return Inferred(None, "无可用估算来源，定性维度仅参考")


def infer_responsibility(emp: dict[str, Any], dept_avg: Optional[float]) -> Inferred:
    if emp.get("responsibility") is not None:
        return Inferred(emp["responsibility"], "档案直接录入")
    if dept_avg is not None:
        return Inferred(round(dept_avg, 1), "使用部门均值估算")
    return Inferred(None, "无可用估算来源")


def calc_dept_average(employees: Iterable[dict[str, Any]], field: str) -> Optional[float]:
    values: list[float] = []
    for emp in employees:
        v = emp.get(field)
        if isinstance(v, (int, float)):
            values.append(float(v))
    if not values:
        return None
    return sum(values) / len(values)


def employee_with_inference(
    emp: dict[str, Any], all_employees: list[dict[str, Any]]
) -> dict[str, Any]:
    """返回员工档案 + inferred_fields 标注，供前端展示推断来源。"""
    same_dept_emps = [
        e
        for e in all_employees
        if set(e.get("departments") or []) & set(emp.get("departments") or [])
        and e.get("id") != emp.get("id")
    ]
    comm_avg = calc_dept_average(same_dept_emps, "communication")
    resp_avg = calc_dept_average(same_dept_emps, "responsibility")

    skills = infer_skills(emp)
    mbti = infer_mbti(emp)
    comm = infer_communication(emp, comm_avg)
    resp = infer_responsibility(emp, resp_avg)

    return {
        **emp,
        "_inferred": {
            "skills": {"value": skills.value, "source": skills.source},
            "mbti": {"value": mbti.value, "source": mbti.source},
            "communication": {"value": comm.value, "source": comm.source},
            "responsibility": {"value": resp.value, "source": resp.source},
        },
    }
