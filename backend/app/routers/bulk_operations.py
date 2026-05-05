import csv
import io
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_active_user, require_role
from app.models import (
    User, InventoryItem, Warehouse, WarehouseInventory, Supplier, Customer
)
from app.schemas import BulkImportResult

router = APIRouter(prefix="/bulk", tags=["Bulk Operations"])


@router.post("/import/items", response_model=BulkImportResult)
async def bulk_import_items(
    file: UploadFile = File(...),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    """Bulk import inventory items from CSV file"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    csv_file = io.StringIO(content.decode('utf-8'))
    reader = csv.DictReader(csv_file)

    successful = 0
    failed = 0
    errors = []
    warnings = []

    # Default warehouse if specified
    default_warehouse = None
    if warehouse_id:
        default_warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()

    for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
        try:
            # Required fields
            sku = row.get('sku', '').strip()
            name = row.get('name', '').strip()

            if not sku or not name:
                errors.append(f"Row {row_num}: SKU and name are required")
                failed += 1
                continue

            # Check if SKU exists
            existing = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
            if existing:
                warnings.append(f"Row {row_num}: SKU {sku} already exists, skipping")
                failed += 1
                continue

            # Parse values with defaults
            quantity = int(row.get('quantity', 0)) if row.get('quantity') else 0
            reorder_level = int(row.get('reorder_level', 10)) if row.get('reorder_level') else 10
            reorder_quantity = int(row.get('reorder_quantity', 50)) if row.get('reorder_quantity') else 50
            unit_price = Decimal(row.get('unit_price', '0')) if row.get('unit_price') else Decimal('0')
            cost_price = Decimal(row.get('cost_price', '0')) if row.get('cost_price') else Decimal('0')
            tax_rate = Decimal(row.get('tax_rate', '0')) if row.get('tax_rate') else Decimal('0')

            # Handle supplier
            supplier_id = None
            if row.get('supplier_code'):
                supplier = db.query(Supplier).filter(
                    Supplier.code == row['supplier_code'].strip()
                ).first()
                if supplier:
                    supplier_id = supplier.id
                else:
                    warnings.append(f"Row {row_num}: Supplier {row['supplier_code']} not found")

            # Create item
            item = InventoryItem(
                sku=sku,
                name=name,
                barcode=row.get('barcode', '').strip() or None,
                description=row.get('description', ''),
                category=row.get('category', 'general'),
                subcategory=row.get('subcategory', '').strip() or None,
                brand=row.get('brand', '').strip() or None,
                quantity=quantity,
                reorder_level=reorder_level,
                reorder_quantity=reorder_quantity,
                unit_price=unit_price,
                cost_price=cost_price,
                sale_price=Decimal(row.get('sale_price', '0')) if row.get('sale_price') else None,
                tax_rate=tax_rate,
                weight_kg=float(row.get('weight_kg', 0)) if row.get('weight_kg') else None,
                dimensions=row.get('dimensions', '').strip() or None,
                supplier_id=supplier_id,
                created_by_id=current_user.id
            )
            db.add(item)
            db.flush()

            # Create warehouse inventory entry
            if default_warehouse:
                wh_inventory = WarehouseInventory(
                    item_id=item.id,
                    warehouse_id=default_warehouse.id,
                    quantity=quantity,
                    reserved_quantity=0,
                    reorder_level=reorder_level
                )
                db.add(wh_inventory)

            successful += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            failed += 1

    db.commit()

    return BulkImportResult(
        total_rows=successful + failed,
        successful=successful,
        failed=failed,
        errors=errors,
        warnings=warnings
    )


@router.post("/import/suppliers", response_model=BulkImportResult)
async def bulk_import_suppliers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    """Bulk import suppliers from CSV file"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    csv_file = io.StringIO(content.decode('utf-8'))
    reader = csv.DictReader(csv_file)

    successful = 0
    failed = 0
    errors = []
    warnings = []

    for row_num, row in enumerate(reader, start=2):
        try:
            name = row.get('name', '').strip()
            code = row.get('code', '').strip()

            if not name:
                errors.append(f"Row {row_num}: Name is required")
                failed += 1
                continue

            # Check if code exists
            if code:
                existing = db.query(Supplier).filter(Supplier.code == code).first()
                if existing:
                    warnings.append(f"Row {row_num}: Supplier code {code} already exists, skipping")
                    failed += 1
                    continue

            supplier = Supplier(
                name=name,
                code=code,
                email=row.get('email', '').strip() or None,
                phone=row.get('phone', '').strip() or None,
                address=row.get('address', '').strip() or None,
                city=row.get('city', '').strip() or None,
                state=row.get('state', '').strip() or None,
                postal_code=row.get('postal_code', '').strip() or None,
                country=row.get('country', '').strip() or None,
                tax_id=row.get('tax_id', '').strip() or None,
                payment_terms=row.get('payment_terms', '').strip() or None,
                lead_time_days=int(row['lead_time_days']) if row.get('lead_time_days') else None
            )
            db.add(supplier)
            successful += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            failed += 1

    db.commit()

    return BulkImportResult(
        total_rows=successful + failed,
        successful=successful,
        failed=failed,
        errors=errors,
        warnings=warnings
    )


@router.post("/update/prices")
def bulk_update_prices(
    updates: List[dict],  # [{"sku": "ABC123", "unit_price": 100.00, "cost_price": 80.00}]
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    """Bulk update item prices"""
    successful = 0
    failed = 0
    errors = []

    for update in updates:
        sku = update.get('sku')
        if not sku:
            errors.append(f"SKU is required")
            failed += 1
            continue

        item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
        if not item:
            errors.append(f"Item {sku} not found")
            failed += 1
            continue

        if 'unit_price' in update:
            item.unit_price = Decimal(str(update['unit_price']))
        if 'cost_price' in update:
            item.cost_price = Decimal(str(update['cost_price']))
        if 'sale_price' in update:
            item.sale_price = Decimal(str(update['sale_price'])) if update['sale_price'] else None
        if 'tax_rate' in update:
            item.tax_rate = Decimal(str(update['tax_rate']))

        successful += 1

    db.commit()

    return BulkImportResult(
        total_rows=successful + failed,
        successful=successful,
        failed=failed,
        errors=errors,
        warnings=[]
    )


@router.post("/update/stock")
def bulk_update_stock(
    updates: List[dict],  # [{"sku": "ABC123", "warehouse_id": 1, "quantity": 100}]
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    """Bulk update stock quantities"""
    successful = 0
    failed = 0
    errors = []

    for update in updates:
        sku = update.get('sku')
        warehouse_id = update.get('warehouse_id')
        quantity = update.get('quantity')

        if not sku or warehouse_id is None or quantity is None:
            errors.append("sku, warehouse_id, and quantity are required")
            failed += 1
            continue

        item = db.query(InventoryItem).filter(InventoryItem.sku == sku).first()
        if not item:
            errors.append(f"Item {sku} not found")
            failed += 1
            continue

        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            errors.append(f"Warehouse {warehouse_id} not found")
            failed += 1
            continue

        # Get or create warehouse inventory
        wh_inventory = db.query(WarehouseInventory).filter(
            WarehouseInventory.item_id == item.id,
            WarehouseInventory.warehouse_id == warehouse_id
        ).first()

        if wh_inventory:
            wh_inventory.quantity = quantity
        else:
            wh_inventory = WarehouseInventory(
                item_id=item.id,
                warehouse_id=warehouse_id,
                quantity=quantity,
                reserved_quantity=0
            )
            db.add(wh_inventory)

        # Update total quantity
        total_qty = db.query(WarehouseInventory).filter(
            WarehouseInventory.item_id == item.id
        ).with_entities(func.sum(WarehouseInventory.quantity)).scalar() or 0

        item.quantity = int(total_qty)
        successful += 1

    db.commit()

    return BulkImportResult(
        total_rows=successful + failed,
        successful=successful,
        failed=failed,
        errors=errors,
        warnings=[]
    )


@router.post("/import/customers", response_model=BulkImportResult)
async def bulk_import_customers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("manager", "moderator")),
):
    """Bulk import customers from CSV file"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    csv_file = io.StringIO(content.decode('utf-8'))
    reader = csv.DictReader(csv_file)

    successful = 0
    failed = 0
    errors = []
    warnings = []

    for row_num, row in enumerate(reader, start=2):
        try:
            first_name = row.get('first_name', '').strip()
            last_name = row.get('last_name', '').strip()

            if not first_name or not last_name:
                errors.append(f"Row {row_num}: First name and last name are required")
                failed += 1
                continue

            # Check if email exists (if provided)
            email = row.get('email', '').strip() or None
            if email:
                existing = db.query(Customer).filter(Customer.email == email).first()
                if existing:
                    warnings.append(f"Row {row_num}: Customer with email {email} already exists, skipping")
                    failed += 1
                    continue

            # Generate customer code
            last_customer = db.query(Customer).order_by(Customer.id.desc()).first()
            next_id = (last_customer.id + 1) if last_customer else 1
            customer_code = f"CUST{next_id:06d}"

            customer = Customer(
                customer_code=customer_code,
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=row.get('phone', '').strip() or None,
                address=row.get('address', '').strip() or None,
                city=row.get('city', '').strip() or None,
                state=row.get('state', '').strip() or None,
                postal_code=row.get('postal_code', '').strip() or None,
                country=row.get('country', '').strip() or None,
                notes=row.get('notes', '').strip() or None,
                loyalty_points=int(row.get('loyalty_points', 0)) if row.get('loyalty_points') else 0,
                loyalty_tier=row.get('loyalty_tier', 'bronze').strip() or 'bronze',
                is_active=True
            )
            db.add(customer)
            successful += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            failed += 1

    db.commit()

    return BulkImportResult(
        total_rows=successful + failed,
        successful=successful,
        failed=failed,
        errors=errors,
        warnings=warnings
    )


@router.get("/export/template/{entity_type}")
def download_import_template(
    entity_type: str, # items, suppliers, customers
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Download CSV template for bulk import"""
    output = io.StringIO()
    writer = csv.writer(output)

    if entity_type == "items":
        writer.writerow([
            "sku", "name", "barcode", "description", "category", "subcategory", "brand",
            "quantity", "reorder_level", "reorder_quantity",
            "unit_price", "cost_price", "sale_price", "tax_rate",
            "weight_kg", "dimensions", "supplier_code"
        ])
        # Sample row
        writer.writerow([
            "PROD001", "Sample Product", "123456789", "Product description",
            "Electronics", "Mobile", "Apple", "100", "20", "50",
            "999.99", "750.00", "899.99", "18.00",
            "0.5", "15x8x2", "SUP001"
        ])
        filename = "items_import_template.csv"

    elif entity_type == "suppliers":
        writer.writerow([
            "code", "name", "email", "phone", "address", "city",
            "state", "postal_code", "country", "tax_id", "payment_terms", "lead_time_days"
        ])
        writer.writerow([
            "SUP001", "ABC Suppliers", "contact@abcsuppliers.com", "+91-9876543210",
            "123 Business Street", "Mumbai", "Maharashtra", "400001", "India",
            "GST123456", "Net 30", "7"
        ])
        filename = "suppliers_import_template.csv"

    elif entity_type == "customers":
        writer.writerow([
            "first_name", "last_name", "email", "phone", "address", "city",
            "state", "postal_code", "country", "loyalty_points", "loyalty_tier", "notes"
        ])
        writer.writerow([
            "John", "Doe", "john.doe@example.com", "+91-9876543210",
            "123 Main Street", "Mumbai", "Maharashtra", "400001", "India",
            "100", "bronze", "Regular customer"
        ])
        filename = "customers_import_template.csv"

    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
