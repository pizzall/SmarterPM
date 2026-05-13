"""元数据 API：枚举定义、技能 / 工作范围库（UX 改进 §4 / §5 配套）。

前端用 `/api/enums` 把 ENUM 字段渲染成下拉，`/api/libraries` 渲染为多选标签。
所有数据均从内存 / 现有 schema 聚合，不引入新的存储结构。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from backend.core.storage import get_db
from backend.models.schemas import APIResponse

router = APIRouter(prefix="/api", tags=["meta"])


# ---------- ENUM 定义 ----------

ENUM_DEFINITIONS: dict[str, list[dict[str, str]]] = {
    "role_tendency": [
        {"value": "leader", "label": "领导者", "desc": "主导任务方向，把控质量"},
        {"value": "executor", "label": "执行者", "desc": "完成具体工作"},
        {"value": "reviewer", "label": "评审者", "desc": "审核输出质量"},
    ],
    "performance_trend": [
        {"value": "rising", "label": "上升", "desc": "近期表现持续向好"},
        {"value": "stable", "label": "稳定", "desc": "表现持平"},
        {"value": "declining", "label": "下降", "desc": "近期表现下滑，需要关注"},
    ],
    "complexity": [
        {"value": "normal", "label": "普通", "desc": "单部门可完成"},
        {"value": "advanced", "label": "高级", "desc": "跨部门协作的复杂任务"},
        {"value": "epic", "label": "史诗", "desc": "全公司级别的大型任务"},
    ],
    "task_status": [
        {"value": "draft", "label": "草稿", "desc": "尚未启动"},
        {"value": "active", "label": "进行中", "desc": "已立项执行"},
        {"value": "done", "label": "已完成", "desc": "已交付"},
        {"value": "archived", "label": "归档", "desc": "封存归档"},
    ],
    "mood": [
        {"value": "positive", "label": "积极", "desc": "正向反馈"},
        {"value": "neutral", "label": "中性", "desc": "客观陈述"},
        {"value": "negative", "label": "消极", "desc": "存在不满或风险"},
    ],
    "project_group_status": [
        {"value": "active", "label": "活跃", "desc": "项目组当前运行中"},
        {"value": "inactive", "label": "停用", "desc": "项目组已暂停或解散"},
    ],
    "priority": [
        {"value": "low", "label": "低", "desc": "可延后处理"},
        {"value": "normal", "label": "普通", "desc": "按计划处理"},
        {"value": "high", "label": "高", "desc": "需要优先排期"},
        {"value": "urgent", "label": "紧急", "desc": "需立即处理"},
    ],
    "mbti": [
        {"value": "INTJ", "label": "INTJ · 建筑师", "desc": "想象力丰富的战略家，凡事皆有计划"},
        {"value": "INTP", "label": "INTP · 逻辑学家", "desc": "充满创新精神的发明家，对知识有不可遏制的渴望"},
        {"value": "ENTJ", "label": "ENTJ · 指挥官", "desc": "大胆有想象力的强势领导者，总能找到办法"},
        {"value": "ENTP", "label": "ENTP · 辩论家", "desc": "聪明好奇的思考者，不会拒绝智力上的挑战"},
        {"value": "INFJ", "label": "INFJ · 提倡者", "desc": "安静而神秘，鼓舞人心的不知疲倦的理想主义者"},
        {"value": "INFP", "label": "INFP · 调停者", "desc": "诗意、善良的利他主义者，热心地为正义而战"},
        {"value": "ENFJ", "label": "ENFJ · 主人公", "desc": "富有魅力鼓舞人心的领导者，可以使听众陶醉"},
        {"value": "ENFP", "label": "ENFP · 探险家", "desc": "热情有创造力爱社交的自由灵魂，总能找到笑容的理由"},
        {"value": "ISTJ", "label": "ISTJ · 物流师", "desc": "实际的事实导向者，可靠性不容置疑"},
        {"value": "ISFJ", "label": "ISFJ · 守卫者", "desc": "非常专注热情的保护者，时刻准备保护爱着的人"},
        {"value": "ESTJ", "label": "ESTJ · 总经理", "desc": "出色的管理者，在管理事情或人方面无与伦比"},
        {"value": "ESFJ", "label": "ESFJ · 执政官", "desc": "极有同情心受欢迎社群里乐于助人的人，总热心提供帮助"},
        {"value": "ISTP", "label": "ISTP · 鉴赏家", "desc": "大胆而实际的实验家，擅长使用各种工具"},
        {"value": "ISFP", "label": "ISFP · 探险家", "desc": "灵活有魅力的艺术家，时刻准备探索发现新的可能性"},
        {"value": "ESTP", "label": "ESTP · 企业家", "desc": "聪明精力充沛善于感知的人，真心享受生活在边缘"},
        {"value": "ESFP", "label": "ESFP · 表演者", "desc": "自发的精力充沛而热情的表演者，生活在他们周围永无聊"},
    ],
    "ability_status": [
        {"value": "pending", "label": "待审", "desc": "等待 PM 审核"},
        {"value": "edited", "label": "已修改", "desc": "PM 微调过建议值"},
        {"value": "applied", "label": "已应用", "desc": "已写入员工档案"},
        {"value": "rejected", "label": "已拒绝", "desc": "PM 不认可该建议"},
    ],
}


ROLE_DEFINITIONS = [
    {"value": "leader", "label": "Leader（领导者）", "desc": "主导任务方向，把控质量"},
    {"value": "executor", "label": "Executor（执行者）", "desc": "完成具体工作"},
    {"value": "reviewer", "label": "Reviewer（评审者）", "desc": "审核输出质量"},
]


ABILITY_LEVEL_LABELS = ["很差", "较差", "一般", "不错", "很好"]


@router.get("/enums")
def get_enums() -> APIResponse:
    """返回所有枚举字段的可选值 + 中文标签 + 说明。"""

    return APIResponse(
        ok=True,
        data={
            **ENUM_DEFINITIONS,
            "ability_level_labels": ABILITY_LEVEL_LABELS,
        },
    )


@router.get("/libraries")
def get_libraries() -> APIResponse:
    """聚合 skill_library / scope_library / role_definitions / 员工 / 部门 / sprint 索引。

    - skill_library: 员工技能标签 ∪ 任务 required_skills，按出现次数倒序
    - scope_library: 员工工作范围去重
    - role_definitions: Leader / Executor / Reviewer 中文释义
    - employees: id → {id,name,departments,top_skill}
    - departments: 扁平化 [{id,name,path}]
    - sprints: [{id,start_date,duration_weeks}]
    """

    db = get_db()
    employees: dict[str, Any] = db.get_section("employees") or {}
    tasks: dict[str, Any] = db.get_section("tasks") or {}
    org: dict[str, Any] = db.get_section("org") or {}
    sprints: dict[str, Any] = db.get_section("sprints") or {}

    skill_counter: dict[str, int] = {}
    for emp in employees.values():
        for sk in emp.get("skills") or []:
            tag = sk.get("tag")
            if tag:
                skill_counter[tag] = skill_counter.get(tag, 0) + 1
    for task in tasks.values():
        for tag in task.get("required_skills") or []:
            if tag:
                skill_counter[tag] = skill_counter.get(tag, 0) + 1
    skill_library = [
        {"tag": tag, "count": count}
        for tag, count in sorted(
            skill_counter.items(), key=lambda kv: (-kv[1], kv[0])
        )
    ]

    scope_set: set[str] = set()
    for emp in employees.values():
        for s in emp.get("work_scope") or []:
            if s:
                scope_set.add(s)
    scope_library = sorted(scope_set)

    emp_index = []
    for emp in employees.values():
        top_skill = None
        for sk in sorted(
            emp.get("skills") or [], key=lambda s: -float(s.get("level") or 0)
        ):
            top_skill = f"{sk.get('tag')} Lv{sk.get('level')}"
            break
        emp_index.append(
            {
                "id": emp.get("id"),
                "name": emp.get("name") or emp.get("id"),
                "departments": emp.get("departments") or [],
                "role_tendency": emp.get("role_tendency"),
                "top_skill": top_skill,
            }
        )
    emp_index.sort(key=lambda e: e.get("id") or "")

    departments: list[dict[str, Any]] = []

    def _walk(node: dict[str, Any], path: list[str]):
        if not node:
            return
        cur_path = path + [node.get("name") or ""]
        if node.get("id") and node.get("id") != "company":
            departments.append(
                {
                    "id": node["id"],
                    "name": node.get("name"),
                    "path": " / ".join([p for p in cur_path if p]),
                }
            )
        for c in node.get("children") or []:
            _walk(c, cur_path)

    _walk(org, [])

    sprint_index = []
    for sp in sprints.values():
        sprint_index.append(
            {
                "id": sp.get("sprint_id") or sp.get("id"),
                "start_date": sp.get("start_date"),
                "duration_weeks": sp.get("duration_weeks"),
            }
        )
    sprint_index.sort(key=lambda s: s.get("start_date") or "", reverse=True)

    return APIResponse(
        ok=True,
        data={
            "skill_library": skill_library,
            "scope_library": scope_library,
            "role_definitions": ROLE_DEFINITIONS,
            "ability_level_labels": ABILITY_LEVEL_LABELS,
            "employees": emp_index,
            "departments": departments,
            "sprints": sprint_index,
        },
    )
