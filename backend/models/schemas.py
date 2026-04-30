"""Pydantic schema 定义（与 database.json 顶层结构对齐）。

所有 schema 都允许字段缺失（可选字段），以匹配设计文档 §4 的"冷启动 / 字段缺失推断"原则。
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------- 通用响应 ----------


class APIResponse(BaseModel):
    ok: bool = True
    data: Any = None
    message: str = ""
    ai_status: Literal["ok", "degraded", "n/a"] = "n/a"


# ---------- 组织结构 ----------


class DeptIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    name: str
    head: Optional[str] = None
    parent_id: Optional[str] = None
    children: list[dict[str, Any]] = Field(default_factory=list)


class ProjectGroupIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    name: str
    head: Optional[str] = None
    members: list[str] = Field(default_factory=list)
    status: str = "active"


# ---------- 人员 ----------


class SkillItem(BaseModel):
    tag: str
    level: float = 0.0


class EmployeeIn(BaseModel):
    """员工写入模型，仅 name + departments 必填。"""

    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    name: str
    departments: list[str]
    role_tendency: Optional[Literal["leader", "executor", "reviewer"]] = None
    mbti: Optional[str] = None
    skills: list[SkillItem] = Field(default_factory=list)
    work_scope: list[str] = Field(default_factory=list)
    communication: Optional[float] = None
    responsibility: Optional[float] = None
    growth_rate: Optional[float] = None
    performance_trend: Optional[Literal["rising", "stable", "declining"]] = None
    collaboration_notes: list[str] = Field(default_factory=list)


# ---------- 任务 ----------


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    title: str
    description: str = ""
    requester: Optional[str] = None
    complexity: Literal["normal", "advanced", "epic"] = "normal"
    required_roles: dict[str, int] = Field(default_factory=dict)
    required_skills: list[str] = Field(default_factory=list)
    duration_weeks: int = 1
    sprint_id: Optional[str] = None
    status: Literal["draft", "active", "done", "archived"] = "draft"


# ---------- 任务规划对话 ----------


class PlanningStartIn(BaseModel):
    description: str
    requester: Optional[str] = None


class PlanningRefineIn(BaseModel):
    user_message: str


class PlanningFinalizeIn(BaseModel):
    title: Optional[str] = None
    sprint_id: Optional[str] = None


# ---------- 方案 ----------


class ProposalModifyIn(BaseModel):
    instruction: str


# ---------- 回顾评价 ----------


class ReviewIn(BaseModel):
    content: str
    author: Optional[str] = None
    mood: Optional[Literal["positive", "neutral", "negative"]] = "neutral"


# ---------- 能力值变更 ----------


class AbilityUpdatePatchIn(BaseModel):
    proposed_value: Any
    reason: Optional[str] = None


# ---------- 自由对话 ----------


class ChatIn(BaseModel):
    user_message: str
    conversation_id: Optional[str] = None
