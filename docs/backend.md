# Backend Documentation - AI Inventory Manager

## Overview

This is a **FastAPI-based backend** for a comprehensive retail inventory management system with AI-powered features. The backend provides RESTful APIs for inventory management, POS (Point of Sale), customer relationship management, supplier management, multi-warehouse operations, and intelligent automation through AI agents.

**Tech Stack:**
- **Framework:** FastAPI (Python)
- **Database:** Microsoft SQL Server (via SQLAlchemy ORM)
- **Authentication:** JWT (JSON Web Tokens) with bcrypt password hashing
- **AI Integration:** Ollama for LLM-based summaries and recommendations
- **Image Generation:** ComfyUI for product image generation
- **External APIs:** OpenStreetMap/Nominatim for geocoding, OpenRouteService for distance calculations

---

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration and environment settings
│   ├── database.py          # Database connection and session management
│   ├── models.py            # SQLAlchemy ORM models (database schema)
│   ├── schemas.py           # Pydantic schemas for request/response validation
│   ├── security.py          # Password hashing and JWT token handling
│   ├── deps.py              # Dependency injection (auth, user roles)
│   ├── routers/             # API route handlers (organized by domain)
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── inventory.py     # Inventory management
│   │   ├── sales.py         # POS and sales operations
│   │   ├── customers.py     # Customer management
│   │   ├── suppliers.py     # Supplier management
│   │   ├── purchase_orders.py # Purchase order management
│   │   ├── warehouses.py    # Warehouse management
│   │   ├── reports.py       # Reporting and analytics
│   │   ├── dashboard.py     # Dashboard KPIs
│   │   ├── notifications.py # Notification system
│   │   ├── audit.py         # Audit logging
│   │   ├── agents.py        # AI agent automation
│   │   ├── helpdesk.py      # AI helpdesk chatbot
│   │   ├── email.py         # Email sending
│   │   ├── chart.py         # Chart generation
│   │   └── bulk_operations.py # Bulk import/export
│   └── services/            # Business logic and external integrations
│       ├── agent_service.py # AI agent workflows
│       ├── ollama_service.py # LLM interaction
│       ├── comfyui_service.py # Image generation
│       ├── chart_service.py # Chart generation
│       ├── email_service.py # Email sending
│       └── integrations.py  # Third-party API integrations
├── alembic/                 # Database migrations
├── requirements.txt         # Python dependencies
└── test_api.py             # API tests
```

---

## Core Components

### 1. Main Application (`app/main.py`)

The FastAPI application is configured with:
- **CORS middleware** for frontend communication
- **Exception handlers** for SQLAlchemy and general errors
- **Static file serving** for generated charts/images
- **Router registration** for all API endpoints
- **Lifespan events** for database initialization and seeding default users

**Key Features:**
- Automatic database table creation on startup
- Seeds 3 default users (manager, moderator, user)
- Global error handling with proper CORS headers
- Health check endpoints for monitoring

### 2. Configuration (`app/config.py`)

Uses Pydantic Settings for environment-based configuration:

```python
class Settings(BaseSettings):
    app_name: str = "AI Inventory Manager"
    api_prefix: str = "/api"
    database_url: str  # MSSQL connection string
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    cors_origins: str = "http://localhost:5173"
    ollama_base_url: str = "http://127.0.0.1:11434"
    comfyui_base_url: str = "http://127.0.0.1:8188"
    # ... more settings
