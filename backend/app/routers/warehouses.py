from typing import List
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.deps import get_current_active_user, require_role
from app.models import User, Warehouse, WarehouseInventory, InventoryItem
from app.schemas import (
    WarehouseCreate, WarehouseUpdate, WarehouseResponse,
    WarehouseInventoryResponse
)

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


@router.get("/", response_model=List[WarehouseResponse])
def list_warehouses(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        logger.info(f"Fetching warehouses for user: {current_user.email}")
        warehouses = db.query(Warehouse).order_by(Warehouse.id).offset(skip).limit(limit).all()
        logger.info(f"Found {len(warehouses)} warehouses")
        result = []
        for w in warehouses:
            # Calculate item count
            item_count = db.query(WarehouseInventory).filter(
                WarehouseInventory.warehouse_id == w.id
            ).count()
            # Ensure datetime is serializable
            created_at = w.created_at
            if isinstance(created_at, datetime):
                created_at = created_at.isoformat()
            w_dict = {
                "id": w.id,
                "name": w.name,
                "code": w.code,
                "address": w.address,
                "postal_code": w.postal_code,
                "country_code": w.country_code,
                "latitude": w.latitude,
                "longitude": w.longitude,
                "is_active": w.is_active,
                "created_at": created_at,
                "item_count": item_count
            }
            result.append(w_dict)
        logger.info(f"Returning {len(result)} warehouses")
        return result
    except Exception as e:
        logger.error(f"Error in list_warehouses: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/", response_model=WarehouseResponse, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    warehouse: WarehouseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    # Check if code exists
    existing = db.query(Warehouse).filter(Warehouse.code == warehouse.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Warehouse code already exists")

    db_warehouse = Warehouse(**warehouse.model_dump())
    db.add(db_warehouse)
    db.commit()
    db.refresh(db_warehouse)
    return db_warehouse


@router.get("/{warehouse_id}", response_model=WarehouseResponse)
def get_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    item_count = db.query(WarehouseInventory).filter(
        WarehouseInventory.warehouse_id == warehouse_id
    ).count()

    return {
        "id": warehouse.id,
        "name": warehouse.name,
        "code": warehouse.code,
        "address": warehouse.address,
        "postal_code": warehouse.postal_code,
        "country_code": warehouse.country_code,
        "latitude": warehouse.latitude,
        "longitude": warehouse.longitude,
        "is_active": warehouse.is_active,
        "created_at": warehouse.created_at,
        "item_count": item_count
    }


@router.put("/{warehouse_id}", response_model=WarehouseResponse)
def update_warehouse(
    warehouse_id: int,
    warehouse_update: WarehouseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    for field, value in warehouse_update.model_dump(exclude_unset=True).items():
        setattr(warehouse, field, value)

    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.delete("/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager")),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # Soft delete - mark as inactive
    warehouse.is_active = False
    db.commit()
    return {"message": "Warehouse deactivated successfully"}


@router.get("/{warehouse_id}/inventory", response_model=List[WarehouseInventoryResponse])
def get_warehouse_inventory(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    inventory = db.query(WarehouseInventory, InventoryItem).join(
        InventoryItem, WarehouseInventory.item_id == InventoryItem.id
    ).filter(
        WarehouseInventory.warehouse_id == warehouse_id
    ).all()

    return [
        WarehouseInventoryResponse(
            id=wi.id,
            warehouse_id=wi.warehouse_id,
            warehouse_name=warehouse.name,
            quantity=wi.quantity,
            reserved_quantity=wi.reserved_quantity,
            reorder_level=wi.reorder_level or item.reorder_level,
            available_quantity=wi.quantity - wi.reserved_quantity
        )
        for wi, item in inventory
    ]


@router.post("/{warehouse_id}/inventory/{item_id}/adjust")
def adjust_inventory(
    warehouse_id: int,
    item_id: int,
    quantity: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    wi = db.query(WarehouseInventory).filter(
        WarehouseInventory.warehouse_id == warehouse_id,
        WarehouseInventory.item_id == item_id
    ).first()

    if not wi:
        # Create new inventory record
        wi = WarehouseInventory(
            warehouse_id=warehouse_id,
            item_id=item_id,
            quantity=quantity,
            reserved_quantity=0
        )
        db.add(wi)
    else:
        wi.quantity = quantity

    db.flush()
    total = db.query(func.sum(WarehouseInventory.quantity)).filter(
        WarehouseInventory.item_id == item_id
    ).scalar() or 0
    item.quantity = int(total)

    db.commit()
    return {"message": "Inventory adjusted successfully"}
