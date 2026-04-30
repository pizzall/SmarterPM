"""单文件 JSON 数据库存储层。

设计要点：
- 启动时一次性把 database.json 全量读入内存（self._data）
- 所有读操作直接走内存，按需 deepcopy
- 写操作在 transaction() 上下文中进行：写前自动备份 + tmp + os.replace 原子覆盖
- 单进程内用 threading.Lock 串行化写
- 提供 export_bytes / import_bytes 便于整库迁移
"""

from __future__ import annotations

import copy
import json
import os
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Iterator

from backend.settings import AppSettings, get_settings


CN_TZ = timezone(timedelta(hours=8))


def now_iso() -> str:
    return datetime.now(CN_TZ).isoformat(timespec="seconds")


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


SCHEMA_VERSION = 1


def _default_db() -> dict[str, Any]:
    """内置示例数据，对应设计文档样例（emp_001/002/003/005、dept_*、task_042、sprint_07）。"""
    ts = now_iso()
    return {
        "meta": {
            "schema_version": SCHEMA_VERSION,
            "created_at": ts,
            "updated_at": ts,
            "app": "SmarterPM",
        },
        "org": {
            "id": "company",
            "name": "公司",
            "head": None,
            "children": [
                {
                    "id": "dept_product",
                    "name": "产品部",
                    "head": "emp_001",
                    "children": [
                        {
                            "id": "dept_design",
                            "name": "设计小组",
                            "head": "emp_003",
                            "children": [],
                        }
                    ],
                },
                {
                    "id": "dept_tech",
                    "name": "技术部",
                    "head": "emp_002",
                    "children": [],
                },
            ],
        },
        "project_groups": [
            {
                "id": "proj_001",
                "name": "跨端重构项目组",
                "head": "emp_002",
                "members": ["emp_001", "emp_005"],
                "status": "active",
            }
        ],
        "employees": {
            "emp_001": {
                "id": "emp_001",
                "name": "陈一",
                "departments": ["dept_product"],
                "role_tendency": "leader",
                "mbti": "ENTJ",
                "skills": [
                    {"tag": "产品设计", "level": 4},
                    {"tag": "需求分析", "level": 4},
                ],
                "work_scope": ["产品规划", "需求评审"],
                "communication": 4,
                "responsibility": 4,
                "growth_rate": 3,
                "performance_trend": "stable",
                "collaboration_notes": [],
                "correction_log": [],
            },
            "emp_002": {
                "id": "emp_002",
                "name": "王五",
                "departments": ["dept_tech"],
                "role_tendency": "leader",
                "mbti": "INTJ",
                "skills": [
                    {"tag": "系统架构", "level": 4},
                    {"tag": "后端开发", "level": 4},
                ],
                "work_scope": ["架构设计", "技术决策"],
                "communication": 3,
                "responsibility": 4,
                "growth_rate": 3,
                "performance_trend": "rising",
                "collaboration_notes": [],
                "correction_log": [],
            },
            "emp_003": {
                "id": "emp_003",
                "name": "李四",
                "departments": ["dept_product", "dept_design"],
                "role_tendency": "executor",
                "mbti": "",
                "skills": [],
                "work_scope": ["前端开发", "UI 实现"],
                "communication": None,
                "responsibility": None,
                "growth_rate": None,
                "performance_trend": "stable",
                "collaboration_notes": [],
                "correction_log": [],
            },
            "emp_005": {
                "id": "emp_005",
                "name": "张三",
                "departments": ["dept_tech", "dept_product"],
                "role_tendency": "executor",
                "mbti": "INTP",
                "skills": [
                    {"tag": "后端开发", "level": 4},
                    {"tag": "系统架构", "level": 3},
                    {"tag": "Python", "level": 5},
                ],
                "work_scope": ["后端服务", "API 设计", "数据库优化"],
                "communication": 3,
                "responsibility": 4,
                "growth_rate": 3,
                "performance_trend": "stable",
                "collaboration_notes": [],
                "correction_log": [],
            },
        },
        "tasks": {
            "task_042": {
                "id": "task_042",
                "title": "用户中心模块重构",
                "description": "将现有用户系统拆分为微服务架构，涉及 API 重设计与数据库迁移",
                "requester": "emp_001",
                "complexity": "epic",
                "required_roles": {"leader": 1, "executor": 3, "reviewer": 1},
                "required_skills": ["系统架构", "后端开发", "数据库优化"],
                "duration_weeks": 4,
                "sprint_id": "sprint_07",
                "status": "draft",
                "created_at": ts,
                "updated_at": ts,
                "proposals": [],
                "review": [],
            }
        },
        "sprints": {
            "sprint_07": {
                "sprint_id": "sprint_07",
                "start_date": "2026-04-28",
                "duration_weeks": 2,
                "tasks": ["task_042"],
            }
        },
        "conversations": {},
        "ability_update_proposals": {},
    }