```

**Environment Variables:**
- All configuration can be overridden via `.env` file or environment variables
- Database connection uses Windows Authentication (trusted_connection)
- Ollama and ComfyUI URLs are configurable for remote AI services

### 3. Database Models (`app/models.py`)

**Core Entities:**

1. **User** - System users with role-based access
   - Roles: `user`, `moderator`, `manager`
   - Fields: email, full_name, hashed_password, role, is_active

2. **InventoryItem** - Product catalog
   - SKU (unique), barcode, name, description
   - Pricing: unit_price, cost_price, sale_price
   - Stock management: quantity, reorder_level, reorder_quantity
   - Metadata: category, subcategory, brand, supplier_id
   - AI features: image_url, image_prompt

3. **Warehouse** - Storage locations
   - Code (unique), name, address, geolocation
   - Tracks inventory per warehouse

4. **WarehouseInventory** - Junction table for item-warehouse stock
   - Tracks quantity and reserved_quantity per warehouse

5. **Supplier** - Vendor information
   - Contact details, tax_id, payment_terms, lead_time_days
   - Performance tracking: rating

6. **PurchaseOrder** - Procurement orders
   - Status workflow: draft → sent → confirmed → partial → received → cancelled
   - Links to supplier and warehouse

7. **Customer** - Customer records
   - Loyalty program: points, tier
   - Contact and address information

8. **Sale** - POS transactions
   - Unique sale_code per day
   - Links to customer, warehouse, user
   - Status: pending, completed, cancelled, refunded

9. **SaleItem** - Line items in a sale
   - Tracks quantity, unit_price, discount_percent

10. **StockTransfer** - Inter-warehouse transfers
    - Status workflow: pending → in_transit → completed/cancelled

11. **Notification** - System alerts
    - Types: low_stock, expiry_warning, order_received, etc.

12. **AuditLog** - Action tracking
    - Records all CRUD operations with old/new values

13. **AgentMemory** - AI conversation history
    - Stores user interactions with AI agents

14. **AgentAction** - Pending AI-suggested actions
    - Status: pending, approved, rejected, failed
    - Requires human approval for execution

15. **HelpdeskConversation/HelpdeskMessage** - AI chatbot history

### 4. Pydantic Schemas (`app/schemas.py`)

**Schema Patterns:**
- `*Base` - Common fields
- `*Create` - For POST requests
- `*Update` - For PUT/PATCH requests (all fields optional)
- `*Response` - For API responses (includes computed fields)

**Key Schemas:**
- User management: `UserCreate`, `UserResponse`, `TokenResponse`
- Inventory: `InventoryItemCreate`, `InventoryItemResponse`, `InventoryItemListResponse`
- Sales: `SaleCreate`, `SaleResponse`, `SaleListResponse`
- Reports: `InventoryReportItem`, `SalesReportSummary`, `InventoryAgingItem`
- AI: `ChatMessageResponse`, `SummaryResponse`

### 5. Security (`app/security.py`)

**Authentication Flow:**
1. User submits credentials to `/api/auth/login`
2. Backend validates against stored hash
3. JWT token generated with user ID and role
4. Token stored in frontend localStorage
5. Subsequent requests include `Authorization: Bearer <token>`

**Password Handling:**
- Hashed with bcrypt via `passlib`
- Plain text passwords never stored

**JWT Token:**
- Contains: `sub` (user ID), `role`, `exp` (expiration)
- Validated on protected endpoints
- 120-minute expiration (configurable)

---

## API Routers

### Authentication (`/api/auth`)
- `POST /login` - Authenticate and get JWT token
- `POST /logout` - Invalidate token (client-side)
- `GET /users/me` - Get current user profile

### Inventory Management (`/api/inventory`)
- `GET /` - List all items (with search filter)
- `POST /` - Create new item (moderator+ only)
- `GET /{sku}` - Get item details
- `PUT /{sku}` - Update item (moderator+ only)
- `DELETE /{sku}` - Soft delete item (manager only)
- `POST /{sku}/summary` - AI-powered item summary
- `POST /{sku}/summary/stream` - Streaming AI summary
- `POST /{sku}/image` - Generate product image via ComfyUI
- `GET /lookup/barcode/{barcode}` - Barcode lookup
- `GET /lookup/postal/{country}/{postal}` - Postal code lookup
- `POST /shipping/estimate` - Calculate shipping cost

### Sales/POS (`/api/sales`)
- `GET /` - List sales (with filters)
- `POST /` - Create new sale
- `GET /{id}` - Get sale details
- `POST /{id}/cancel` - Cancel sale (manager/moderator only)
- `GET /stats/daily` - Daily sales statistics

### Customers (`/api/customers`)
- `GET /` - List customers
- `POST /` - Create customer
- `GET /{id}` - Get customer details
- `PUT /{id}` - Update customer
- `DELETE /{id}` - Deactivate customer
- `GET /{id}/sales` - Get customer purchase history

### Suppliers (`/api/suppliers`)
- `GET /` - List suppliers
- `POST /` - Create supplier
- `GET /{id}` - Get supplier details
- `PUT /{id}` - Update supplier
- `DELETE /{id}` - Deactivate supplier
- `GET /{id}/performance` - Supplier performance metrics

### Purchase Orders (`/api/purchase-orders`)
- `GET /` - List POs
- `POST /` - Create PO
- `GET /{id}` - Get PO details
- `PUT /{id}` - Update PO
- `POST /{id}/receive` - Receive items from PO
- `PUT /{id}/status` - Update PO status

### Warehouses (`/api/warehouses`)`)
- `GET /` - List warehouses
- `POST /` - Create warehouse
- `GET /{id}` - Get warehouse details
- `PUT /{id}` - Update warehouse
- `DELETE /{id}` - Deactivate warehouse
- `POST /{id}/stock` - Update stock levels
- `POST /transfers` - Create stock transfer

