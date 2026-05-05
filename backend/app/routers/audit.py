from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.deps import get_current_active_user, require_role
from app.models import User, AuditLog, AuditAction
from app.schemas import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit Logs"])


def log_audit_action(
    db: Session,
    user_id: Optional[int],
    action: AuditAction,
    entity_type: str,
    entity_id: Optional[int] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """Helper function to create audit log entries"""
    audit_log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(audit_log)
    db.commit()


@router.get("/", response_model=List[AuditLogResponse])
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    query = db.query(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id)

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    logs = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "user_name": user.full_name if user else "System",
            "action": log.action.value,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "old_values": log.old_values,
            "new_values": log.new_values,
            "ip_address": log.ip_address,
            "created_at": log.created_at
        }
        for log, user in logs
    ]


@router.get("/my-activity")
def get_my_activity(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current user's audit trail"""
    logs = db.query(AuditLog).filter(
        AuditLog.user_id == current_user.id
    ).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

    return [
        {
            "id": log.id,
            "action": log.action.value,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "created_at": log.created_at
        }
        for log in logs
    ]


@router.get("/stats/summary")
def get_audit_summary(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    """Get audit statistics"""
    from sqlalchemy import func

    cutoff = datetime.utcnow() - timedelta(days=days)

    # Actions by type
    action_counts = db.query(
        AuditLog.action,
        func.count(AuditLog.id).label("count")
    ).filter(
        AuditLog.created_at >= cutoff
    ).group_by(AuditLog.action).all()

    # Entity types
    entity_counts = db.query(
        AuditLog.entity_type,
        func.count(AuditLog.id).label("count")
    ).filter(
        AuditLog.created_at >= cutoff
    ).group_by(AuditLog.entity_type).all()

    # Most active users
    user_activity = db.query(
        User.full_name,
        func.count(AuditLog.id).label("count")
    ).join(AuditLog).filter(
        AuditLog.created_at >= cutoff
    ).group_by(User.id).order_by(desc("count")).limit(10).all()

    return {
        "period_days": days,
        "total_logs": db.query(AuditLog).filter(AuditLog.created_at >= cutoff).count(),
        "actions_by_type": [{"action": a.value, "count": c} for a, c in action_counts],
        "entity_types": [{"type": e, "count": c} for e, c in entity_counts],
        "most_active_users": [{"name": n, "count": c} for n, c in user_activity]
    }


@router.delete("/cleanup")
def cleanup_old_logs(
    days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager")),
):
    """Delete audit logs older than specified days"""
    cutoff = datetime.utcnow() - timedelta(days=days)

    deleted = db.query(AuditLog).filter(AuditLog.created_at < cutoff).delete()
    db.commit()

    return {"message": f"Deleted {deleted} old audit logs"}


# Decorator helper for automatic audit logging
def audit_action(action: AuditAction, entity_type: str):
    """Decorator to automatically log actions"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # This is a simplified version - in practice, you'd extract
            # the db session and user from kwargs
            result = await func(*args, **kwargs)
            return result
        return wrapper
    return decorator
