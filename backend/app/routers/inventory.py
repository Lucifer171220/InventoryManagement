import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
import json

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import InventoryItem, User, UserRole, Warehouse, WarehouseInventory
from app.schemas import (
    BarcodeLookupResponse,
    GeocodeResult,
    InventoryItemCreate,
    InventoryItemRead,
    InventoryItemUpdate,
    InventorySummaryRequest,
    InventorySummaryResponse,
    PostalLookupResponse,
    ProductImageGenerateRequest,
    ProductImageGenerateResponse,
    ShippingEstimateRequest,
    ShippingEstimateResponse,
)
from app.services.integrations import build_map_link, geocode_address, lookup_barcode, lookup_postal_code, route_distance_km
from app.services.ollama_service import generate_response, generate_response_stream, choose_best_model
from app.services.comfyui_service import ComfyUIError, build_product_prompt, check_comfyui_ready, generate_product_image


router = APIRouter(prefix="/inventory", tags=["inventory"])


def build_inventory_summary_prompt(item: InventoryItem, question: str, current_user: User) -> str:
    supplier_name = item.supplier.name if item.supplier else "Not assigned"
    warehouse_locations = [
        f"{stock.warehouse.name}: {stock.quantity}"
        for stock in item.warehouse_inventory
        if stock.warehouse
    ]
    warehouse_summary = ", ".join(warehouse_locations) if warehouse_locations else "Not assigned"
    return f"""
User role: {current_user.role.value}
Question: {question}

Inventory item:
- SKU: {item.sku}
- Name: {item.name}
- Category: {item.category}
- Quantity: {item.quantity}
- Reorder level: {item.reorder_level}
- Unit price: {item.unit_price}
- Warehouse stock: {warehouse_summary}
- Supplier: {supplier_name}
- Description: {item.description}

Answer specifically and keep the summary actionable for inventory operations.
"""


INVENTORY_SUMMARY_SYSTEM = (
    "You are an inventory assistant. Answer with concrete operational guidance. "
    "If stock is low, explicitly say so. If the user asks about an SKU or item, summarize the facts first."
)


@router.get("", response_model=list[InventoryItemRead])
def list_items(
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(InventoryItem).filter(InventoryItem.is_active == True)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                InventoryItem.sku.like(term),
                InventoryItem.name.like(term),
                InventoryItem.category.like(term),
                InventoryItem.description.like(term),
            )
        )
    return query.order_by(InventoryItem.updated_at.desc()).all()


@router.post("", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.MODERATOR, UserRole.MANAGER)),
):
    existing = db.query(InventoryItem).filter(InventoryItem.sku == payload.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    item_data = payload.model_dump(exclude={"warehouse_quantities"})
    item = InventoryItem(**item_data, created_by_id=current_user.id)
    db.add(item)
    db.flush()
    for warehouse_quantity in payload.warehouse_quantities or []:
        warehouse_id = warehouse_quantity.get("warehouse_id")
        quantity = int(warehouse_quantity.get("quantity", 0))
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail=f"Warehouse {warehouse_id} not found")
        db.add(
            WarehouseInventory(
                item_id=item.id,
                warehouse_id=warehouse_id,
                quantity=quantity,
                reserved_quantity=0,
            )
        )
    if payload.warehouse_quantities:
        item.quantity = sum(int(entry.get("quantity", 0)) for entry in payload.warehouse_quantities)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{sku}", response_model=InventoryItemRead)
def get_item(sku: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(
        InventoryItem.sku == sku,
        InventoryItem.is_active == True,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/{sku}", response_model=InventoryItemRead)
def update_item(
    sku: str,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.MODERATOR, UserRole.MANAGER)),
):
    item = db.query(InventoryItem).filter(
        InventoryItem.sku == sku,
        InventoryItem.is_active == True,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{sku}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    sku: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.MANAGER)),
):
    item = db.query(InventoryItem).filter(
        InventoryItem.sku == sku,
        InventoryItem.is_active == True,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_active = False
    db.commit()


@router.post("/{sku}/summary", response_model=InventorySummaryResponse)
async def summarize_item(
    sku: str,
    payload: InventorySummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    prompt = build_inventory_summary_prompt(item=item, question=payload.question, current_user=current_user)
    answer, source_model = await generate_response(prompt=prompt, system=INVENTORY_SUMMARY_SYSTEM)
    return InventorySummaryResponse(sku=sku, answer=answer, source_model=source_model)


@router.post("/{sku}/summary/stream")
async def summarize_item_stream(
    sku: str,
    payload: InventorySummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    prompt = build_inventory_summary_prompt(item=item, question=payload.question, current_user=current_user)
    source_model = choose_best_model()

    async def event_generator():
        async for chunk in generate_response_stream(prompt=prompt, system=INVENTORY_SUMMARY_SYSTEM):
            if chunk.startswith("\n[model:"):
                continue
            yield f"data: {json.dumps({'chunk': chunk, 'sku': sku})}\n\n"
        yield f"data: {json.dumps({'done': True, 'sku': sku, 'source_model': source_model})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{sku}/image", response_model=ProductImageGenerateResponse)
async def generate_item_image(
    sku: str,
    payload: ProductImageGenerateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.MODERATOR, UserRole.MANAGER)),
):
    item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    prompt = payload.prompt or build_product_prompt(item)
    try:
        image_url, image_prompt = await generate_product_image(
            item=item,
            prompt=prompt,
            steps=payload.steps,
            cfg=payload.cfg,
            width=payload.width,
            height=payload.height,
        )
    except ComfyUIError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"ComfyUI is unavailable: {exc}") from exc

    item.image_url = image_url
    item.image_prompt = image_prompt
    db.commit()
    db.refresh(item)
    return ProductImageGenerateResponse(sku=item.sku, image_url=image_url, image_prompt=image_prompt)


