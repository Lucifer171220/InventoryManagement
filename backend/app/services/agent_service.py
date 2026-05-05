import json
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models import (
    AgentAction,
    AgentActionStatus,
    AgentMemory,
    InventoryItem,
    Notification,
    NotificationType,
    PurchaseOrder,
    PurchaseOrderItem,
    Sale,
    SaleItem,
    Supplier,
    User,
    Warehouse,
    WarehouseInventory,
)
from app.services.ollama_service import choose_best_model, generate_response


def _money(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _agent_result(agent: str, status: str, summary: str, actions: list[str], data: dict[str, Any]) -> dict[str, Any]:
    return {
        "agent": agent,
        "status": status,
        "summary": summary,
        "recommended_actions": actions,
        "data": data,
    }


def _inventory_agent(db: Session) -> dict[str, Any]:
    low_stock_items = (
        db.query(InventoryItem)
        .filter(InventoryItem.is_active == True, InventoryItem.quantity <= InventoryItem.reorder_level)
        .order_by(InventoryItem.quantity.asc())
        .limit(10)
        .all()
    )
    inactive_items = db.query(InventoryItem).filter(InventoryItem.is_active == False).count()
    total_items = db.query(InventoryItem).filter(InventoryItem.is_active == True).count()

    rows = [
        {
            "sku": item.sku,
            "name": item.name,
            "quantity": item.quantity,
            "reorder_level": item.reorder_level,
            "reorder_quantity": item.reorder_quantity,
            "supplier_id": item.supplier_id,
        }
        for item in low_stock_items
    ]
    actions = [
        f"Reorder {row['reorder_quantity']} units for {row['sku']} ({row['name']})."
        for row in rows[:5]
    ]
    if not actions:
        actions = ["No immediate reorder action is required."]

    return _agent_result(
        "Inventory Agent",
        "attention" if rows else "healthy",
        f"{len(rows)} active items are at or below reorder level out of {total_items} active items.",
        actions,
        {"low_stock_items": rows, "inactive_items": inactive_items, "total_items": total_items},
    )


def _warehouse_agent(db: Session) -> dict[str, Any]:
    rows = (
        db.query(WarehouseInventory, InventoryItem)
        .join(InventoryItem, WarehouseInventory.item_id == InventoryItem.id)
        .filter(WarehouseInventory.reserved_quantity > 0)
        .order_by(desc(WarehouseInventory.reserved_quantity))
        .limit(10)
        .all()
    )
    reservations = [
        {
            "sku": item.sku,
            "name": item.name,
            "warehouse_id": wi.warehouse_id,
            "quantity": wi.quantity,
            "reserved_quantity": wi.reserved_quantity,
            "available_quantity": wi.available_quantity,
        }
        for wi, item in rows
    ]
    blocked = [row for row in reservations if row["available_quantity"] <= 0]
    actions = [
        f"Review reserved stock for {row['sku']} in warehouse {row['warehouse_id']}."
        for row in blocked[:5]
    ] or ["Warehouse reservations look balanced."]

    return _agent_result(
        "Warehouse Agent",
        "attention" if blocked else "healthy",
        f"{len(blocked)} warehouse stock records have no available quantity after reservations.",
        actions,
        {"reserved_stock": reservations, "blocked_count": len(blocked)},
    )


def _sales_agent(db: Session) -> dict[str, Any]:
    today = datetime.utcnow().date()
    start_30 = datetime.combine(today - timedelta(days=30), datetime.min.time())
    start_60 = datetime.combine(today - timedelta(days=60), datetime.min.time())

    last_30_sales = db.query(Sale).filter(Sale.created_at >= start_30, Sale.status == "completed").all()
    previous_30_sales = (
        db.query(Sale)
        .filter(Sale.created_at >= start_60, Sale.created_at < start_30, Sale.status == "completed")
        .all()
    )
    revenue_30 = sum(_money(sale.total_amount) for sale in last_30_sales)
    revenue_previous = sum(_money(sale.total_amount) for sale in previous_30_sales)
    change_percent = 0.0
    if revenue_previous > 0:
        change_percent = ((revenue_30 - revenue_previous) / revenue_previous) * 100

    top_items = (
        db.query(
            InventoryItem.sku,
            InventoryItem.name,
            func.sum(SaleItem.quantity).label("total_sold"),
            func.sum(SaleItem.total).label("total_revenue"),
        )
        .join(SaleItem, SaleItem.item_id == InventoryItem.id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= start_30, Sale.status == "completed")
        .group_by(InventoryItem.sku, InventoryItem.name)
        .order_by(desc("total_sold"))
        .limit(5)
        .all()
    )
    top_sellers = [
        {
            "sku": sku,
            "name": name,
            "total_sold": int(total_sold or 0),
            "total_revenue": _money(total_revenue),
        }
        for sku, name, total_sold, total_revenue in top_items
    ]
    actions = [
        f"Keep extra stock ready for {item['sku']} because it sold {item['total_sold']} units in 30 days."
        for item in top_sellers[:3]
    ] or ["No completed sales were found in the last 30 days; verify sales entry flow if this is unexpected."]

    return _agent_result(
        "Sales Agent",
        "attention" if revenue_30 < revenue_previous else "healthy",
        f"Last 30 days revenue is {revenue_30:.2f}, changing {change_percent:.1f}% from the previous 30 days.",
        actions,
        {
            "revenue_last_30_days": revenue_30,
            "revenue_previous_30_days": revenue_previous,
            "change_percent": round(change_percent, 2),
            "top_sellers": top_sellers,
        },
    )


def _supplier_agent(db: Session) -> dict[str, Any]:
    pending_orders = (
        db.query(PurchaseOrder, Supplier)
        .join(Supplier, PurchaseOrder.supplier_id == Supplier.id)
        .filter(PurchaseOrder.status.in_(["draft", "sent", "confirmed", "partial"]))
        .order_by(PurchaseOrder.created_at.asc())
        .limit(10)
        .all()
    )
    overdue = []
    now = datetime.utcnow()
    for order, supplier in pending_orders:
        if order.expected_delivery and order.expected_delivery < now:
            overdue.append(
                {
                    "po_number": order.po_number,
                    "supplier": supplier.name,
                    "expected_delivery": order.expected_delivery.isoformat(),
                    "total_amount": _money(order.total_amount),
                }
            )

    actions = [
        f"Contact {row['supplier']} about overdue purchase order {row['po_number']}."
        for row in overdue[:5]
    ] or ["No overdue purchase orders were found."]

    return _agent_result(
        "Supplier Agent",
        "attention" if overdue else "healthy",
        f"{len(overdue)} pending purchase orders are past expected delivery.",
        actions,
        {"overdue_orders": overdue, "pending_order_count": len(pending_orders)},
    )


async def _executive_agent(agent_outputs: list[dict[str, Any]]) -> dict[str, Any]:
    model = choose_best_model()
    fallback = {
        "agent": "Executive Agent",
        "status": "ready",
        "summary": "Rule-based automation completed. Ollama was not available for a narrative synthesis.",
        "recommended_actions": [
            action
            for output in agent_outputs
            for action in output.get("recommended_actions", [])
            if action
        ][:8],
        "data": {"source_model": None},
    }
    if not model:
        return fallback

    compact = [
        {
            "agent": output["agent"],
            "status": output["status"],
            "summary": output["summary"],
            "actions": output["recommended_actions"][:3],
        }
        for output in agent_outputs
    ]
    prompt = f"""
Create a short operations brief from these agent results.
Return only valid JSON with keys: summary, recommended_actions.
recommended_actions must be an array of at most 6 plain English actions.

Agent results:
{json.dumps(compact, indent=2)}
"""
    system = "You are an operations coordinator for a retail inventory system. Be concise and practical."
    answer, source_model = await generate_response(prompt=prompt, system=system)
    try:
        parsed = json.loads(answer)
        summary = str(parsed.get("summary") or fallback["summary"])
        actions = parsed.get("recommended_actions") or fallback["recommended_actions"]
        if not isinstance(actions, list):
            actions = fallback["recommended_actions"]
    except (TypeError, json.JSONDecodeError):
        summary = answer.strip() or fallback["summary"]
        actions = fallback["recommended_actions"]

    return _agent_result(
        "Executive Agent",
        "ready",
        summary,
        [str(action) for action in actions[:6]],
        {"source_model": source_model},
    )


async def run_agentic_automation(db: Session, user_role: str) -> dict[str, Any]:
    started_at = datetime.utcnow()
    agents = [
        _inventory_agent(db),
        _warehouse_agent(db),
        _sales_agent(db),
        _supplier_agent(db),
    ]
    executive = await _executive_agent(agents)
    agents.append(executive)
    attention_count = sum(1 for agent in agents if agent["status"] == "attention")

    return {
        "run_id": started_at.strftime("agent-run-%Y%m%d%H%M%S"),
        "started_at": started_at.isoformat(),
        "finished_at": datetime.utcnow().isoformat(),
        "user_role": user_role,
        "source_model": executive["data"].get("source_model"),
        "status": "attention" if attention_count else "healthy",
        "summary": executive["summary"],
        "recommended_actions": executive["recommended_actions"],
        "agents": agents,
    }


STOP_WORDS = {
    "the",
    "and",
    "for",
    "what",
    "should",
    "we",
    "are",
    "running",
    "low",
    "store",
    "order",
    "where",
    "with",
    "that",
    "this",
    "from",
    "have",
    "need",
    "please",
}


def _extract_terms(message: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9]+", message.lower())
    return [word for word in words if len(word) > 2 and word not in STOP_WORDS]


def _save_memory(db: Session, user: User, agent_name: str, message: str, summary: str, data: dict[str, Any]) -> None:
    db.add(
        AgentMemory(
            user_id=user.id,
            agent_name=agent_name,
            user_message=message,
            summary=summary,
            data=data,
        )
    )
    db.commit()


def _recent_memory(db: Session, user: User) -> list[dict[str, Any]]:
    rows = (
        db.query(AgentMemory)
        .filter(AgentMemory.user_id == user.id)
        .order_by(AgentMemory.created_at.desc())
        .limit(5)
        .all()
    )
    return [
        {
            "agent": row.agent_name,
            "message": row.user_message,
            "summary": row.summary,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


def _create_pending_action(
    db: Session,
    user: User,
    agent_name: str,
    action_type: str,
    title: str,
    description: str,
    payload: dict[str, Any],
) -> AgentAction:
    action = AgentAction(
        user_id=user.id,
        agent_name=agent_name,
        action_type=action_type,
        title=title,
        description=description,
        payload=payload,
        status=AgentActionStatus.PENDING,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


def _serialize_action(action: AgentAction) -> dict[str, Any]:
    return {
        "id": action.id,
        "agent_name": action.agent_name,
        "action_type": action.action_type,
        "title": action.title,
        "description": action.description,
        "payload": action.payload,
        "status": action.status.value if hasattr(action.status, "value") else action.status,
        "result": action.result,
        "created_at": action.created_at.isoformat(),
        "decided_at": action.decided_at.isoformat() if action.decided_at else None,
    }


def _find_best_item(db: Session, message: str) -> InventoryItem | None:
    terms = _extract_terms(message)
    query = db.query(InventoryItem).filter(InventoryItem.is_active == True)
    if terms:
        matches = []
        for term in terms:
            matches.extend(
                query.filter(
                    (InventoryItem.sku.ilike(f"%{term}%"))
                    | (InventoryItem.name.ilike(f"%{term}%"))
                    | (InventoryItem.brand.ilike(f"%{term}%"))
                    | (InventoryItem.category.ilike(f"%{term}%"))
                    | (InventoryItem.description.ilike(f"%{term}%"))
                )
                .limit(10)
                .all()
            )
        if matches:
            unique = {item.id: item for item in matches}.values()
            return sorted(unique, key=lambda item: _item_match_score(item, terms), reverse=True)[0]
    return query.order_by(InventoryItem.quantity.asc()).first()


def _item_match_score(item: InventoryItem, terms: list[str]) -> int:
    text = " ".join(
        [
            item.sku or "",
            item.name or "",
            item.brand or "",
            item.category or "",
            item.description or "",
        ]
    ).lower()
    return sum(1 for term in terms if term in text)


def _find_best_warehouse(db: Session, message: str) -> Warehouse | None:
    terms = _extract_terms(message)
    query = db.query(Warehouse).filter(Warehouse.is_active == True)
    for term in terms:
        warehouse = (
            query.filter(
                (Warehouse.name.ilike(f"%{term}%"))
                | (Warehouse.code.ilike(f"%{term}%"))
                | (Warehouse.address.ilike(f"%{term}%"))
                | (Warehouse.postal_code.ilike(f"%{term}%"))
            )
            .order_by(Warehouse.id.asc())
            .first()
        )
        if warehouse:
            return warehouse
    return query.order_by(Warehouse.id.asc()).first()


def _warehouse_quantity(db: Session, item: InventoryItem, warehouse: Warehouse | None) -> int:
    if not warehouse:
        return int(item.quantity or 0)
    row = (
        db.query(WarehouseInventory)
        .filter(WarehouseInventory.item_id == item.id, WarehouseInventory.warehouse_id == warehouse.id)
        .first()
    )
    return int(row.quantity if row else 0)


def _average_daily_sales(db: Session, item: InventoryItem, days: int = 30) -> float:
    start = datetime.utcnow() - timedelta(days=days)
    sold = (
        db.query(func.sum(SaleItem.quantity))
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(SaleItem.item_id == item.id, Sale.status == "completed", Sale.created_at >= start)
        .scalar()
        or 0
    )
    return float(sold) / days


def _smart_inventory_workflow(db: Session, user: User, message: str) -> dict[str, Any]:
    agent_name = "Smart Inventory Agent"
    item = _find_best_item(db, message)
    warehouse = _find_best_warehouse(db, message)
    if not item:
        summary = "No matching inventory item was found."
        _save_memory(db, user, agent_name, message, summary, {})
        return {"agent": agent_name, "summary": summary, "actions": [], "data": {}}

    current_quantity = _warehouse_quantity(db, item, warehouse)
    average_daily_sales = _average_daily_sales(db, item)
    forecast_14_days = round(average_daily_sales * 14)
    safety_stock = int(item.reorder_level or 0)
    suggested_quantity = max(int(item.reorder_quantity or 0), forecast_14_days + safety_stock - current_quantity)
    suggested_quantity = max(suggested_quantity, 0)
    supplier = db.query(Supplier).filter(Supplier.id == item.supplier_id).first() if item.supplier_id else None

    summary = (
        f"{item.name} has {current_quantity} units"
        f"{f' in {warehouse.name}' if warehouse else ''}. "
        f"Average demand is {average_daily_sales:.2f} units/day, so a 14-day forecast is {forecast_14_days} units. "
        f"Suggested restock quantity is {suggested_quantity}."
    )
    actions = []
    if suggested_quantity > 0 and supplier and warehouse:
        action = _create_pending_action(
            db=db,
            user=user,
            agent_name=agent_name,
            action_type="create_purchase_order",
            title=f"Create draft PO for {item.sku}",
            description=f"Create a draft purchase order for {suggested_quantity} units of {item.name}.",
            payload={
                "supplier_id": supplier.id,
                "supplier_name": supplier.name,
                "warehouse_id": warehouse.id,
                "warehouse_name": warehouse.name,
                "item_id": item.id,
                "sku": item.sku,
                "item_name": item.name,
                "quantity": suggested_quantity,
                "unit_price": _money(item.cost_price or item.unit_price),
                "expected_delivery": (datetime.utcnow() + timedelta(days=supplier.lead_time_days or 7)).isoformat(),
                "notes": f"Agent suggested restock from message: {message}",
            },
        )
        actions.append(_serialize_action(action))
    elif suggested_quantity > 0:
        action = _create_pending_action(
            db=db,
            user=user,
            agent_name=agent_name,
            action_type="create_notification",
            title=f"Restock review needed for {item.sku}",
            description="Supplier or warehouse data is missing, so a manager should review before creating a PO.",
            payload={
                "notification_type": NotificationType.SYSTEM.value,
                "title": f"Restock review needed for {item.sku}",
                "message": summary,
                "item_id": item.id,
            },
        )
        actions.append(_serialize_action(action))

    data = {
        "item": {"id": item.id, "sku": item.sku, "name": item.name, "brand": item.brand},
        "warehouse": {"id": warehouse.id, "name": warehouse.name} if warehouse else None,
        "current_quantity": current_quantity,
        "average_daily_sales": round(average_daily_sales, 2),
        "forecast_14_days": forecast_14_days,
        "suggested_restock_quantity": suggested_quantity,
    }
    _save_memory(db, user, agent_name, message, summary, data)
    return {"agent": agent_name, "summary": summary, "actions": actions, "data": data}


def _customer_support_workflow(db: Session, user: User, message: str) -> dict[str, Any]:
    agent_name = "Customer Support Agent"
    sale_code = re.search(r"SALE[0-9]+", message.upper())
    po_code = re.search(r"PO[0-9]+", message.upper())
    sale = db.query(Sale).filter(Sale.sale_code == sale_code.group(0)).first() if sale_code else None
    po = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_code.group(0)).first() if po_code else None

    actions = []
    data = {}
    if sale:
        summary = (
            f"Sale {sale.sale_code} is currently {sale.status}. "
            "Shipment tracking is not stored in this system, so staff should confirm delivery manually."
        )
        data = {"sale_id": sale.id, "sale_code": sale.sale_code, "status": str(sale.status)}
        if "refund" in message.lower() or "delayed" in message.lower() or "cancel" in message.lower():
            action = _create_pending_action(
                db,
                user,
                agent_name,
                "cancel_sale",
                f"Review cancellation/refund for {sale.sale_code}",
                "Cancel the sale and restore inventory if a manager approves this action.",
                {"sale_id": sale.id, "sale_code": sale.sale_code},
            )
            actions.append(_serialize_action(action))
    elif po:
        summary = (
            f"Purchase order {po.po_number} is {po.status}. "
            f"Expected delivery: {po.expected_delivery.isoformat() if po.expected_delivery else 'not set'}."
        )
        data = {"purchase_order_id": po.id, "po_number": po.po_number, "status": str(po.status)}
    else:
        summary = "I could not find a matching sale or purchase order number. Ask with a SALE or PO number for exact status."

    _save_memory(db, user, agent_name, message, summary, data)
    return {"agent": agent_name, "summary": summary, "actions": actions, "data": data}


def _sales_optimization_workflow(db: Session, user: User, message: str) -> dict[str, Any]:
    agent_name = "Sales Optimization Agent"
    start = datetime.utcnow() - timedelta(days=30)
    top_items = (
        db.query(
            InventoryItem.id,
            InventoryItem.sku,
            InventoryItem.name,
            InventoryItem.category,
            func.sum(SaleItem.quantity).label("sold"),
            func.sum(SaleItem.total).label("revenue"),
        )
        .join(SaleItem, SaleItem.item_id == InventoryItem.id)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.created_at >= start, Sale.status == "completed")
        .group_by(InventoryItem.id, InventoryItem.sku, InventoryItem.name, InventoryItem.category)
        .order_by(desc("revenue"))
        .limit(5)
        .all()
    )
    rows = [
        {
            "item_id": item_id,
            "sku": sku,
            "name": name,
            "category": category,
            "sold": int(sold or 0),
            "revenue": _money(revenue),
        }
        for item_id, sku, name, category, sold, revenue in top_items
    ]
    if rows:
        best = rows[0]
        summary = (
            f"{best['name']} is the strongest recent seller with revenue {best['revenue']:.2f}. "
            f"Suggested campaign: feature {best['category']} items and test a 5-10% bundle discount."
        )
    else:
        summary = "No recent sales were found, so the safest campaign is a small awareness campaign with manual review."

    action = _create_pending_action(
        db,
        user,
        agent_name,
        "create_notification",
        "Approve sales campaign recommendation",
        summary,
        {
            "notification_type": NotificationType.SYSTEM.value,
            "title": "Sales campaign recommendation",
            "message": summary,
            "item_id": rows[0]["item_id"] if rows else None,
        },
    )
    data = {"top_items": rows}
    _save_memory(db, user, agent_name, message, summary, data)
    return {"agent": agent_name, "summary": summary, "actions": [_serialize_action(action)], "data": data}


async def run_conversational_agent_workflow(db: Session, user: User, message: str) -> dict[str, Any]:
    lower = message.lower()
    if any(word in lower for word in ["where is", "order", "refund", "delayed", "tracking"]):
        result = _customer_support_workflow(db, user, message)
    elif any(word in lower for word in ["campaign", "discount", "marketing", "sales", "optimize", "a/b", "ab test"]):
        result = _sales_optimization_workflow(db, user, message)
    else:
        result = _smart_inventory_workflow(db, user, message)

    memory = _recent_memory(db, user)
    model = choose_best_model()
    final_answer = result["summary"]
    source_model = None
    if model:
        prompt = f"""
User message: {message}
Chosen agent: {result['agent']}
Agent result: {json.dumps({'summary': result['summary'], 'data': result['data']}, indent=2)}
Recent memory: {json.dumps(memory, indent=2)}

Write a concise manager-facing answer. Mention pending approval actions if any.
"""
        answer, source_model = await generate_response(
            prompt=prompt,
            system="You are an agentic operations assistant. Be practical, precise, and do not claim an action was executed unless it was only queued for approval.",
        )
        if answer:
            final_answer = answer

    return {
        "run_id": datetime.utcnow().strftime("workflow-%Y%m%d%H%M%S"),
        "agent": result["agent"],
        "answer": final_answer,
        "summary": result["summary"],
        "data": result["data"],
        "pending_actions": result["actions"],
        "memory": memory,
        "source_model": source_model,
        "human_in_loop": True,
    }


def _generate_po_number(db: Session) -> str:
    today = datetime.utcnow()
    month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prefix = f"PO{today.strftime('%Y%m')}"
    count = db.query(PurchaseOrder).filter(PurchaseOrder.created_at >= month_start).count()
    return f"{prefix}{count + 1:04d}"


def approve_agent_action(db: Session, user: User, action_id: int) -> dict[str, Any]:
    action = db.query(AgentAction).filter(AgentAction.id == action_id).first()
    if not action:
        raise ValueError("Action not found")
    if action.status != AgentActionStatus.PENDING:
        return _serialize_action(action)

    if action.action_type == "create_purchase_order" and user.role.value not in {"manager", "moderator"}:
        raise PermissionError("Only managers or moderators can approve purchase orders")
    if action.action_type == "cancel_sale" and user.role.value not in {"manager", "moderator"}:
        raise PermissionError("Only managers or moderators can approve sale cancellations")

    try:
        if action.action_type == "create_purchase_order":
            result = _execute_purchase_order_action(db, user, action.payload)
        elif action.action_type == "create_notification":
            result = _execute_notification_action(db, action.payload)
        elif action.action_type == "cancel_sale":
            result = _execute_cancel_sale_action(db, action.payload)
        else:
            raise ValueError(f"Unsupported action type: {action.action_type}")
        action.status = AgentActionStatus.APPROVED
        action.result = result
    except Exception as exc:
        action.status = AgentActionStatus.FAILED
        action.result = {"error": str(exc)}
    action.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(action)
    return _serialize_action(action)


def reject_agent_action(db: Session, action_id: int) -> dict[str, Any]:
    action = db.query(AgentAction).filter(AgentAction.id == action_id).first()
    if not action:
        raise ValueError("Action not found")
    action.status = AgentActionStatus.REJECTED
    action.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(action)
    return _serialize_action(action)


def _execute_purchase_order_action(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    supplier = db.query(Supplier).filter(Supplier.id == payload["supplier_id"]).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == payload["warehouse_id"]).first()
    item = db.query(InventoryItem).filter(InventoryItem.id == payload["item_id"]).first()
    if not supplier or not warehouse or not item:
        raise ValueError("Supplier, warehouse, or item no longer exists")

    quantity = int(payload["quantity"])
    unit_price = Decimal(str(payload["unit_price"]))
    subtotal = unit_price * quantity
    tax_amount = subtotal * Decimal("0.18")
    expected_delivery = payload.get("expected_delivery")

    po = PurchaseOrder(
        po_number=_generate_po_number(db),
        supplier_id=supplier.id,
        warehouse_id=warehouse.id,
        status="draft",
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=subtotal + tax_amount,
        expected_delivery=datetime.fromisoformat(expected_delivery) if expected_delivery else None,
        notes=payload.get("notes"),
        created_by_id=user.id,
    )
    db.add(po)
    db.flush()
    db.add(
        PurchaseOrderItem(
            purchase_order_id=po.id,
            item_id=item.id,
            quantity=quantity,
            unit_price=unit_price,
            received_quantity=0,
            total=subtotal,
        )
    )
    db.commit()
    return {"purchase_order_id": po.id, "po_number": po.po_number, "status": "draft"}


def _execute_notification_action(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    notification_type = payload.get("notification_type") or NotificationType.SYSTEM.value
    notification = Notification(
        type=NotificationType(notification_type),
        title=payload["title"],
        message=payload["message"],
        item_id=payload.get("item_id"),
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return {"notification_id": notification.id}


def _execute_cancel_sale_action(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    sale = db.query(Sale).filter(Sale.id == payload["sale_id"]).first()
    if not sale:
        raise ValueError("Sale not found")
    if sale.status == "cancelled":
        return {"sale_id": sale.id, "status": "already_cancelled"}

    for sale_item in sale.items:
        wh_inventory = (
            db.query(WarehouseInventory)
            .filter(WarehouseInventory.warehouse_id == sale.warehouse_id, WarehouseInventory.item_id == sale_item.item_id)
            .first()
        )
        if wh_inventory:
            wh_inventory.quantity += sale_item.quantity
        sale_item.item.quantity += sale_item.quantity

    sale.status = "cancelled"
    db.commit()
    return {"sale_id": sale.id, "sale_code": sale.sale_code, "status": "cancelled"}