### Reports (`/api/reports`)
- `GET /inventory` - Inventory report
- `GET /sales` - Sales report
- `GET /aging` - Inventory aging report
- `GET /profit-margins` - Profit margin analysis

### Dashboard (`/api/dashboard`)
- `GET /` - Dashboard data with KPIs
- Includes: inventory value, low stock alerts, top sellers, sales trends

### Notifications (`/api/notifications`)
- `GET /` - List notifications
- `GET /unread-count` - Count unread notifications
- `POST /mark-read` - Mark notifications as read
- `DELETE /{id}` - Delete notification

### AI Agents (`/api/agents`)
- `POST /run` - Run agentic automation workflow
- `POST /workflow` - Run conversational workflow
- `GET /actions` - List pending actions
- `POST /actions/{id}/approve` - Approve action
- `POST /actions/{id}/reject` - Reject action

### Helpdesk (`/api/helpdesk`)
- `POST /chat` - Chat with AI assistant
- `POST /chat/stream` - Streaming chat response

### Email (`/api/email`)
- `POST /send` - Send email via SMTP

### Charts (`/api/chart`)
- `POST /generate` - Generate chart image
- Supports: bar, line, pie charts

### Bulk Operations (`/api/bulk`)
- `POST /import` - Bulk import from CSV/Excel
- `GET /export` - Export data

### Audit (`/api/audit`)
- `GET /` - List audit logs
- Filter by user, action, entity, date range

---

## Services Layer

### 1. Agent Service (`app/services/agent_service.py`)

**Purpose:** Implements AI-driven automation workflows

**Key Agents:**
- **Inventory Agent:** Monitors stock levels, suggests reorders
- **Warehouse Agent:** Tracks reserved stock, identifies blocked inventory
- **Sales Agent:** Analyzes sales trends, identifies top sellers
- **Supplier Agent:** Monitors purchase orders, flags overdue deliveries
- **Executive Agent:** Synthesizes insights from all agents

**Workflows:**
- **Smart Inventory Workflow:** Analyzes message intent, finds relevant items, suggests restock quantities
- **Customer Support Workflow:** Looks up sale/PO status, handles refund/cancellation requests
- **Sales Optimization Workflow:** Identifies top performers, suggests campaigns

**Human-in-the-Loop:**
- All agent-suggested actions require approval
- Actions stored as `AgentAction` with status `pending`
- Managers/moderators can approve or reject

### 2. Ollama Service (`app/services/ollama_service.py`)

**Purpose:** LLM integration for natural language processing

**Features:**
- Model selection with priority and fallback
- Streaming responses for real-time generation
- Context-aware prompts for inventory domain

**Models Used:**
- Primary: `gpt-oss:latest`
- Fallbacks: `gemma4:latest`, `qwen3.6:latest`

### 3. ComfyUI Service (`app/services/comfyui_service.py`)