@router.get("/image/status/comfyui")
async def comfyui_image_status(_: User = Depends(get_current_user)):
    return await check_comfyui_ready()


@router.get("/lookup/postal/{country_code}/{postal_code}", response_model=PostalLookupResponse)
async def postal_lookup(country_code: str, postal_code: str, _: User = Depends(get_current_user)):
    data = await lookup_postal_code(country_code, postal_code)
    return PostalLookupResponse(
        country=data.get("country", ""),
        postal_code=data.get("post code", postal_code),
        places=data.get("places", []),
    )


@router.api_route("/lookup/geocode", methods=["GET", "POST"], response_model=GeocodeResult)
async def geocode_lookup(
    request: Request,
    address: str | None = Query(default=None, min_length=3),
    body: dict | None = Body(default=None),
    _: User = Depends(get_current_user),
):
    if not address and request.method == "POST":
        if body and isinstance(body, dict):
            address = body.get("address")
        if not address:
            form = await request.form()
            address = form.get("address")

    if not address:
        raise HTTPException(status_code=422, detail="Address is required")

    data = await geocode_address(address)
    # If full address yields no result (e.g., includes postal code that Nominatim cannot parse),
    # fall back to a simpler query using only the first part of the address.
    if not data:
        fallback = address.split(",")[0].strip()
        if fallback and fallback != address:
            data = await geocode_address(fallback)
    if not data:
        raise HTTPException(status_code=404, detail="Location not found")
    return GeocodeResult(
        latitude=float(data["lat"]),
        longitude=float(data["lon"]),
        display_name=data.get("display_name", address),
    )


@router.get("/lookup/barcode/{barcode}", response_model=BarcodeLookupResponse)
async def barcode_lookup(barcode: str, _: User = Depends(get_current_user)):
    data = await lookup_barcode(barcode)
    product = data.get("product", {}) if isinstance(data, dict) else {}
    return BarcodeLookupResponse(
        query=barcode,
        product_name=product.get("product_name"),
        brand=product.get("brands"),
        categories=product.get("categories"),
        image_url=product.get("image_url"),
        raw=data,
    )


@router.post("/shipping/estimate", response_model=ShippingEstimateResponse)
async def estimate_shipping(payload: ShippingEstimateRequest, _: User = Depends(get_current_user)):
    origin_lat = payload.origin_latitude
    origin_lng = payload.origin_longitude
    destination_lat = payload.destination_latitude
    destination_lng = payload.destination_longitude

    if payload.origin_address and (origin_lat is None or origin_lng is None):
        origin = await geocode_address(payload.origin_address)
        if origin:
            origin_lat, origin_lng = float(origin["lat"]), float(origin["lon"])

    if payload.destination_address and (destination_lat is None or destination_lng is None):
        destination = await geocode_address(payload.destination_address)
        if destination:
            destination_lat, destination_lng = float(destination["lat"]), float(destination["lon"])

    if None in (origin_lat, origin_lng, destination_lat, destination_lng):
        raise HTTPException(status_code=400, detail="Unable to resolve route coordinates")

    distance_km, provider = await route_distance_km(origin_lat, origin_lng, destination_lat, destination_lng)
    estimated_cost = round(6.5 + (distance_km * 0.42) + (payload.weight_kg * 1.85), 2)
    return ShippingEstimateResponse(
        estimated_cost=estimated_cost,
        estimated_distance_km=distance_km,
        provider=provider,
        map_link=build_map_link(destination_lat, destination_lng),
    )
