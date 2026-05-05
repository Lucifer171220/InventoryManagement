# Code Flow Handoff Guide

This document explains the project in simple terms so a new developer can understand how the frontend and backend work together.

## 1. What This Project Is

This is an AI-assisted inventory management system.

It has:

- A React frontend in `frontend/`
- a FastAPI backend in `backend/`
- a SQL database accessed through SQLAlchemy models
- optional AI services for summaries, helpdesk chat, charting, and product images

The main business areas are:

- login and user roles
- inventory products
- warehouses and stock quantities
- suppliers
- customers
- point of sale
- purchase orders
- reports
- notifications
- AI helpdesk and automation

## 2. High-Level Request Flow

Most app actions follow this path:

1. User clicks something in the React UI.
2. A React page calls `fetch()` through a local `request()` helper.
3. The request goes to the backend API at `http://localhost:8000/api/...`.
4. FastAPI routes validate the request body with Pydantic schemas.
5. The route reads or writes database rows with SQLAlchemy models.
6. The backend returns JSON.
7. React saves that JSON into component state with `useState`.
8. The UI re-renders.

Example:

```text
Inventory page -> PUT /api/inventory/{sku} -> inventory router -> InventoryItem model -> database -> JSON response -> React state update
```

## 3. Frontend Overview

The frontend is a Vite React app.

Important files:

- `frontend/src/main.jsx`: starts React and renders `<App />`
- `frontend/src/App.jsx`: main application shell, login, navigation, inventory page, AI helpdesk, email/chart tabs
- `frontend/src/styles.css`: global styling for the whole app
- `frontend/src/pages/*.jsx`: feature pages such as POS, customers, suppliers, reports, warehouses
- `frontend/src/components/*.jsx`: reusable components such as email form and chart builder

The frontend talks to the backend using:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
```

If no environment variable is set, it uses the local backend on port `8000`.

## 4. Frontend Startup Flow

The startup path is:

```text
index.html
  -> frontend/src/main.jsx
    -> frontend/src/App.jsx
