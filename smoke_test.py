"""一次性烟雾测试脚本：
1. import 应用
2. 用 FastAPI TestClient 走主要业务链路
3. 完成后保留 database.json 与 backups（可立刻 python -m backend.main 启动）
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from backend.main import app


def banner(text: str) -> None:
    print("\n" + "=" * 8, text, "=" * 8)


def main() -> int:
    client = TestClient(app)

    banner("/api/health")
    r = client.get("/api/health")
    print(r.status_code, r.json())

    banner("/api/org")
    r = client.get("/api/org")
    org_data = r.json()["data"]
    print("departments:", [c["id"] for c in org_data["org"]["children"]])
    print("employees:", list(org_data["employees"].keys()))

    banner("create dept + employee")
    r = client.post("/api/org/dept", json={"name": "QA 小组", "parent_id": "dept_tech"})
    print("create dept:", r.status_code, r.json()["data"]["id"])
    r = client.post(
        "/api/org/employees",
        json={"name": "钱七", "departments": ["dept_tech"], "skills": [{"tag": "测试", "level": 4}]},
    )
    new_emp_id = r.json()["data"]["id"]
    print("create employee:", new_emp_id)

    banner("/api/employees")
    r = client.get("/api/employees")
    print("count:", len(r.json()["data"]))
    sample = r.json()["data"][0]
    print("sample inferred fields:", list((sample.get("_inferred") or {}).keys()))

    banner("planning start -> refine -> finalize")
    r = client.post("/api/planning/start", json={"description": "把订单系统拆分为独立微服务，涉及后端、数据库、API 重构", "requester": "emp_002"})
    payload = r.json()["data"]
    cid = payload["conversation_id"]
    print("draft skills:", payload["draft"].get("required_skills"))

    r = client.post(f"/api/planning/{cid}/refine", json={"user_message": "希望 6 周内完成，需要 1 个 leader"})
    print("refine ok:", r.status_code)

    r = client.post(f"/api/planning/{cid}/finalize", json={})
    new_task = r.json()["data"]
    task_id = new_task["id"]
    print("task created:", task_id, new_task["title"])

    banner("proposals generate")
    r = client.post(f"/api/tasks/{task_id}/proposals/generate")
    proposals = r.json()["data"]
    print("proposals count:", len(proposals))
    if proposals:
        print("first proposal members:", [m["employee_id"] for m in proposals[0]["members"]])

    if proposals:
        banner("proposal modify")
        r = client.post(
            f"/api/tasks/{task_id}/proposals/{proposals[0]['id']}/modify",
            json={"instruction": f"把 {proposals[0]['members'][0]['employee_id']} 沟通能力调高，他在沟通超预期"},
        )
        print("modify ok:", r.status_code, "ability proposals:", len(r.json()["data"]["ability_proposals"]))

    banner("review")
    r = client.post(
        f"/api/tasks/{task_id}/review",
        json={"content": "项目整体推进顺利，emp_005 沟通超预期，emp_002 责任心很好", "author": "emp_002", "mood": "positive"},
    )
    print("review ok:", r.status_code, "ability proposals:", len(r.json()["data"]["ability_proposals"]))

    banner("ability-updates listing")
    r = client.get("/api/ability-updates")
    items = r.json()["data"]
    print("total proposals:", len(items))
    if items:
        target = items[0]
        print("first proposal:", target["employee_id"], target["field"], target["old_value"], "->", target["proposed_value"])
        r = client.post(f"/api/ability-updates/{target['id']}/apply")
        print("apply ok:", r.status_code, r.json()["message"])

    banner("free chat (offline mode)")
    r = client.post("/api/chat", json={"user_message": "现在公司一共有几个员工？"})
    print("chat status:", r.status_code, "ai_status:", r.json()["ai_status"])
    print("reply preview:", r.json()["data"]["reply"][:80])

    banner("database export / reset")
    r = client.get("/api/database/export")
    print("export bytes:", len(r.content))
    db_path = ROOT / "database.json"
    print("database.json exists:", db_path.exists(), "size:", db_path.stat().st_size if db_path.exists() else 0)

    backup_dir = ROOT / "backups"
    if backup_dir.exists():
        print("backups:", [p.name for p in sorted(backup_dir.glob("database-*.json"))][-3:])

    print("\nALL OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
