from datetime import datetime, timedelta
from typing import List, Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.deps import get_current_active_user, require_role
from app.models import (
    User, Supplier, InventoryItem, Warehouse, WarehouseInventory,
    PurchaseOrder, PurchaseOrderItem, Notification, NotificationType
)
from app.schemas import (
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
    PurchaseOrderItemCreate, PurchaseOrderReceive
)

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


def generate_po_number(db: Session) -> str:
    today = datetime.utcnow()
    prefix = f"PO{today.strftime('%Y%m')}"
    month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month = (month_start.replace(year=month_start.year + 1, month=1)
                  if month_start.month == 12
                  else month_start.replace(month=month_start.month + 1))
    count = db.query(PurchaseOrder).filter(
        PurchaseOrder.created_at >= month_start,
        PurchaseOrder.created_at < next_month,
    ).count()
    return f"{prefix}{count + 1:04d}"


@router.get("/", response_model=List[PurchaseOrderResponse])
def list_purchase_orders(
    skip: int = 0,
    limit: int = 100,
    supplier_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(PurchaseOrder).join(Supplier).join(Warehouse)

    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    if warehouse_id:
        query = query.filter(PurchaseOrder.warehouse_id == warehouse_id)
    if status:
        query = query.filter(PurchaseOrder.status == status)

    orders = query.order_by(PurchaseOrder.created_at.desc()).offset(skip).limit(limit).all()

    return [build_po_response(db, order) for order in orders]


@router.post("/", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    po_data: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    # Validate supplier
    supplier = db.query(Supplier).filter(Supplier.id == po_data.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Validate warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.id == po_data.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # Validate items and calculate totals
    subtotal = Decimal("0")
    po_items = []

    for item_data in po_data.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_data.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {item_data.item_id} not found")

        item_total = Decimal(str(item_data.unit_price)) * item_data.quantity
        subtotal += item_total

        po_items.append({
            "item": item,
            "data": item_data,
            "total": item_total
        })

    # Calculate tax and total
    tax_amount = subtotal * Decimal("0.18")  # 18% GST default
    total_amount = subtotal + tax_amount

    # Create PO
    po = PurchaseOrder(
        po_number=generate_po_number(db),
        supplier_id=po_data.supplier_id,
        warehouse_id=po_data.warehouse_id,
        status="draft",
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total_amount,
        expected_delivery=po_data.expected_delivery,
        notes=po_data.notes,
        created_by_id=current_user.id
    )
    db.add(po)
    db.flush()

    # Create PO items
    for po_item_data in po_items:
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            item_id=po_item_data["item"].id,
            quantity=po_item_data["data"].quantity,
            unit_price=po_item_data["data"].unit_price,
            received_quantity=0,
            total=po_item_data["total"]
        )
        db.add(po_item)

    db.commit()
    db.refresh(po)

    return build_po_response(db, po)


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
def get_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    return build_po_response(db, po)


@router.put("/{po_id}", response_model=PurchaseOrderResponse)
def update_purchase_order(
    po_id: int,
    po_update: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status == "received":
        raise HTTPException(status_code=400, detail="Cannot update received order")

    for field, value in po_update.model_dump(exclude_unset=True).items():
        if field == "status" and value == "sent" and po.status == "draft":
            # Mark as sent
            pass
        setattr(po, field, value)

    db.commit()
    db.refresh(po)
    return build_po_response(db, po)


@router.post("/{po_id}/receive")
def receive_purchase_order(
    po_id: int,
    receive_data: PurchaseOrderReceive,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status == "received":
        raise HTTPException(status_code=400, detail="Order already received")

    for receive_item in receive_data.items:
        po_item = db.query(PurchaseOrderItem).filter(
            PurchaseOrderItem.purchase_order_id == po_id,
            PurchaseOrderItem.item_id == receive_item.item_id
        ).first()

        if not po_item:
            raise HTTPException(status_code=404, detail=f"Item {receive_item.item_id} not in order")

        # Update received quantity
        new_received = po_item.received_quantity + receive_item.quantity_received
        if new_received > po_item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot receive more than ordered for item {po_item.item.name}"
            )

        po_item.received_quantity = new_received

        # Update inventory
        wh_inventory = db.query(WarehouseInventory).filter(
            WarehouseInventory.warehouse_id == po.warehouse_id,
            WarehouseInventory.item_id == receive_item.item_id
        ).first()

        if not wh_inventory:
            wh_inventory = WarehouseInventory(
                warehouse_id=po.warehouse_id,
                item_id=receive_item.item_id,
                quantity=receive_item.quantity_received,
                reserved_quantity=0
            )
            db.add(wh_inventory)
        else:
            wh_inventory.quantity += receive_item.quantity_received

        # Update item total quantity
        po_item.item.quantity += receive_item.quantity_received
        po_item.item.cost_price = po_item.unit_price  # Update cost to latest

    # Update PO status
    all_received = all(item.received_quantity >= item.quantity for item in po.items)
    po.status = "received" if all_received else "partial"
    po.actual_delivery = receive_data.actual_delivery or datetime.utcnow()

    db.commit()

    # Create notification
    notification = Notification(
        type=NotificationType.ORDER_RECEIVED,
        title="Purchase Order Received",
        message=f"PO {po.po_number} has been received from {po.supplier.name}",
        item_id=None
    )
    db.add(notification)
    db.commit()

    return {"message": "Purchase order received successfully", "status": po.status}


@router.delete("/{po_id}")
def delete_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager")),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status == "received":
        raise HTTPException(status_code=400, detail="Cannot delete received order")

    po.status = "cancelled"
    db.commit()
    return {"message": "Purchase order cancelled successfully"}


def build_po_response(db: Session, po: PurchaseOrder) -> dict:
    supplier = db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == po.warehouse_id).first()

    return {
        "id": po.id,
        "po_number": po.po_number,
        "supplier_id": po.supplier_id,
        "supplier_name": supplier.name if supplier else "Unknown",
        "warehouse_id": po.warehouse_id,
        "warehouse_name": warehouse.name if warehouse else "Unknown",
        "status": po.status,
        "subtotal": po.subtotal,
        "tax_amount": po.tax_amount,
        "total_amount": po.total_amount,
        "expected_delivery": po.expected_delivery,
        "actual_delivery": po.actual_delivery,
        "notes": po.notes,
        "items": [
            {
                "id": item.id,
                "item_id": item.item_id,
                "item_name": item.item.name,
                "item_sku": item.item.sku,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "received_quantity": item.received_quantity,
                "total": item.total
            }
            for item in po.items
        ],
        "created_at": po.created_at
    }


@router.get("/stats/overview")
def get_po_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get purchase order statistics"""
    pending = db.query(PurchaseOrder).filter(
        PurchaseOrder.status.in_(["draft", "sent", "confirmed"])
    ).count()

    expected_this_week = db.query(PurchaseOrder).filter(
        PurchaseOrder.status.in_(["sent", "confirmed", "partial"]),
        PurchaseOrder.expected_delivery <= datetime.utcnow() + timedelta(days=7)
    ).count()

    total_pending_value = db.query(func.sum(PurchaseOrder.total_amount)).filter(
        PurchaseOrder.status.in_(["draft", "sent", "confirmed"])
    ).scalar() or Decimal("0")

    return {
        "pending_orders": pending,
        "expected_this_week": expected_this_week,
        "total_pending_value": total_pending_value
    }
