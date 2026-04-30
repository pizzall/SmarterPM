"""能力值变更提案管理 API（需求 7）。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.correction_log import append_correction, apply_field_change
from backend.core.storage import get_db, now_iso
from backend.models.schemas import APIResponse, AbilityUpdatePatchIn

router = APIRouter(prefix="/api/ability-updates", tags=["ability_updates"])


@router.get("/pending")
def list_pending() -> APIResponse:
    db = get_db()
    proposals = db.get_section("ability_update_proposals") or {}
    pending = [p for p in proposals.values() if p.get("status") == "pending"]
    pending.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return APIResponse(ok=True, data=pending)


@router.get("")
def list_all() -> APIResponse:
    db = get_db()
    proposals = db.get_section("ability_update_proposals") or {}
    items = list(proposals.values())
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return APIResponse(ok=True, data=items)


@router.patch("/{uid}")
def edit(uid: str, body: AbilityUpdatePatchIn) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        proposals = data.get("ability_update_proposals") or {}
        item = proposals.get(uid)
        if not item:
            raise HTTPException(404, f"提案不存在: {uid}")
        if item.get("status") != "pending":
            raise HTTPException(400, "已应用 / 已拒绝的提案不能再编辑")
        item["proposed_value"] = body.proposed_value
        if body.reason:
            item["reason"] = body.reason
        item["status"] = "edited"
        item["updated_at"] = now_iso()
        return APIResponse(ok=True, data=item, message="提案已修改")


@router.post("/{uid}/apply")
def apply(uid: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        proposals = data.get("ability_update_proposals") or {}
        item = proposals.get(uid)
        if not item:
            raise HTTPException(404, f"提案不存在: {uid}")
        if item.get("status") == "applied":
            raise HTTPException(400, "提案已经应用")

        eid = item.get("employee_id")
        emp = (data.get("employees") or {}).get(eid)
        if not emp:
            raise HTTPException(404, f"员工不存在: {eid}")

        old = apply_field_change(emp, item["field"], item["proposed_value"])
        append_correction(
            emp,
            field=item["field"],
            old_value=old,
            new_value=item["proposed_value"],
            source=item.get("input_text") or item.get("reason") or "",
            updated_by=item.get("source"),
            task_id=item.get("task_id"),
        )
        item["status"] = "applied"
        item["applied_at"] = now_iso()
        item["actual_old_value"] = old
        return APIResponse(
            ok=True,
            data={"employee": emp, "proposal": item},
            message="能力值变更已应用",
        )


@router.post("/{uid}/reject")
def reject(uid: str) -> APIResponse:
    db = get_db()
    with db.transaction() as data:
        proposals = data.get("ability_update_proposals") or {}
        item = proposals.get(uid)
        if not item:
            raise HTTPException(404, f"提案不存在: {uid}")
        item["status"] = "rejected"
        item["rejected_at"] = now_iso()
        return APIResponse(ok=True, data=item, message="提案已拒绝")
