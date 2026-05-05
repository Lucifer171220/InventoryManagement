from datetime import datetime, timedelta
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.database import get_db
from app.deps import get_current_active_user
from app.models import (
    User, InventoryItem, Warehouse, WarehouseInventory,
    Sale, SaleItem, PurchaseOrder, Notification
)
from app.schemas import DashboardResponse, DashboardKPICard, LowStockAlert, TopSellingItem, CategoryDistribution, SalesTrend

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    # Total inventory value
    total_value_result = db.query(
        func.sum(InventoryItem.quantity * InventoryItem.unit_price)
    ).filter(InventoryItem.is_active == True).scalar()
    total_inventory_value = Decimal(str(total_value_result or 0))

    # Total items count
    total_items = db.query(InventoryItem).filter(InventoryItem.is_active == True).count()

    # Low stock count
    low_stock_count = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.quantity <= InventoryItem.reorder_level
    ).count()

    # Today's sales
    today_sales = db.query(Sale).filter(
        Sale.created_at >= today_start,
        Sale.created_at <= today_end,
        Sale.status == "completed"
    ).all()
    total_sales_today = len(today_sales)
    revenue_today = sum(sale.total_amount for sale in today_sales)

    # Total customers
    total_customers = db.query(func.count(func.distinct(Sale.customer_id))).filter(
        Sale.customer_id.isnot(None)
    ).scalar()

    # Pending orders
    pending_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.status.in_(["draft", "sent", "confirmed", "partial"])
    ).count()

    # KPI Cards
    yesterday_start = today_start - timedelta(days=1)
    yesterday_sales = db.query(Sale).filter(
        Sale.created_at >= yesterday_start,
        Sale.created_at < today_start,
        Sale.status == "completed"
    ).all()
    yesterday_revenue = sum(sale.total_amount for sale in yesterday_sales)

    revenue_change = "+0%"
    revenue_change_type = "neutral"
    if yesterday_revenue > 0:
        change_pct = ((revenue_today - yesterday_revenue) / yesterday_revenue) * 100
        revenue_change = f"{change_pct:+.1f}%"
        revenue_change_type = "positive" if change_pct > 0 else "negative"

    kpi_cards = [
        DashboardKPICard(
            title="Inventory Value",
            value=f"₹{total_inventory_value:,.2f}",
            change=None,
            change_type="neutral",
            icon="warehouse"
        ),
        DashboardKPICard(
            title="Total Products",
            value=str(total_items),
            change=None,
            change_type="neutral",
            icon="box"
        ),
        DashboardKPICard(
            title="Today's Sales",
            value=str(total_sales_today),
            change=revenue_change,
            change_type=revenue_change_type,
            icon="shopping-cart"
        ),
        DashboardKPICard(
            title="Revenue Today",
            value=f"₹{revenue_today:,.2f}",
            change=None,
            change_type=None,
            icon="currency"
        ),
        DashboardKPICard(
            title="Low Stock Items",
            value=str(low_stock_count),
            change="Needs attention" if low_stock_count > 0 else None,
            change_type="negative" if low_stock_count > 0 else "positive",
            icon="alert-triangle"
        ),
        DashboardKPICard(
            title="Pending Orders",
            value=str(pending_orders),
            change=None,
            change_type=None,
            icon="clipboard-list"
        ),
    ]

    # Low stock alerts
    low_stock_items = db.query(InventoryItem, WarehouseInventory, Warehouse).join(
        WarehouseInventory, InventoryItem.id == WarehouseInventory.item_id
    ).join(
        Warehouse, WarehouseInventory.warehouse_id == Warehouse.id
    ).filter(
        InventoryItem.is_active == True,
        WarehouseInventory.quantity <= InventoryItem.reorder_level
    ).order_by(WarehouseInventory.quantity.asc()).limit(10).all()

    low_stock_alerts = [
        LowStockAlert(
            item_id=item.id,
            sku=item.sku,
            name=item.name,
            current_quantity=wi.quantity,
            reorder_level=item.reorder_level,
            warehouse_name=warehouse.name
        )
        for item, wi, warehouse in low_stock_items
    ]

    # Top selling items (last 30 days)
    thirty_days_ago = today_start - timedelta(days=30)
    top_items = db.query(
        SaleItem.item_id,
        InventoryItem.sku,
        InventoryItem.name,
        func.sum(SaleItem.quantity).label("total_sold"),
        func.sum(SaleItem.total).label("total_revenue")
    ).join(
        InventoryItem, SaleItem.item_id == InventoryItem.id
    ).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(
        Sale.created_at >= thirty_days_ago,
        Sale.status == "completed"
    ).group_by(
        SaleItem.item_id, InventoryItem.sku, InventoryItem.name
    ).order_by(desc("total_sold")).limit(5).all()

    top_selling_items = [
        TopSellingItem(
            item_id=item_id,
            sku=sku,
            name=name,
            total_sold=int(total_sold or 0),
            total_revenue=Decimal(str(total_revenue or 0))
        )
        for item_id, sku, name, total_sold, total_revenue in top_items
    ]

    # Category distribution
    category_data = db.query(
        InventoryItem.category,
        func.count(InventoryItem.id).label("count"),
        func.sum(InventoryItem.quantity * InventoryItem.unit_price).label("value")
    ).filter(
        InventoryItem.is_active == True
    ).group_by(InventoryItem.category).all()

    category_distribution = [
        CategoryDistribution(
            category=cat,
            count=int(count),
            value=Decimal(str(value or 0))
        )
        for cat, count, value in category_data
    ]

    # Sales trend (last 7 days)
    sales_trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day, datetime.max.time())

        day_sales = db.query(Sale).filter(
            Sale.created_at >= day_start,
            Sale.created_at <= day_end,
            Sale.status == "completed"
        ).all()

        sales_trend.append(SalesTrend(
            date=day.strftime("%Y-%m-%d"),
            sales_count=len(day_sales),
            revenue=sum(sale.total_amount for sale in day_sales)
        ))

    return DashboardResponse(
        total_inventory_value=total_inventory_value,
        total_items=total_items,
        low_stock_count=low_stock_count,
        total_sales_today=total_sales_today,
        revenue_today=revenue_today,
        total_customers=total_customers or 0,
        pending_orders=pending_orders,
        kpi_cards=kpi_cards,
        low_stock_alerts=low_stock_alerts,
        top_selling_items=top_selling_items,
        category_distribution=category_distribution,
        sales_trend=sales_trend
    )
