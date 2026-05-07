from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============== USER SCHEMAS ==============

class UserBase(BaseModel):
    email: str
    full_name: str


class UserCreate(UserBase):
    password: str
    role: str = "user"


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


# ============== WAREHOUSE SCHEMAS ==============

class WarehouseBase(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    postal_code: Optional[str] = None
    country_code: str = "IN"
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    country_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: Optional[bool] = None


class WarehouseResponse(WarehouseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime
    item_count: int = 0


class WarehouseInventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    warehouse_id: int
    warehouse_name: str
    quantity: int
    reserved_quantity: int
    reorder_level: Optional[int]
    available_quantity: int


# ============== INVENTORY ITEM SCHEMAS ==============

class InventoryItemBase(BaseModel):
    sku: str
    barcode: Optional[str] = None
    name: str
    description: str = ""
    category: str = "general"
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    quantity: int = 0
    reorder_level: int = 10
    reorder_quantity: int = 50
    unit_price: Decimal = Decimal("0.00")
    cost_price: Decimal = Decimal("0.00")
    sale_price: Optional[Decimal] = None
    tax_rate: Decimal = Decimal("0.00")
    weight_kg: Optional[float] = None
    dimensions: Optional[str] = None
    image_url: Optional[str] = None
    image_prompt: Optional[str] = None
    expiry_date: Optional[datetime] = None
    supplier_id: Optional[int] = None


class InventoryItemCreate(InventoryItemBase):
    warehouse_quantities: Optional[List[dict]] = None  # [{"warehouse_id": 1, "quantity": 100}]


class InventoryItemUpdate(BaseModel):
    barcode: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    quantity: Optional[int] = None
    reorder_level: Optional[int] = None
    reorder_quantity: Optional[int] = None
    unit_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    weight_kg: Optional[float] = None
    dimensions: Optional[str] = None
    image_url: Optional[str] = None
    image_prompt: Optional[str] = None
    expiry_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    featured: Optional[bool] = None
    supplier_id: Optional[int] = None


class InventoryItemResponse(InventoryItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    featured: bool
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int]
    total_value: Decimal
    warehouse_inventory: List[WarehouseInventoryResponse] = []


class InventoryItemListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    category: str
    quantity: int
    reorder_level: int
    unit_price: Decimal
    is_active: bool


# ============== STOCK TRANSFER SCHEMAS ==============

class StockTransferItemCreate(BaseModel):
    item_id: int
    quantity: int


class StockTransferCreate(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    items: List[StockTransferItemCreate]
    notes: Optional[str] = None


class StockTransferItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    item_name: str
    item_sku: str
    quantity: int


class StockTransferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transfer_code: str
    from_warehouse_id: int
    from_warehouse_name: str
    to_warehouse_id: int
    to_warehouse_name: str
    status: str
    notes: Optional[str]
    items: List[StockTransferItemResponse]
    created_at: datetime
    completed_at: Optional[datetime]


# ============== SUPPLIER SCHEMAS ==============

class SupplierBase(BaseModel):
    name: str
    code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    tax_id: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    tax_id: Optional[str] = None
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    rating: Optional[Decimal] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class SupplierResponse(SupplierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rating: Decimal
    is_active: bool
    created_at: datetime
    item_count: int
    total_purchases: Decimal


class SupplierPerformanceResponse(BaseModel):
    supplier_id: int
    supplier_name: str
    total_orders: int
    total_value: Decimal
    avg_lead_time: Optional[float]
    on_time_delivery_rate: float


# ============== PURCHASE ORDER SCHEMAS ==============

class PurchaseOrderItemCreate(BaseModel):
    item_id: int
    quantity: int
    unit_price: Decimal


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    warehouse_id: int
    items: List[PurchaseOrderItemCreate]
    expected_delivery: Optional[datetime] = None
    notes: Optional[str] = None


class PurchaseOrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    item_name: str
    item_sku: str
    quantity: int
    unit_price: Decimal
    received_quantity: int
    total: Decimal


class PurchaseOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_number: str
    supplier_id: int
    supplier_name: str
    warehouse_id: int
    warehouse_name: str
    status: str
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    expected_delivery: Optional[datetime]
    actual_delivery: Optional[datetime]
    notes: Optional[str]
    items: List[PurchaseOrderItemResponse]
    created_at: datetime


class PurchaseOrderUpdate(BaseModel):
    status: Optional[str] = None
    expected_delivery: Optional[datetime] = None
    notes: Optional[str] = None


class PurchaseOrderReceiveItem(BaseModel):
    item_id: int
    quantity_received: int


class PurchaseOrderReceive(BaseModel):
    items: List[PurchaseOrderReceiveItem]
    actual_delivery: Optional[datetime] = None


# ============== CUSTOMER SCHEMAS ==============

class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    customer_code: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "India"
    date_of_birth: Optional[datetime] = None
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    loyalty_points: Optional[int] = None
    loyalty_tier: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CustomerResponse(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_code: Optional[str]
    loyalty_points: int
    loyalty_tier: str
    is_active: bool
    total_purchases: Decimal
    total_orders: int
    created_at: datetime


class CustomerPurchaseHistory(BaseModel):
    sale_id: int
    sale_code: str
    sale_date: datetime
    total_amount: Decimal
    items_count: int


# ============== SALE / POS SCHEMAS ==============

class SaleItemCreate(BaseModel):
    item_id: int
    quantity: int
    unit_price: Decimal
    discount_percent: Decimal = Decimal("0.00")


class SaleCreate(BaseModel):
    customer_id: Optional[int] = None
    warehouse_id: int
    items: List[SaleItemCreate]
    payment_method: str = "cash"
    notes: Optional[str] = None


class SaleItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    item_name: str
    item_sku: str
    quantity: int
    unit_price: Decimal
    discount_percent: Decimal
    total: Decimal


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_code: str
    customer_id: Optional[int]
    customer_name: Optional[str]
    user_id: int
    user_name: str
    warehouse_id: int
    warehouse_name: str
    status: str
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    payment_method: str
    notes: Optional[str]
    items: List[SaleItemResponse]
    created_at: datetime


class SaleListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_code: str
    customer_name: Optional[str]
    total_amount: Decimal
    payment_method: str
    status: str
    created_at: datetime


# ============== NOTIFICATION SCHEMAS ==============

class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    message: str
    item_id: Optional[int]
    item_name: Optional[str]
    is_read: bool
    created_at: datetime


class NotificationMarkRead(BaseModel):
    notification_ids: List[int]


# ============== AUDIT LOG SCHEMAS ==============

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int]
    user_name: Optional[str]
    action: str
    entity_type: str
    entity_id: Optional[int]
    old_values: Optional[dict]
    new_values: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime


# ============== DASHBOARD SCHEMAS ==============

class DashboardKPICard(BaseModel):
    title: str
    value: str
    change: Optional[str] = None
    change_type: Optional[str] = None  # "positive", "negative", "neutral"
    icon: str


class LowStockAlert(BaseModel):
    item_id: int
    sku: str
    name: str
    current_quantity: int
    reorder_level: int
    warehouse_name: str


class TopSellingItem(BaseModel):
    item_id: int
    sku: str
    name: str
    total_sold: int
    total_revenue: Decimal


class CategoryDistribution(BaseModel):
    category: str
    count: int
    value: Decimal


class SalesTrend(BaseModel):
    date: str
    sales_count: int
    revenue: Decimal


class DashboardResponse(BaseModel):
    total_inventory_value: Decimal
    total_items: int
    low_stock_count: int
    total_sales_today: int
    revenue_today: Decimal
    total_customers: int
    pending_orders: int
    kpi_cards: List[DashboardKPICard]
    low_stock_alerts: List[LowStockAlert]
    top_selling_items: List[TopSellingItem]
    category_distribution: List[CategoryDistribution]
    sales_trend: List[SalesTrend]


# ============== REPORT SCHEMAS ==============

class InventoryReportFilter(BaseModel):
    category: Optional[str] = None
    warehouse_id: Optional[int] = None
    low_stock_only: bool = False
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


class InventoryReportItem(BaseModel):
    sku: str
    name: str
    category: str
    quantity: int
    unit_price: Decimal
    total_value: Decimal
    warehouse_name: str
    supplier_name: Optional[str]


class SalesReportFilter(BaseModel):
    date_from: datetime
    date_to: datetime
    customer_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    category: Optional[str] = None


class SalesReportSummary(BaseModel):
    total_sales: int
    total_revenue: Decimal
    total_tax: Decimal
    total_discount: Decimal
    average_order_value: Decimal


class SalesReportDetail(BaseModel):
    sale_code: str
    sale_date: datetime
    customer_name: Optional[str]
    total_amount: Decimal
    item_count: int
    payment_method: str


class InventoryAgingItem(BaseModel):
    sku: str
    name: str
    category: str
    quantity: int
    days_in_stock: int
    last_sale_date: Optional[datetime]
    aging_status: str  # "fresh", "aging", "stale", "dead"


class ProfitMarginItem(BaseModel):
    sku: str
    name: str
    cost_price: Decimal
    sale_price: Decimal
    margin_percent: float
    total_sold: int
    total_profit: Decimal


class BulkImportResult(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: List[str]
    warnings: List[str]


# ============== AUTH SCHEMAS ==============

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    sub: str
    role: str


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


# ============== SUMMARY SCHEMAS ==============

class SummaryQuestionRequest(BaseModel):
    question: str


class SummaryResponse(BaseModel):
    answer: str
    source_model: Optional[str] = None


# ============== HELPDESK SCHEMAS ==============

class ChatMessageRequest(BaseModel):
    message: str
    sku: Optional[str] = None
    conversation_id: Optional[int] = None


class ChatMessageResponse(BaseModel):
    answer: str
    conversation_id: int
    source_model: Optional[str] = None
    retrieved_sources: List[dict[str, Any]] = Field(default_factory=list)


# ============== SHIPPING SCHEMAS ==============

class ShippingEstimateRequest(BaseModel):
    origin_address: str
    destination_address: str
    weight_kg: float = Field(gt=0)


class ShippingEstimateResponse(BaseModel):
    estimated_cost: Decimal
    estimated_distance_km: float
    provider: str
    map_link: Optional[str] = None


# ============== EMAIL SCHEMAS ==============

class EmailSendRequest(BaseModel):
    recipient: str
    subject: str
    body: str


# ============== CHART SCHEMAS ==============

class ChartGenerateRequest(BaseModel):
    chart_type: str  # bar, line, pie
    labels: List[str]
    values: List[float]
    title: str


# ============== MISSING SCHEMAS ==============

class BarcodeLookupResponse(BaseModel):
    query: str
    product_name: Optional[str]
    brand: Optional[str]
    categories: Optional[str]
    image_url: Optional[str]
    raw: Any


class GeocodeResult(BaseModel):
    latitude: float
    longitude: float
    display_name: str


class PostalLookupResponse(BaseModel):
    country: str
    postal_code: str
    places: List[Any]


class InventoryItemRead(InventoryItemResponse):
    pass


class InventorySummaryRequest(BaseModel):
    question: str


class InventorySummaryResponse(BaseModel):
    sku: str
    answer: str
    source_model: Optional[str] = None


class ProductImageGenerateRequest(BaseModel):
    prompt: Optional[str] = None
    steps: int = Field(default=4, ge=1, le=30)
    cfg: float = Field(default=1.0, ge=0, le=20)
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)


class ProductImageGenerateResponse(BaseModel):
    sku: str
    image_url: str
    image_prompt: str
