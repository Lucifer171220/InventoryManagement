from datetime import datetime
from typing import List, Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.deps import get_current_active_user, require_role
from app.models import (
    User, Customer, InventoryItem, Warehouse, WarehouseInventory,
    Sale, SaleItem, Notification, NotificationType
)
from app.schemas import (
    SaleCreate, SaleResponse, SaleListResponse, SaleItemCreate
)

router = APIRouter(prefix="/sales", tags=["Sales"])


def generate_sale_code(db: Session) -> str:
    today = datetime.utcnow()
    prefix = f"SALE{today.strftime('%Y%m%d')}"
    day_start = datetime.combine(today.date(), datetime.min.time())
    day_end = datetime.combine(today.date(), datetime.max.time())
    count = db.query(Sale).filter(
        Sale.created_at >= day_start,
        Sale.created_at <= day_end,
    ).count()
    return f"{prefix}{count + 1:04d}"


@router.get("/", response_model=List[SaleListResponse])
def list_sales(
    skip: int = 0,
    limit: int = 100,
    customer_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = db.query(Sale, Customer).outerjoin(
        Customer, Sale.customer_id == Customer.id
    )

    if customer_id:
        query = query.filter(Sale.customer_id == customer_id)
    if warehouse_id:
        query = query.filter(Sale.warehouse_id == warehouse_id)
    if status:
        query = query.filter(Sale.status == status)
    if date_from:
        query = query.filter(Sale.created_at >= date_from)
    if date_to:
        query = query.filter(Sale.created_at <= date_to)

    sales = query.order_by(desc(Sale.created_at)).offset(skip).limit(limit).all()

    return [
        SaleListResponse(
            id=sale.id,
            sale_code=sale.sale_code,
            customer_name=f"{customer.first_name} {customer.last_name}" if customer else "Walk-in",
            total_amount=sale.total_amount,
            payment_method=sale.payment_method,
            status=sale.status,
            created_at=sale.created_at
        )
        for sale, customer in sales
    ]


@router.post("/", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
def create_sale(
    sale_data: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Validate warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.id == sale_data.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # Validate customer if provided
    customer = None
    if sale_data.customer_id:
        customer = db.query(Customer).filter(Customer.id == sale_data.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

    # Validate items and calculate totals
    subtotal = Decimal("0")
    total_tax = Decimal("0")
    total_discount = Decimal("0")
    sale_items = []

    for item_data in sale_data.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_data.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {item_data.item_id} not found")

        # Check warehouse inventory
        wh_inventory = db.query(WarehouseInventory).filter(
            WarehouseInventory.warehouse_id == sale_data.warehouse_id,
            WarehouseInventory.item_id == item_data.item_id
        ).first()

        if not wh_inventory or wh_inventory.quantity < item_data.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {item.name} in {warehouse.name}"
            )

        # Calculate item total
        item_subtotal = Decimal(str(item_data.unit_price)) * item_data.quantity
        item_discount = item_subtotal * (item_data.discount_percent / 100)
        item_tax = (item_subtotal - item_discount) * (item.tax_rate / 100)
        item_total = item_subtotal - item_discount + item_tax

        subtotal += item_subtotal
        total_discount += item_discount
        total_tax += item_tax

        sale_items.append({
            "item": item,
            "data": item_data,
            "wh_inventory": wh_inventory,
            "total": item_total
        })

    total_amount = subtotal - total_discount + total_tax

    # Create sale
    sale = Sale(
        sale_code=generate_sale_code(db),
        customer_id=sale_data.customer_id,
        user_id=current_user.id,
        warehouse_id=sale_data.warehouse_id,
        status="completed",
        subtotal=subtotal,
        tax_amount=total_tax,
        discount_amount=total_discount,
        total_amount=total_amount,
        payment_method=sale_data.payment_method,
        notes=sale_data.notes
    )
    db.add(sale)
    db.flush()

    # Create sale items and update inventory
    for sale_item_data in sale_items:
        sale_item = SaleItem(
            sale_id=sale.id,
            item_id=sale_item_data["item"].id,
            quantity=sale_item_data["data"].quantity,
            unit_price=sale_item_data["data"].unit_price,
            discount_percent=sale_item_data["data"].discount_percent,
            total=sale_item_data["total"]
        )
        db.add(sale_item)

        # Update warehouse inventory
        sale_item_data["wh_inventory"].quantity -= sale_item_data["data"].quantity

        # Update total inventory
        sale_item_data["item"].quantity -= sale_item_data["data"].quantity

        # Create low stock notification if needed
        if sale_item_data["item"].quantity <= sale_item_data["item"].reorder_level:
            existing = db.query(Notification).filter(
                Notification.item_id == sale_item_data["item"].id,
                Notification.type == NotificationType.LOW_STOCK,
                Notification.is_read == False
            ).first()

            if not existing:
                notification = Notification(
                    type=NotificationType.LOW_STOCK,
                    title="Low Stock Alert",
                    message=f"{sale_item_data['item'].name} ({sale_item_data['item'].sku}) is below reorder level",
                    item_id=sale_item_data["item"].id
                )
                db.add(notification)

    # Update customer loyalty points (1 point per ₹100 spent)
    if customer:
        points_earned = int(total_amount // 100)
        if points_earned > 0:
            customer.loyalty_points += points_earned

    db.commit()
    db.refresh(sale)

    return build_sale_response(db, sale)


@router.get("/{sale_id}", response_model=SaleResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    return build_sale_response(db, sale)


@router.post("/{sale_id}/cancel")
def cancel_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    if sale.status == "cancelled":
        raise HTTPException(status_code=400, detail="Sale already cancelled")

    # Restore inventory
    for sale_item in sale.items:
        wh_inventory = db.query(WarehouseInventory).filter(
            WarehouseInventory.warehouse_id == sale.warehouse_id,
            WarehouseInventory.item_id == sale_item.item_id
        ).first()

        if wh_inventory:
            wh_inventory.quantity += sale_item.quantity

        sale_item.item.quantity += sale_item.quantity

    # Deduct loyalty points if customer exists
    if sale.customer:
        points_to_deduct = int(sale.total_amount // 100)
        sale.customer.loyalty_points = max(0, sale.customer.loyalty_points - points_to_deduct)

    sale.status = "cancelled"
    db.commit()

    return {"message": "Sale cancelled successfully"}


def build_sale_response(db: Session, sale: Sale) -> dict:
    customer = db.query(Customer).filter(Customer.id == sale.customer_id).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == sale.warehouse_id).first()
    user = db.query(User).filter(User.id == sale.user_id).first()

    return {
        "id": sale.id,
        "sale_code": sale.sale_code,
        "customer_id": sale.customer_id,
        "customer_name": f"{customer.first_name} {customer.last_name}" if customer else None,
        "user_id": sale.user_id,
        "user_name": user.full_name if user else "Unknown",
        "warehouse_id": sale.warehouse_id,
        "warehouse_name": warehouse.name if warehouse else "Unknown",
        "status": sale.status,
        "subtotal": sale.subtotal,
        "tax_amount": sale.tax_amount,
        "discount_amount": sale.discount_amount,
        "total_amount": sale.total_amount,
        "payment_method": sale.payment_method,
        "notes": sale.notes,
        "items": [
            {
                "id": item.id,
                "item_id": item.item_id,
                "item_name": item.item.name,
                "item_sku": item.item.sku,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "discount_percent": item.discount_percent,
                "total": item.total
            }
            for item in sale.items
        ],
        "created_at": sale.created_at
    }


@router.get("/stats/daily")
def get_daily_sales_stats(
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get sales statistics for a specific date (defaults to today)"""
    if date:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    else:
        target_date = datetime.utcnow().date()

    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())

    stats = db.query(
        func.count(Sale.id).label("total_sales"),
        func.sum(Sale.total_amount).label("total_revenue"),
        func.sum(Sale.tax_amount).label("total_tax"),
        func.sum(Sale.discount_amount).label("total_discounts")
    ).filter(
        Sale.created_at >= day_start,
        Sale.created_at <= day_end,
        Sale.status == "completed"
    ).first()

    # Sales by payment method
    payment_stats = db.query(
        Sale.payment_method,
        func.count(Sale.id).label("count"),
        func.sum(Sale.total_amount).label("amount")
    ).filter(
        Sale.created_at >= day_start,
        Sale.created_at <= day_end,
        Sale.status == "completed"
    ).group_by(Sale.payment_method).all()

    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "total_sales": stats.total_sales or 0,
        "total_revenue": stats.total_revenue or Decimal("0"),
        "total_tax": stats.total_tax or Decimal("0"),
        "total_discounts": stats.total_discounts or Decimal("0"),
        "payment_methods": [
            {"method": method, "count": count, "amount": amount}
            for method, count, amount in payment_stats
        ]
    }