```

`main.jsx` imports `App` and `styles.css`, then mounts the app into:

```html
<div id="root"></div>
```

`App.jsx` controls the overall experience:

- checks `localStorage` for a saved JWT token
- loads the logged-in profile
- loads inventory and notification count
- shows login screen if the user is not authenticated
- shows sidebar navigation after login
- switches pages based on `activeTab`

## 5. Frontend Auth Flow

Login happens inside `App.jsx`.

Flow:

1. User enters email/password.
2. `handleLogin()` calls `POST /api/auth/login`.
3. Backend returns an access token.
4. Token is saved in React state and `localStorage` as `inventory_token`.
5. Future requests include:

```js
Authorization: Bearer <token>
```

If the backend says the token is invalid, `handleAuthError()` clears the session and sends the user back to login.

Default seeded users are created by the backend:

- `manager@inventory.local`
- `moderator@inventory.local`
- `user@inventory.local`

Default password:

```text
ChangeMe123!
```

## 6. Frontend Navigation Flow

The sidebar lives in `App.jsx`.

Each button sets:

```js
setActiveTab("inventory")
```

Then the main content renders a page depending on `activeTab`.

Examples:

- `dashboard` renders `Dashboard`
- `pos` renders `POS`
- `customers` renders `Customers`
- `suppliers` renders `Suppliers`
- `purchaseOrders` renders `PurchaseOrders`
- `warehouses` renders `Warehouses`
- `reports` renders `Reports`
- `notifications` renders `Notifications`
- `bulkImport` renders `BulkImport`
- `agents` renders `AgentAutomation`
- `inventory` is rendered directly inside `App.jsx`

## 7. Frontend Inventory Flow

The inventory page is mostly inside `frontend/src/App.jsx`.

Main state:

```js
items              // all products loaded from backend
selectedSku        // selected product SKU
itemForm           // add-product form
editItemForm       // edit-product form
isEditingItem      // whether product details are in edit mode
summary            // AI summary answer
```

Important functions:

- `loadItems()`: gets products from `GET /api/inventory`
- `handleCreateItem()`: creates product with `POST /api/inventory`
- `handleUpdateItem()`: updates product with `PUT /api/inventory/{sku}`
- `handleDeleteItem()`: deletes product with `DELETE /api/inventory/{sku}`
- `askSummary()`: streams AI product summary from `/api/inventory/{sku}/summary/stream`
- `generateProductImage()`: generates image through `/api/inventory/{sku}/image`

The inventory list shows product cards. Clicking a card updates `selectedSku`.

The details panel shows:

- product image or placeholder
- SKU, category, brand, quantity, prices
- description
- AI summary box
- edit button for moderators and managers
- delete button for managers only

## 8. Frontend Page Pattern

Most page files use the same simple pattern:

1. Define `API_BASE_URL`.
2. Define a local `request()` helper.
3. Store data with `useState`.
4. Load data in `useEffect`.
5. Render forms, tables, and cards.
6. Call backend routes when user submits or clicks.

Example from POS:

```text
POS.jsx loads inventory, customers, and warehouses.
User adds products to cart.
User clicks complete sale.
Frontend sends POST /api/sales/.
Backend creates sale and reduces inventory.
Frontend clears cart and shows result.
```

## 9. Backend Overview

The backend is a FastAPI app.

Important files:

- `backend/app/main.py`: creates FastAPI app, mounts static files, adds CORS, includes routers
- `backend/app/config.py`: app settings from `.env`
- `backend/app/database.py`: SQLAlchemy engine and DB session
- `backend/app/models.py`: database tables
- `backend/app/schemas.py`: request and response shapes
- `backend/app/deps.py`: auth and role dependencies
- `backend/app/security.py`: password hashing and JWT helpers
- `backend/app/routers/*.py`: API endpoints
- `backend/app/services/*.py`: integrations and AI/service logic

## 10. Backend Startup Flow

The backend starts from:

```text
backend/app/main.py
```

When the app starts:

1. FastAPI creates the app.
2. SQLAlchemy creates missing tables with `Base.metadata.create_all(bind=engine)`.
3. Default users are seeded if `seed_default_users` is enabled.
4. Static files are mounted at `/api/static`.
5. CORS middleware is added.
6. Routers are included under `/api`.

Example:

```py
app.include_router(inventory.router, prefix=settings.api_prefix)
```

Since `settings.api_prefix` is `/api`, the inventory router becomes:

```text
/api/inventory
```

## 11. Backend Settings

Settings live in `backend/app/config.py`.

They are loaded from environment variables or `backend/.env`.

Important settings:

- `database_url`: database connection string
- `jwt_secret_key`: secret used to sign login tokens
- `cors_origins`: frontend URLs allowed to call the backend
- `ollama_base_url`: local AI text model endpoint
- `comfyui_base_url`: local image generation endpoint
- `openrouteservice_api_key`: optional shipping/distance integration

## 12. Backend Database Flow

Database setup is in `backend/app/database.py`.

Main pieces:

- `engine`: database connection
- `SessionLocal`: creates DB sessions
- `get_db()`: FastAPI dependency that opens and closes a DB session per request

Most routes receive a database session like this:

```py
def list_items(db: Session = Depends(get_db)):
```

That means every request gets its own database session.

## 13. Backend Models

Database tables are Python classes in `backend/app/models.py`.

Important models:

- `User`: login users and roles
- `InventoryItem`: products
- `Warehouse`: warehouse records
- `WarehouseInventory`: product quantity per warehouse
- `Supplier`: supplier records
- `PurchaseOrder` and `PurchaseOrderItem`: purchase orders
- `Customer`: customer records
- `Sale` and `SaleItem`: POS sales
- `Notification`: alerts such as low-stock warnings
- `AuditLog`: audit trail
- `HelpdeskConversation` and `HelpdeskMessage`: AI helpdesk history
- `AgentMemory` and `AgentAction`: agent automation data

The most important relationship is:

```text
InventoryItem
  -> WarehouseInventory
  -> Warehouse
```

Total product quantity is stored on `InventoryItem.quantity`.
Per-warehouse quantity is stored on `WarehouseInventory.quantity`.

## 14. Backend Schemas

Schemas live in `backend/app/schemas.py`.

They are Pydantic models used for:

- validating request bodies
- controlling response JSON
- documenting API shapes

Example:

- `InventoryItemCreate`: data needed to create a product
- `InventoryItemUpdate`: data allowed when editing a product
- `InventoryItemResponse`: data returned to frontend

Simple rule:

```text
models.py = database shape
schemas.py = API JSON shape
```

## 15. Backend Auth And Roles

Auth helpers are in:

- `backend/app/security.py`
- `backend/app/deps.py`
- `backend/app/routers/auth.py`

Login flow:

1. Frontend sends email and password to `POST /api/auth/login`.
2. Backend finds the user.
3. Backend checks password with bcrypt.
4. Backend creates a JWT token.
5. Frontend sends that token on future requests.

Protected routes use:

```py
Depends(get_current_user)
```

Role-protected routes use:

```py
Depends(require_roles(UserRole.MODERATOR, UserRole.MANAGER))
```

Common role meaning:

- `user`: can view and use normal flows
- `moderator`: can create/update operational data
- `manager`: can do higher-risk actions such as deleting products

## 16. Backend Router Map

Routers are in `backend/app/routers/`.

Main routers:

- `auth.py`: login and current user
- `users.py`: user management
- `inventory.py`: product catalog, product update/delete, AI summary, product image, barcode/postal/shipping helpers
- `dashboard.py`: dashboard KPIs and overview data
- `sales.py`: POS sales and sale history
- `customers.py`: customer CRUD and customer history
- `suppliers.py`: supplier CRUD and supplier item list
- `purchase_orders.py`: purchase order creation, status updates, receiving stock
- `warehouses.py`: warehouse CRUD and warehouse stock adjustment
- `reports.py`: inventory, sales, aging, margin, export reports
- `notifications.py`: unread count, mark read, delete notification
- `bulk_operations.py`: bulk import
- `email.py`: send emails
- `chart.py`: generate charts
- `helpdesk.py`: AI helpdesk chat
- `agents.py`: automation agents
- `audit.py`: audit logs

## 17. Inventory Backend Flow

File:

```text
backend/app/routers/inventory.py
```

Important endpoints:

- `GET /api/inventory`: list active products
- `POST /api/inventory`: create product
- `GET /api/inventory/{sku}`: get one active product
- `PUT /api/inventory/{sku}`: update one active product
- `DELETE /api/inventory/{sku}`: soft-delete product by setting `is_active = False`
- `POST /api/inventory/{sku}/summary/stream`: stream AI product summary
- `POST /api/inventory/{sku}/image`: generate product image

Create product flow:

1. Validate request using `InventoryItemCreate`.
2. Check SKU is unique.
3. Create `InventoryItem`.
4. Optionally create `WarehouseInventory` rows.
5. Commit database transaction.
6. Return product JSON.

Update product flow:

1. Find active product by SKU.
2. Validate request using `InventoryItemUpdate`.
3. Update only provided fields.
4. Commit.
5. Return updated product JSON.

Delete product flow:

1. Find active product by SKU.
2. Set `is_active = False`.
3. Commit.
4. Return `204 No Content`.

The delete is a soft delete so old sales, purchase orders, and warehouse records do not break.

## 18. POS And Sales Flow

Frontend file:

```text
frontend/src/pages/POS.jsx
```

Backend file:

```text
backend/app/routers/sales.py
```

Flow:

1. POS page loads products, customers, and warehouses.
2. User adds products to cart.
3. User chooses customer, warehouse, and payment method.
4. Frontend sends `POST /api/sales/`.
5. Backend validates warehouse and customer.
6. Backend checks warehouse stock.
7. Backend creates `Sale`.
8. Backend creates `SaleItem` rows.
9. Backend reduces both warehouse stock and total item quantity.
10. Backend creates low-stock notification if needed.
11. Backend returns completed sale.

This is one of the most important flows because it changes inventory.

## 19. Warehouse Stock Flow

Frontend file:

```text
frontend/src/pages/Warehouses.jsx
```

Backend file:

```text
backend/app/routers/warehouses.py
```

Warehouses store stock per location.

Main idea:

```text
InventoryItem.quantity = total stock across all warehouses
WarehouseInventory.quantity = stock in one warehouse
```

When warehouse quantity is adjusted, the backend recalculates the product total quantity.

## 20. Purchase Order Flow

Frontend file:

```text
frontend/src/pages/PurchaseOrders.jsx
```

Backend file:

```text
backend/app/routers/purchase_orders.py
```

Flow:

1. User creates purchase order for a supplier and warehouse.
2. Items are added with quantity and unit price.
3. Backend creates `PurchaseOrder` and `PurchaseOrderItem` rows.
4. When an order is received, backend increases warehouse inventory.
5. Backend also increases total product quantity.

This is the opposite of POS: purchase orders add stock, sales remove stock.

## 21. Dashboard And Reports Flow

Dashboard:

- Frontend: `frontend/src/pages/Dashboard.jsx`
- Backend: `backend/app/routers/dashboard.py`

Reports:

- Frontend: `frontend/src/pages/Reports.jsx`
- Backend: `backend/app/routers/reports.py`

Dashboard returns quick KPI data.
Reports return more detailed filtered data and exports.

Dashboard is mostly read-only.
Reports are mostly read-only except export generation.

## 22. AI Features Flow

AI-related services are in `backend/app/services/`.

Important service files:

- `ollama_service.py`: text generation for summaries and chat
- `comfyui_service.py`: product image generation
- `agent_service.py`: agent automation workflow
- `chart_service.py`: chart image generation
- `integrations.py`: barcode, postal, geocode, shipping helpers

Example product summary flow:

```text
Frontend askSummary()
  -> POST /api/inventory/{sku}/summary/stream
    -> inventory router builds prompt
      -> ollama_service streams text
        -> frontend appends chunks to UI
```

Example product image flow:

```text
Frontend generateProductImage()
  -> POST /api/inventory/{sku}/image
    -> comfyui_service builds prompt and calls ComfyUI
      -> image saved in backend/app/static/product_images
        -> URL returned to frontend
```

## 23. Static Files

Static generated files are served by FastAPI at:

```text
/api/static
```

Local folders:

- `backend/app/static/charts`
- `backend/app/static/product_images`

Frontend helper:

```js
resolveApiAssetUrl(url)
```

This converts backend relative static paths into full browser URLs.

## 24. Where To Change Common Things

Add a new backend API:

1. Add or update database model in `models.py` if needed.
2. Add request/response schema in `schemas.py`.
3. Add route in `backend/app/routers/`.
4. Include router in `main.py` if it is a new router file.
5. Call it from frontend with `request()`.

Add a new frontend page:

1. Create a file in `frontend/src/pages/`.
2. Import it in `App.jsx`.
3. Add sidebar item in `App.jsx`.
4. Add an `activeTab` render block.
5. Add API calls using the same `request()` pattern.

Add a new field to products:

1. Add column in `InventoryItem` in `models.py`.
2. Add field to create/update/response schemas in `schemas.py`.
3. Add field to frontend forms in `App.jsx`.
4. Include field in `itemFormPayload()`.
5. Check create, update, display, reports, and POS if the field matters there.

Change permissions:

1. Find the route in `backend/app/routers/`.
2. Look for `Depends(get_current_user)` or `Depends(require_roles(...))`.
3. Change the allowed roles.
4. Make matching UI changes in React so buttons hide/show correctly.

## 25. How To Run Locally

Backend:

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173
```

API health:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/api/health
```

## 26. How To Verify Changes

Frontend build:

```powershell
cd frontend
npm run build
```

Backend syntax check:

```powershell
python -m compileall backend\app
```

Useful manual checks:

- Login works.
- Dashboard loads.
- Product list loads.
- Product create/update/delete works for manager.
- POS sale reduces stock.
- Purchase order receiving increases stock.
- Notifications update after low stock.

## 27. Important Things To Know Before Editing

- The frontend currently has repeated `request()` helpers in multiple page files. If the app grows, moving this to one shared API utility would reduce duplication.
- Product delete is intentionally soft delete. Do not hard-delete products unless you also handle related sales, purchase orders, notifications, and warehouse inventory.
- Inventory quantity exists in two places: total product quantity and per-warehouse quantity. Be careful to keep them consistent.
- Some AI features depend on local external tools such as Ollama and ComfyUI. The core inventory app can still run without those, but AI/image features may show unavailable messages.
- CORS is configured in the backend so the frontend can call the API from localhost.
- The backend creates tables on startup, but real production database changes should use migrations.

## 28. Quick Mental Model

Think of the app like this:

```text
React pages are the screens.
FastAPI routers are the backend controllers.
Pydantic schemas are the API contracts.
SQLAlchemy models are the database tables.
Services are helper modules for AI, email, charts, and integrations.
```

If a user action changes business data, look in:

```text
frontend/src/pages/... or frontend/src/App.jsx
backend/app/routers/...
backend/app/models.py
backend/app/schemas.py
```

That is usually enough to follow the complete code flow.
