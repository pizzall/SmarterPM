"""部门 / 项目组 / 员工 增删改查（需求 1）。

支持两种通道：表单按钮（PUT/POST/DELETE 单实体），与 JSON 整体导入（覆盖式）。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from backend.core.storage import gen_id, get_db
from backend.models.schemas import APIResponse, DeptIn, EmployeeIn, ProjectGroupIn

router = APIRouter(prefix="/api/org", tags=["org"])


# ---------- 部门工具 ----------


def _walk(node: dict[str, Any]):
    yield node
    for child in node.get("children") or []:
        yield from _walk(child)


def _find_node_with_parent(root: dict[str, Any], dept_id: str, parent: dict[str, Any] | None = None):
    if root.get("id") == dept_id:
        return root, parent
    for child in root.get("children") or []:
        found, p = _find_node_with_parent(child, dept_id, root)
        if found:
            return found, p
    return None, None


# ---------- 整体读取 ----------


@router.get("")
def get_org() -> APIResponse:
    db = get_db()
    return APIResponse(
        ok=True,
        data={
            "org": db.get_section("org"),
            "project_groups": db.get_section("project_groups"),
            "employees": db.get_section("employees"),
        },
    )


@router.get("/tree")
def get_tree() -> APIResponse:
    db = get_db()
    return APIResponse(ok=True, data=db.get_section("org"))


# ---------- 部门 CRUD ----------


@router.post("/dept")
def create_dept(body: DeptIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        org = data.setdefault("org", {"id": "company", "name": "公司", "children": []})
        parent_id = body.parent_id or org["id"]
        parent, _ = _find_node_with_parent(org, parent_id)
        if not parent:
            raise HTTPException(404, f"父部门不存在: {parent_id}")
        new_id = body.id or gen_id("dept")
        if any(n.get("id") == new_id for n in _walk(org)):
            raise HTTPException(409, f"部门 id 已存在: {new_id}")
        node = {
            "id": new_id,
            "name": body.name,
            "head": body.head,
            "children": list(body.children or []),
        }
        parent.setdefault("children", []).append(node)
        return APIResponse(ok=True, data=node, message="部门已创建")


@router.put("/dept/{dept_id}")
def update_dept(dept_id: str, body: DeptIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        org = data.get("org") or {}
        node, _ = _find_node_with_parent(org, dept_id)
        if not node:
            raise HTTPException(404, f"部门不存在: {dept_id}")
        node["name"] = body.name
        if body.head is not None:
            node["head"] = body.head
        return APIResponse(ok=True, data=node, message="部门已更新")


@router.delete("/dept/{dept_id}")
def delete_dept(dept_id: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        org = data.get("org") or {}
        if org.get("id") == dept_id:
            raise HTTPException(400, "不能删除根节点")
        _, parent = _find_node_with_parent(org, dept_id)
        if not parent:
            raise HTTPException(404, f"部门不存在: {dept_id}")
        parent["children"] = [c for c in (parent.get("children") or []) if c.get("id") != dept_id]
        return APIResponse(ok=True, message="部门已删除")


# ---------- 员工 CRUD ----------


@router.get("/employees")
def list_employees() -> APIResponse:
    db = get_db()
    return APIResponse(ok=True, data=list((db.get_section("employees") or {}).values()))


@router.post("/employees")
def create_employee(body: EmployeeIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        emps = data.setdefault("employees", {})
        new_id = body.id or gen_id("emp")
        if new_id in emps:
            raise HTTPException(409, f"员工 id 已存在: {new_id}")
        emp = body.model_dump()
        emp["id"] = new_id
        emp.setdefault("correction_log", [])
        emp.setdefault("collaboration_notes", [])
        emps[new_id] = emp
        return APIResponse(ok=True, data=emp, message="员工已创建")


@router.put("/employees/{emp_id}")
def update_employee(emp_id: str, body: EmployeeIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        emps = data.get("employees") or {}
        if emp_id not in emps:
            raise HTTPException(404, f"员工不存在: {emp_id}")
        emp = emps[emp_id]
        new_data = body.model_dump()
        new_data["id"] = emp_id
        new_data.setdefault("correction_log", emp.get("correction_log", []))
        new_data.setdefault("collaboration_notes", emp.get("collaboration_notes", []))
        emps[emp_id] = new_data
        return APIResponse(ok=True, data=new_data, message="员工已更新")


@router.delete("/employees/{emp_id}")
def delete_employee(emp_id: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        emps = data.get("employees") or {}
        if emp_id not in emps:
            raise HTTPException(404, f"员工不存在: {emp_id}")
        del emps[emp_id]
        return APIResponse(ok=True, message="员工已删除")


# ---------- 项目组 CRUD ----------


@router.post("/project-groups")
def create_project_group(body: ProjectGroupIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        groups: list[dict[str, Any]] = data.setdefault("project_groups", [])
        new_id = body.id or gen_id("proj")
        if any(g.get("id") == new_id for g in groups):
            raise HTTPException(409, f"项目组 id 已存在: {new_id}")
        item = body.model_dump()
        item["id"] = new_id
        groups.append(item)
        return APIResponse(ok=True, data=item, message="项目组已创建")


@router.put("/project-groups/{pid}")
def update_project_group(pid: str, body: ProjectGroupIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        groups: list[dict[str, Any]] = data.get("project_groups") or []
        for i, g in enumerate(groups):
            if g.get("id") == pid:
                merged = body.model_dump()
                merged["id"] = pid
                groups[i] = merged
                return APIResponse(ok=True, data=merged, message="项目组已更新")
        raise HTTPException(404, f"项目组不存在: {pid}")


@router.delete("/project-groups/{pid}")
def delete_project_group(pid: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        groups: list[dict[str, Any]] = data.get("project_groups") or []
        new_groups = [g for g in groups if g.get("id") != pid]
        if len(new_groups) == len(groups):
            raise HTTPException(404, f"项目组不存在: {pid}")
        data["project_groups"] = new_groups
        return APIResponse(ok=True, message="项目组已删除")


# ---------- JSON 整体导入（部分子树覆盖） ----------


@router.post("/import-json")
def import_org_json(body: dict[str, Any]) -> APIResponse:
    """允许仅覆盖 org / project_groups / employees 部分子集。"""
    db = get_db()
    with db.transaction() as data:
        if "org" in body:
            data["org"] = body["org"]
        if "project_groups" in body:
            data["project_groups"] = body["project_groups"]
        if "employees" in body:
            value = body["employees"]
            if isinstance(value, dict):
                data["employees"] = value
            elif isinstance(value, list):
                data["employees"] = {emp["id"]: emp for emp in value if emp.get("id")}
            else:
                raise HTTPException(400, "employees 必须是 dict 或 list")
        return APIResponse(ok=True, message="组织 JSON 已合并写入")