**Purpose:** AI image generation for products

**Workflow:**
1. Build prompt from item details (name, category, brand, description)
2. Send to ComfyUI API with workflow JSON
3. Poll for completion
4. Save generated image to static folder
5. Update item with image_url

**Configuration:**
- Base URL: `http://127.0.0.1:8188`
- Timeout: 180 seconds
- Workflow: Custom JSON workflow for product photography

### 4. Integrations (`app/services/integrations.py`)

**External APIs:**
- **OpenStreetMap Nominatim:** Geocoding addresses
- **OpenRouteService:** Distance calculations, route planning
- **OpenBarcodeLookup:** Product lookup by barcode

### 5. Chart Service (`app/services/chart_service.py`)

**Purpose:** Generate visual charts using matplotlib

**Chart Types:**
- Bar charts
- Line charts
- Pie charts

**Output:** PNG images saved to static folder

---

## Database Schema

### Key Relationships:
```
User (1) ──── (M) InventoryItem (created_by)
User (1) ──── (M) Sale
User (1) ──── (M) PurchaseOrder
User (1) ──── (M) AuditLog

InventoryItem (1) ──── (M) SaleItem
InventoryItem (1) ──── (M) PurchaseOrderItem
InventoryItem (1) ──── (M) WarehouseInventory
InventoryItem (1) ──── (M) StockTransferItem

Warehouse (1) ──── (M) WarehouseInventory
Warehouse (1) ──── (M) StockTransfer (from/to)

Supplier (1) ──── (M) InventoryItem
Supplier (1) ──── (M) PurchaseOrder

Customer (1) ──── (M) Sale
```

### Soft Delete Pattern:
- Most entities use `is_active` flag instead of physical deletion
- Preserves historical data integrity
- Filters applied in queries: `filter(Entity.is_active == True)`

---

## Role-Based Access Control (RBAC)

### User Roles:
1. **user** - Basic access
   - View inventory, sales, customers
   - Create sales (POS)
   - View reports

2. **moderator** - Operational management
   - All user permissions
   - Create/update inventory items
   - Manage purchase orders
   - Approve agent actions

3. **manager** - Full access
   - All moderator permissions
   - Delete inventory items
   - Cancel sales
   - Bulk import/export
   - User management

### Dependency Injectors:
```python
get_current_user() - Requires valid JWT
require_role("manager") - Requires specific role
require_roles(UserRole.MODERATOR, UserRole.MANAGER) - Multiple roles
```

---

## AI-Powered Features

### 1. Product Summary Generation
- **Endpoint:** `POST /api/inventory/{sku}/summary/stream`
- **Use Case:** Generate operational insights for inventory items
- **Prompt Engineering:** Includes stock levels, warehouse distribution, supplier info
- **Output:** Actionable recommendations (e.g., "Reorder 50 units - stock below reorder level")

### 2. Helpdesk Chatbot
- **Endpoint:** `POST /api/helpdesk/chat/stream`
- **Use Case:** Natural language Q&A about inventory, sales, system usage
- **Context:** Includes recent conversation history
- **Streaming:** Real-time token generation

### 3. Agentic Automation
- **Endpoint:** `POST /api/agents/workflow`
- **Use Case:** Automated monitoring and recommendations
- **Agents:** Inventory, Warehouse, Sales, Supplier, Executive
- **Human Oversight:** All actions require approval

### 4. Product Image Generation
- **Endpoint:** `POST /api/inventory/{sku}/image`
- **Use Case:** Generate product photos from text descriptions
- **Integration:** ComfyUI with custom workflow
- **Prompt:** Auto-generated from item metadata

---

## Error Handling

### Global Exception Handlers:
1. **SQLAlchemyError** - Database errors
2. **Exception** - Catch-all for unhandled exceptions
3. **HTTPException** - FastAPI standard errors

### Error Response Format:
```json
{
  "detail": "Database error",
  "message": "A database error occurred. Please try again."
}
```

### CORS Handling:
- Custom middleware ensures CORS headers on ALL responses (including errors)
- Handles preflight OPTIONS requests
- Configurable allowed origins

