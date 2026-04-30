"""读取项目根目录的 config.json，提供全局只读配置。"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "config.json"


@dataclass
class ServerConfig:
    host: str = "127.0.0.1"
    port: int = 11011


@dataclass
class LLMConfig:
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = "gpt-4o-mini"
    temperature: float = 0.4
    timeout: int = 60

    @property
    def enabled(self) -> bool:
        return bool(self.api_key.strip())


@dataclass
class StorageConfig:
    database_file: str = "database.json"
    backup_dir: str = "backups"
    max_backups: int = 20


@dataclass
class AppSettings:
    server: ServerConfig = field(default_factory=ServerConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    project_root: Path = field(default_factory=lambda: PROJECT_ROOT)

    @property
    def database_path(self) -> Path:
        return self.project_root / self.storage.database_file

    @property
    def backup_path(self) -> Path:
        return self.project_root / self.storage.backup_dir


def _coerce(section_cls, raw: dict[str, Any] | None):
    if not raw:
        return section_cls()
    valid = {f.name for f in section_cls.__dataclass_fields__.values()}
    return section_cls(**{k: v for k, v in raw.items() if k in valid})


def load_settings() -> AppSettings:
    if not CONFIG_PATH.exists():
        return AppSettings()
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"config.json 解析失败: {exc}") from exc

    return AppSettings(
        server=_coerce(ServerConfig, raw.get("server")),
        llm=_coerce(LLMConfig, raw.get("llm")),
        storage=_coerce(StorageConfig, raw.get("storage")),
    )


_settings: AppSettings | None = None


def get_settings() -> AppSettings:
    global _settings
    if _settings is None:
        _settings = load_settings()
        os.makedirs(_settings.backup_path, exist_ok=True)
    return _settings