class Database:
    """单文件 JSON 数据库。"""

    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or get_settings()
        self._lock = threading.RLock()
        self._data: dict[str, Any] = {}
        self._load()

    # ---------- 加载与持久化 ----------

    def _load(self) -> None:
        path = self.settings.database_path
        if not path.exists():
            self._data = _default_db()
            self._write_to_disk(initial=True)
            return
        try:
            text = path.read_text(encoding="utf-8")
            self._data = json.loads(text) if text.strip() else _default_db()
        except Exception as exc:
            raise RuntimeError(f"读取 database.json 失败: {exc}") from exc

        for key, default in _default_db().items():
            if key not in self._data:
                self._data[key] = default

    def _write_to_disk(self, initial: bool = False) -> None:
        path = self.settings.database_path
        path.parent.mkdir(parents=True, exist_ok=True)
        if not initial and path.exists():
            self._make_backup()

        self._data.setdefault("meta", {})["updated_at"] = now_iso()
        self._data["meta"].setdefault("schema_version", SCHEMA_VERSION)
        self._data["meta"].setdefault("created_at", now_iso())
        self._data["meta"]["app"] = "SmarterPM"

        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(tmp, path)

    def _make_backup(self) -> None:
        backup_dir = self.settings.backup_path
        backup_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(CN_TZ).strftime("%Y%m%d-%H%M%S")
        target = backup_dir / f"database-{ts}.json"
        try:
            target.write_bytes(self.settings.database_path.read_bytes())
        except FileNotFoundError:
            return
        backups = sorted(backup_dir.glob("database-*.json"))
        keep = max(1, self.settings.storage.max_backups)
        for old in backups[:-keep]:
            try:
                old.unlink()
            except OSError:
                pass

    # ---------- 事务 ----------

    @contextmanager
    def transaction(self) -> Iterator[dict[str, Any]]:
        """进入事务后对 data 做修改，退出时原子写盘；失败回滚内存。"""
        with self._lock:
            snapshot = copy.deepcopy(self._data)
            try:
                yield self._data
                self._write_to_disk()
            except Exception:
                self._data = snapshot
                raise

    # ---------- 读访问（返回深拷贝，防外部误改） ----------

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._data)

    def get_section(self, key: str) -> Any:
        with self._lock:
            return copy.deepcopy(self._data.get(key))

    def raw(self) -> dict[str, Any]:
        """返回内部引用（仅在 transaction 中使用）。"""
        return self._data

    # ---------- 整库导入导出 ----------

    def export_bytes(self) -> bytes:
        with self._lock:
            return json.dumps(self._data, ensure_ascii=False, indent=2).encode("utf-8")

    def import_bytes(self, raw: bytes) -> None:
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"上传文件不是合法 JSON: {exc}") from exc
        if not isinstance(payload, dict) or "meta" not in payload:
            raise ValueError("上传文件不是合法的 SmarterPM 数据库（缺少 meta 字段）")
        with self._lock:
            self._make_backup()
            merged = _default_db()
            merged.update(payload)
            self._data = merged
            self._write_to_disk()

    def reset_to_default(self) -> None:
        with self._lock:
            self._make_backup()
            self._data = _default_db()
            self._write_to_disk()


_db: Database | None = None


def get_db() -> Database:
    global _db
    if _db is None:
        _db = Database()
    return _db
