"""LLM 客户端封装。

- 走 OpenAI 兼容协议（`openai` SDK），通过 base_url + api_key 配置任意厂商
- 提供 chat() 与 chat_json() 两种调用入口
- api_key 缺失或调用失败时不抛异常，返回 ai_status="degraded" + fallback 占位
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from backend.settings import LLMConfig, get_settings

logger = logging.getLogger("smarterpm.llm")

try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


@dataclass
class LLMResult:
    ok: bool
    content: str
    data: Any = None
    error: str = ""

    @property
    def status(self) -> str:
        return "ok" if self.ok else "degraded"


class LLMClient:
    def __init__(self, cfg: LLMConfig | None = None):
        self.cfg = cfg or get_settings().llm
        self._client = None
        if self.cfg.enabled and OpenAI is not None:
            try:
                self._client = OpenAI(
                    base_url=self.cfg.base_url or None,
                    api_key=self.cfg.api_key,
                    timeout=self.cfg.timeout,
                )
            except Exception as exc:  # pragma: no cover
                logger.warning("初始化 OpenAI 客户端失败：%s", exc)
                self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def chat(self, system: str, user: str, *, temperature: float | None = None) -> LLMResult:
        if not self.enabled:
            return LLMResult(ok=False, content="", error="LLM 未配置 api_key，已降级为离线模式")
        try:
            resp = self._client.chat.completions.create(
                model=self.cfg.model,
                temperature=self.cfg.temperature if temperature is None else temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            content = (resp.choices[0].message.content or "").strip()
            return LLMResult(ok=True, content=content)
        except Exception as exc:  # pragma: no cover
            logger.warning("LLM 调用失败：%s", exc)
            return LLMResult(ok=False, content="", error=str(exc))

    def chat_json(
        self,
        system: str,
        user: str,
        *,
        temperature: float | None = None,
        retries: int = 1,
    ) -> LLMResult:
        if not self.enabled:
            return LLMResult(ok=False, content="", error="LLM 未配置 api_key，已降级为离线模式")
        last_error = ""
        for attempt in range(retries + 1):
            try:
                resp = self._client.chat.completions.create(
                    model=self.cfg.model,
                    temperature=self.cfg.temperature if temperature is None else temperature,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                )
                content = (resp.choices[0].message.content or "").strip()
                data = json.loads(content)
                return LLMResult(ok=True, content=content, data=data)
            except Exception as exc:
                last_error = str(exc)
                logger.warning("LLM JSON 调用失败（第 %d 次）：%s", attempt + 1, exc)
        return LLMResult(ok=False, content="", error=last_error)


_client: LLMClient | None = None


def get_llm() -> LLMClient:
    global _client
    if _client is None:
        _client = LLMClient()
    return _client


def reset_llm_client() -> None:
    """供测试或动态修改配置时重新初始化。"""
    global _client
    _client = None