---

## Testing

### Test Files:
- `test_api.py` - API endpoint tests
- `test_warehouse.py` - Warehouse-specific tests

### Test Coverage:
- Authentication flow
- CRUD operations
- Role-based access
- Business logic (e.g., stock calculations)

---

## Deployment Considerations

### Environment Variables:
```bash
DATABASE_URL=mssql+pyodbc://...
JWT_SECRET_KEY=<secure-random-string>
CORS_ORIGINS=http://localhost:5173
OLLAMA_BASE_URL=http://localhost:11434
COMFYUI_BASE_URL=http://localhost:8188
SMTP_HOST=smtp.example.com
SMTP_USER=user@example.com
SMTP_PASSWORD=<password>
```

### Database Migrations:
- Uses Alembic for schema migrations
- Migration scripts in `alembic/versions/`
- Auto-run on startup (development only)

### Static Files:
- Generated charts stored in `app/static/`
- Product images stored in `app/static/`
- Served via FastAPI StaticFiles

---

## Key Business Logic

### 1. Stock Management:
- **Total Quantity:** Sum across all warehouses
- **Available Quantity:** Total - Reserved
- **Reorder Trigger:** When quantity <= reorder_level

### 2. Sales Calculation:
```python
item_subtotal = unit_price * quantity
item_discount = item_subtotal * (discount_percent / 100)
item_tax = (item_subtotal - item_discount) * (tax_rate / 100)
item_total = item_subtotal - item_discount + item_tax
```

### 3. Purchase Order Workflow:
1. Create as `draft`
2. Send to supplier → `sent`
3. Supplier confirms → `confirmed`
4. Partial receipt → `partial`
5. Full receipt → `received`

### 4. Loyalty Points:
- Earned: 1 point per ₹100 spent
- Deducted on sale cancellation
- Tiers: bronze, silver, gold, platinum

---

## Performance Optimizations

### Database:
- Indexed fields: `sku`, `email`, `created_at`, `category`
- Eager loading for relationships
- Bulk operations for imports

### Caching:
- Settings cached with `@lru_cache`
- Consider Redis for frequently accessed data

### Async Operations:
- HTTP client (httpx) for external API calls
- Streaming responses for AI generation

---

## Security Considerations

### Implemented:
- ✅ Password hashing with bcrypt
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ CORS configuration
- ✅ SQL injection prevention (SQLAlchemy ORM)
- ✅ Input validation (Pydantic)

### Recommendations:
- [ ] Rate limiting on authentication endpoints
- [ ] API key for external integrations
- [ ] Audit log for sensitive operations
- [ ] HTTPS in production
- [ ] Secret management (e.g., Azure Key Vault, AWS Secrets Manager)

---

## Troubleshooting

### Common Issues:

1. **Database Connection Failed:**
   - Check SQL Server is running
   - Verify connection string in `.env`
   - Ensure ODBC Driver 18 is installed

2. **Ollama Unavailable:**
   - Verify Ollama service is running
   - Check `OLLAMA_BASE_URL` configuration
   - Fallback models will be used if primary fails

3. **ComfyUI Timeout:**
   - Increase `COMFYUI_TIMEOUT_SECONDS`
   - Check ComfyUI server resources
   - Verify workflow JSON is valid

4. **CORS Errors:**
   - Check `CORS_ORIGINS` includes frontend URL
   - Verify middleware order in `main.py`

---

## Future Enhancements

### Planned Features:
- [ ] Multi-currency support
- [ ] Advanced reporting (PDF export)
- [ ] Mobile app integration
- [ ] Barcode scanner integration
- [ ] Email notifications for low stock
- [ ] Automated reorder suggestions
- [ ] Integration with accounting software
- [ ] Multi-language support

### Technical Improvements:
- [ ] Redis caching layer
- [ ] WebSocket for real-time updates
- [ ] Background task processing (Celery)
- [ ] API versioning
- [ ] OpenAPI documentation customization
- [ ] Performance profiling and optimization
