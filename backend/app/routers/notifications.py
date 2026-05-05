from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.deps import get_current_active_user
from app.models import User, Notification, InventoryItem, NotificationType

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
def get_notifications(
    unread_only: bool = False,
    type_filter: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(Notification).outerjoin(
        InventoryItem, Notification.item_id == InventoryItem.id
    )

    if unread_only:
        query = query.filter(Notification.is_read == False)
    if type_filter:
        query = query.filter(Notification.type == type_filter)

    notifications = query.order_by(desc(Notification.created_at)).limit(limit).all()

    return [
        {
            "id": n.id,
            "type": n.type.value,
            "title": n.title,
            "message": n.message,
            "item_id": n.item_id,
            "item_name": n.item.name if n.item else None,
            "is_read": n.is_read,
            "created_at": n.created_at
        }
        for n in notifications
    ]


@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"unread_count": count}


@router.post("/{notification_id}/mark-read")
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()
    return {"message": "Marked as read"}


@router.post("/mark-all-read")
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notification)
    db.commit()
    return {"message": "Notification deleted"}


@router.post("/check-low-stock")
def check_low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Manually trigger low stock check"""
    low_stock_items = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.quantity <= InventoryItem.reorder_level
    ).all()

    created = 0
    for item in low_stock_items:
        existing = db.query(Notification).filter(
            Notification.item_id == item.id,
            Notification.type == NotificationType.LOW_STOCK,
            Notification.is_read == False
        ).first()

        if not existing:
            notification = Notification(
                type=NotificationType.LOW_STOCK,
                title="Low Stock Alert",
                message=f"{item.name} ({item.sku}) is below reorder level. Current: {item.quantity}, Reorder at: {item.reorder_level}",
                item_id=item.id
            )
            db.add(notification)
            created += 1

    db.commit()
    return {"message": f"Created {created} low stock notifications", "low_stock_items": len(low_stock_items)}


@router.post("/check-expiry")
def check_expiry(
    days_warning: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Check for items nearing expiry"""
    from datetime import datetime, timedelta

    expiry_threshold = datetime.utcnow() + timedelta(days=days_warning)

    expiring_items = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.expiry_date.isnot(None),
        InventoryItem.expiry_date <= expiry_threshold,
        InventoryItem.quantity > 0
    ).all()

    created = 0
    for item in expiring_items:
        existing = db.query(Notification).filter(
            Notification.item_id == item.id,
            Notification.type == NotificationType.EXPIRY_WARNING,
            Notification.is_read == False
        ).first()

        if not existing:
            days_left = (item.expiry_date - datetime.utcnow()).days
            notification = Notification(
                type=NotificationType.EXPIRY_WARNING,
                title="Expiry Warning",
                message=f"{item.name} ({item.sku}) expires in {days_left} days. Quantity: {item.quantity}",
                item_id=item.id
            )
            db.add(notification)
            created += 1

    db.commit()
    return {"message": f"Created {created} expiry notifications", "expiring_items": len(expiring_items)}


@router.delete("/cleanup")
def cleanup_old_notifications(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete notifications older than specified days"""
    cutoff = datetime.utcnow() - timedelta(days=days)

    deleted = db.query(Notification).filter(
        Notification.created_at < cutoff,
        Notification.is_read == True
    ).delete()

    db.commit()
    return {"message": f"Deleted {deleted} old notifications"}
