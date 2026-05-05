from typing import List, Optional
from decimal import Decimal
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.deps import get_current_active_user, require_role
from app.models import User, Supplier, InventoryItem, PurchaseOrder
from app.schemas import (
    SupplierCreate, SupplierUpdate, SupplierResponse, SupplierPerformanceResponse
)

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])
logger = logging.getLogger(__name__)


@router.get("/", response_model=List[SupplierResponse])
def list_suppliers(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        logger.info(f"Fetching suppliers for user: {current_user.email}")
        query = db.query(Supplier)

        if search:
            query = query.filter(
                Supplier.name.ilike(f"%{search}%") |
                Supplier.email.ilike(f"%{search}%") |
                Supplier.code.ilike(f"%{search}%")
            )

        suppliers = query.order_by(Supplier.id).offset(skip).limit(limit).all()
        logger.info(f"Found {len(suppliers)} suppliers")

        result = []
        for s in suppliers:
            # Calculate item count
            item_count = db.query(InventoryItem).filter(
                InventoryItem.supplier_id == s.id
            ).count()

            # Calculate total purchases
            total_purchases = db.query(func.sum(PurchaseOrder.total_amount)).filter(
                PurchaseOrder.supplier_id == s.id,
                PurchaseOrder.status == "received"
            ).scalar() or Decimal("0")

            result.append({
                "id": s.id,
                "name": s.name,
                "code": s.code,
                "email": s.email,
                "phone": s.phone,
                "address": s.address,
                "city": s.city,
                "state": s.state,
                "postal_code": s.postal_code,
                "country": s.country,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "tax_id": s.tax_id,
                "payment_terms": s.payment_terms,
                "lead_time_days": s.lead_time_days,
                "rating": s.rating,
                "is_active": s.is_active,
                "notes": s.notes,
                "created_at": s.created_at,
                "item_count": item_count,
                "total_purchases": total_purchases
            })

        logger.info(f"Returning {len(result)} suppliers")
        return result
    except Exception as e:
        logger.error(f"Error in list_suppliers: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(
    supplier: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    # Check if code exists
    if supplier.code:
        existing = db.query(Supplier).filter(Supplier.code == supplier.code).first()
        if existing:
            raise HTTPException(status_code=400, detail="Supplier code already exists")

    db_supplier = Supplier(**supplier.model_dump())
    db.add(db_supplier)
    db.commit()
    db.refresh(db_supplier)
    return get_supplier(db_supplier.id, db=db, current_user=current_user)


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    item_count = db.query(InventoryItem).filter(
        InventoryItem.supplier_id == supplier_id
    ).count()

    total_purchases = db.query(func.sum(PurchaseOrder.total_amount)).filter(
        PurchaseOrder.supplier_id == supplier_id,
        PurchaseOrder.status == "received"
    ).scalar() or Decimal("0")

    return {
        "id": supplier.id,
        "name": supplier.name,
        "code": supplier.code,
        "email": supplier.email,
        "phone": supplier.phone,
        "address": supplier.address,
        "city": supplier.city,
        "state": supplier.state,
        "postal_code": supplier.postal_code,
        "country": supplier.country,
        "latitude": supplier.latitude,
        "longitude": supplier.longitude,
        "tax_id": supplier.tax_id,
        "payment_terms": supplier.payment_terms,
        "lead_time_days": supplier.lead_time_days,
        "rating": supplier.rating,
        "is_active": supplier.is_active,
        "notes": supplier.notes,
        "created_at": supplier.created_at,
        "item_count": item_count,
        "total_purchases": total_purchases
    }


@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    supplier_update: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    for field, value in supplier_update.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)

    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager")),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Soft delete
    supplier.is_active = False
    db.commit()
    return {"message": "Supplier deactivated successfully"}


@router.get("/{supplier_id}/performance", response_model=SupplierPerformanceResponse)
def get_supplier_performance(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Total orders
    total_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == supplier_id,
        PurchaseOrder.status == "received"
    ).count()

    # Total value
    total_value = db.query(func.sum(PurchaseOrder.total_amount)).filter(
        PurchaseOrder.supplier_id == supplier_id,
        PurchaseOrder.status == "received"
    ).scalar() or Decimal("0")

    # Average lead time and on-time delivery
    orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == supplier_id,
        PurchaseOrder.status == "received",
        PurchaseOrder.actual_delivery.isnot(None),
        PurchaseOrder.expected_delivery.isnot(None)
    ).all()

    avg_lead_time = None
    on_time_count = 0

    if orders:
        total_days = 0
        for order in orders:
            days = (order.actual_delivery - order.created_at).days
            total_days += days
            if order.actual_delivery <= order.expected_delivery:
                on_time_count += 1

        avg_lead_time = total_days / len(orders)
        on_time_rate = (on_time_count / len(orders)) * 100
    else:
        on_time_rate = 100 if total_orders == 0 else 0

    return SupplierPerformanceResponse(
        supplier_id=supplier_id,
        supplier_name=supplier.name,
        total_orders=total_orders,
        total_value=total_value,
        avg_lead_time=avg_lead_time,
        on_time_delivery_rate=on_time_rate
    )


@router.get("/{supplier_id}/items")
def get_supplier_items(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    items = db.query(InventoryItem).filter(
        InventoryItem.supplier_id == supplier_id,
        InventoryItem.is_active == True
    ).all()

    return [
        {
            "id": item.id,
            "sku": item.sku,
            "name": item.name,
            "category": item.category,
            "quantity": item.quantity,
            "unit_price": item.unit_price
        }
        for item in items
    ]
