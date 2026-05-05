# Frontend Documentation - AI Inventory Manager

## Overview

This is a **React-based frontend** for a comprehensive retail inventory management system. The application features a modern, responsive UI with AI-powered insights, real-time data visualization, and a complete point-of-sale interface.

**Tech Stack:**
- **Framework:** React 18.3.1 (with hooks, no class components)
- **Build Tool:** Vite 7.1.3 (fast HMR and bundling)
- **Styling:** Custom CSS with CSS variables (no external UI library)
- **State Management:** React useState/useEffect (no Redux)
- **HTTP Client:** Native fetch API (no Axios)
- **Maps:** Leaflet for postal code geocoding
- **Routing:** Client-side routing via state (no React Router)

---

## Project Structure

```
frontend/
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Main application component
│   ├── components/           # Reusable UI components
│   │   ├── EmailForm.jsx     # Email composition form
│   │   └── ChartBuilder.jsx  # Chart generation component
│   ├── pages/                # Page components (one per feature)
│   │   ├── Dashboard.jsx     # Dashboard with KPIs
│   │   ├── POS.jsx           # Point of Sale interface
│   │   ├── Customers.jsx     # Customer management
│   │   ├── Suppliers.jsx     # Supplier management
│   │   ├── PurchaseOrders.jsx # Purchase order management
│   │   ├── Warehouses.jsx    # Warehouse management
│   │   ├── Reports.jsx       # Reporting interface
│   │   ├── Notifications.jsx # Notification center
│   │   ├── BulkImport.jsx    # Bulk import tool
│   │   └── AgentAutomation.jsx # AI agent interface
│   ├── utils/
│   │   └── index.js          # Utility functions
│   └── assets/               # Static assets
├── public/
│   └── image/placeholder.svg # Default product image
├── package.json
├── vite.config.js
└── index.html
```

---

## Core Architecture

### 1. Application Entry Point (`main.jsx`)

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Key Points:**
- No router wrapper (state-based navigation)
- Global CSS imported at root
- Strict mode enabled for development

### 2. Main App Component (`App.jsx`)

**Structure:**
- **State Management:** 30+ useState hooks for UI state
- **Lifecycle:** useEffect for token persistence, profile loading
- **Navigation:** State-based tab switching (`activeTab`)
- **Authentication:** Token stored in localStorage
- **API Communication:** Custom `request()` and `streamSSEPost()` helpers

**Key Functions:**

```javascript
// API request helper with auth token
async function request(path, options = {}, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// Server-Sent Events streaming for AI responses
async function streamSSEPost(path, body, token, onEvent) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    
    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.replace(/^data:\s*/, "");
      if (payload) onEvent(JSON.parse(payload));
    }
  }
}
```

---

## Component Breakdown

### 1. Dashboard Page (`pages/Dashboard.jsx`)

**Purpose:** High-level overview of business metrics

**Features:**
- KPI cards: Inventory value, low stock count, today's sales, revenue
- Low stock alerts table
- Top selling items list
- Category distribution chart
- Sales trend visualization
- Quick actions (create item, view reports)

**API Calls:**
- `GET /api/dashboard` - Main dashboard data
- `GET /api/inventory` - For low stock items
- `GET /api/sales/stats/daily` - Today's sales

**State:**
```javascript
const [dashboardData, setDashboardData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
```

### 2. Point of Sale Page (`pages/POS.jsx`)

**Purpose:** Process sales transactions

**Features:**
- Product search and selection
- Shopping cart with quantity controls
- Customer selection (or walk-in)
- Warehouse selection
- Payment method selection
- Discount application (percentage)
- Tax calculation (18% GST)
- Sale completion with receipt
- Sales history view
- Sale cancellation (manager/moderator only)

**Key Functions:**

```javascript
// Add item to cart
function addToCart(item) {
  const existing = cart.find((c) => c.item_id === item.id);
  if (existing) {
    setCart(cart.map((c) => (
      c.item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
    )));
  } else {
    setCart([...cart, {
      item_id: item.id,
      name: item.name,
      sku: item.sku,
      image_url: item.image_url,
      unit_price: item.sale_price || item.unit_price,
      quantity: 1,
      discount_percent: 0,
    }]);
  }
}

// Complete sale
async function completeSale() {
  if (cart.length === 0) {
    onError("Cart is empty");
    return;
  }
  
  const saleData = {
    customer_id: selectedCustomer ? parseInt(selectedCustomer) : null,
    warehouse_id: parseInt(selectedWarehouse),
    items: cart.map((item) => ({
      item_id: item.item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
    })),
    payment_method: paymentMethod,
    notes: saleNotes,
  };
  
  const response = await request("/sales", {
    method: "POST",
    body: JSON.stringify(saleData),
  }, token);
  
  setSaleComplete(response);
  setCart([]);
}
```

**Calculations:**
```javascript
const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
const discount = cart.reduce(
  (sum, item) => sum + (item.unit_price * item.quantity * item.discount_percent) / 100,
  0
);
const tax = ((subtotal - discount) * 18) / 100; // 18% GST
const total = subtotal - discount + tax;
```

### 3. Inventory Management (in `App.jsx`)

**Purpose:** Product catalog management

**Features:**
- Product list with search (SKU, name, category, description)
- Product detail view with image
- Create new products (moderator+)
- Edit products (moderator+)
- Delete products (manager only)
- AI summary generation
- Product image generation (ComfyUI)
- Barcode lookup
- Postal code lookup with map
- Shipping cost estimator

**Key State:**
```javascript
const [items, setItems] = useState([]);
const [selectedSku, setSelectedSku] = useState("");
const [itemForm, setItemForm] = useState(emptyItem);
const [isEditingItem, setIsEditingItem] = useState(false);
const [summary, setSummary] = useState("");
const [imageGenerating, setImageGenerating] = useState(false);
```

**AI Features:**

1. **Product Summary:**
```javascript
async function askSummary() {
  let answer = "";
  await streamSSEPost(
    `/inventory/${selectedSku}/summary/stream`,
    { question: summaryQuestion },
    token,
    (event) => {
      if (event.chunk) {
        answer += event.chunk;
        setSummary(answer);
      }
      if (event.done) {
        setSummary(`${answer}\n\nModel: ${event.source_model || "fallback"}`);
      }
    }
  );
}
```

2. **Image Generation:**
```javascript
async function generateProductImage() {
  setImageGenerating(true);
  await loadComfyStatus(token);
  const data = await request(`/inventory/${selectedSku}/image`, {
    method: "POST",
    body: JSON.stringify({ prompt: imagePrompt.trim() || null }),
  }, token);
  
  setItems((current) => current.map((item) => (
    item.sku === selectedSku
      ? { ...item, image_url: data.image_url, image_prompt: data.image_prompt }
      : item
  )));
  setImageGenerating(false);
}
```

### 4. Customers Page (`pages/Customers.jsx`)

**Purpose:** Customer relationship management

**Features:**
- Customer list with search
- Create/edit customer details
- Loyalty points tracking
- Purchase history view
- Customer segmentation by tier

**Key Data:**
```javascript
const customer = {
  id: 1,
  customer_code: "CUST001",
  first_name: "John",
  last_name: "Doe",
  email: "john@example.com",
  phone: "+91 9876543210",
  loyalty_points: 1250,
  loyalty_tier: "gold",
  total_purchases: 12500.00,
  total_orders: 15,
};
```

### 5. Suppliers Page (`pages/Suppliers.jsx`)

**Purpose:** Supplier/vendor management

**Features:**
- Supplier list
- Create/edit supplier details
- Supplier performance metrics
- Lead time tracking
- Rating system

**Supplier Performance Metrics:**
- Total orders placed
- Total value of orders
- Average lead time
- On-time delivery rate

### 6. Purchase Orders Page (`pages/PurchaseOrders.jsx`)

**Purpose:** Procurement management

**Features:**
- Create purchase orders
- Track PO status (draft, sent, confirmed, partial, received, cancelled)
- Receive items from PO
- Link to supplier and warehouse
- Expected vs actual delivery tracking

**PO Workflow:**
1. Create as `draft`
2. Send to supplier → `sent`
3. Supplier confirms → `confirmed`
4. Partial receipt → `partial`
5. Full receipt → `received`

### 7. Warehouses Page (`pages/Warehouses.jsx`)

**Purpose:** Multi-warehouse management

**Features:**
- Warehouse list with addresses
- Stock levels per warehouse
- Create stock transfers between warehouses
- Track transfer status (pending, in_transit, completed, cancelled)
- Geolocation on map

**Stock Transfer:**
```javascript
const transfer = {
  id: 1,
  transfer_code: "TRF001",
  from_warehouse_id: 1,
  from_warehouse_name: "Main Warehouse",
  to_warehouse_id: 2,
  to_warehouse_name: "Retail Store",
  status: "pending",
  items: [
    { item_id: 1, item_name: "Product A", quantity: 50 }
  ],
  created_at: "2024-05-01T10:00:00Z",
};
```

### 8. Reports Page (`pages/Reports.jsx`)

**Purpose:** Business intelligence and analytics

**Report Types:**

1. **Inventory Report:**
   - Stock levels by category
   - Low stock alerts
   - Inventory valuation
   - Warehouse distribution

2. **Sales Report:**
   - Sales by date range
   - Sales by customer
   - Sales by category
   - Payment method breakdown

3. **Aging Report:**
   - Days in stock for each item
   - Last sale date
   - Aging status: fresh, aging, stale, dead

4. **Profit Margin Report:**
   - Cost vs sale price
   - Margin percentage
   - Total profit by item

### 9. Notifications Page (`pages/Notifications.jsx`)

**Purpose:** System alerts and notifications

**Notification Types:**
- `low_stock` - Item below reorder level
- `expiry_warning` - Item approaching expiry date
- `price_change` - Price update notification
- `order_received` - Purchase order received
- `transfer_completed` - Stock transfer completed
- `system` - General system messages

**Features:**
- Unread count badge in sidebar
- Mark as read functionality
- Delete notifications
- Filter by type

### 10. Bulk Import Page (`pages/BulkImport.jsx`)

**Purpose:** Mass data import (managers only)

**Features:**
- CSV/Excel upload
- Column mapping
- Validation preview
- Error reporting
- Success/failure counts

**Supported Imports:**
- Inventory items
- Customers
- Suppliers
- Stock levels

### 11. Agent Automation Page (`pages/AgentAutomation.jsx`)

**Purpose:** AI agent interaction and approval workflow

**Features:**
- Run agentic automation workflow
- View agent recommendations
- Approve/reject suggested actions
- Conversation history
- Pending actions queue

**Agent Workflows:**

1. **Smart Inventory Agent:**
   - Analyzes stock levels
   - Suggests reorder quantities
   - Creates draft purchase orders

2. **Customer Support Agent:**
   - Looks up sale/PO status
   - Handles refund requests
   - Suggests sale cancellations

3. **Sales Optimization Agent:**
   - Identifies top sellers
   - Suggests campaigns
   - Recommends discounts

**Action Approval:**
```javascript
async function handleApproveAction(actionId) {
  await request(`/agents/actions/${actionId}/approve`, {
    method: "POST",
  }, token);
  loadPendingActions();
}

async function handleRejectAction(actionId) {
  await request(`/agents/actions/${actionId}/reject`, {
    method: "POST",
  }, token);
  loadPendingActions();
}
```

### 12. Email Form Component (`components/EmailForm.jsx`)

**Purpose:** Send emails via SMTP

**Features:**
- Recipient input
- Subject line
- Email body (textarea)
- Send button
- Success/error feedback

### 13. Chart Builder Component (`components/ChartBuilder.jsx`)

**Purpose:** Generate custom charts

**Features:**
- Chart type selection (bar, line, pie)
- Data input (labels and values)
- Title input
- Generate chart button
- Display generated chart image

---

## State Management

### Authentication State:
```javascript
const [token, setToken] = useState("");
const [profile, setProfile] = useState(null);

// Persist token
useEffect(() => {
  const savedToken = localStorage.getItem("inventory_token");
  if (savedToken) {
    setToken(savedToken);
  }
}, []);

useEffect(() => {
  if (!token) return;
  localStorage.setItem("inventory_token", token);
  loadProfile(token);
}, [token]);
```

### Navigation State:
```javascript
const [activeTab, setActiveTab] = useState("dashboard");

// Tab options:
// - dashboard
// - pos
// - inventory
// - customers
// - suppliers
// - purchaseOrders
// - warehouses
// - reports
// - email
// - charts
// - notifications
// - agents
// - bulkImport
```

### UI State:
```javascript
const [darkMode, setDarkMode] = useState(false);
const [notificationCount, setNotificationCount] = useState(0);
const [error, setError] = useState("");
const [search, setSearch] = useState("");
```

---

## Styling System

### CSS Variables (in `index.css`):
```css
:root {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-card: rgba(30, 41, 59, 0.5);
  --text-primary: #f1f5f9;
  --text-muted: #94a3b8;
  --accent-blue: #3b82f6;
  --accent-green: #10b981;
  --accent-red: #ef4444;
  --glass-border: rgba(255, 255, 255, 0.1);
  --radius-md: 0.5rem;
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
```

### Dark Mode:
```javascript
function toggleDarkMode() {
  const newMode = !darkMode;
  setDarkMode(newMode);
  localStorage.setItem("dark_mode", newMode);
  if (newMode) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
}
```

### Responsive Design:
- Mobile-first approach
- Breakpoints: 768px, 1024px, 1280px
- Grid layouts adapt to screen size
- Sidebar collapses on mobile

---

## API Communication

### Base Configuration:
```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
```

### Request Helper:
```javascript
async function request(path, options = {}, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}
```

### Error Handling:
```javascript
function handleAuthError(err) {
  if (err.message === "Could not validate credentials" || 
      err.message === "Not authenticated") {
    clearSession();
    setError("Your session expired. Please sign in again.");
    return true;
  }
  return false;
}

// Usage in components
try {
  const data = await request("/inventory", {}, token);
  setItems(data);
} catch (err) {
  if (handleAuthError(err)) return;
  setError(err.message);
}
```

---

## Utility Functions

### Currency Formatting:
```javascript
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
}
```

### Role-Based Class:
```javascript
function roleClass(role) {
  return role === "manager" ? "role-manager" : 
         role === "moderator" ? "role-moderator" : "role-user";
}
```

### Image URL Resolution:
```javascript
function resolveApiAssetUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${apiOrigin}${url}`;
}
```

---

## Leaflet Map Integration

### Postal Code Lookup Map:
```javascript
function PostalLookupMap({ coordinate }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([20.5937, 78.9629], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !coordinate) return;

    if (markerRef.current) {
      markerRef.current.remove();
    }

    markerRef.current = L.circleMarker(
      [coordinate.latitude, coordinate.longitude],
      {
        radius: 8,
        color: "#db6c28",
        weight: 3,
        fillColor: "#12355b",
        fillOpacity: 0.85,
      }
    )
    .addTo(mapRef.current)
    .bindPopup(coordinate.label)
    .openPopup();

    mapRef.current.setView([coordinate.latitude, coordinate.longitude], 12);
  }, [coordinate]);

  return <div ref={mapContainerRef} className="postal-map" />;
}
```

---

## Authentication Flow

1. **Initial Load:**
   - Check localStorage for saved token
   - If exists, load user profile
   - Set authentication state

2. **Login:**
   ```javascript
   async function handleLogin(event) {
     event.preventDefault();
     try {
       const data = await request("/auth/login", {
         method: "POST",
         body: JSON.stringify(loginForm),
       });
       setToken(data.access_token);
     } catch (err) {
       setError(err.message);
     }
   }
   ```

3. **Logout:**
   ```javascript
   function clearSession() {
     setToken("");
     setProfile(null);
     localStorage.removeItem("inventory_token");
   }
   ```

4. **Token Expiry:**
   - Backend returns 401/403 on invalid token
   - Frontend clears session and shows error
   - User must re-login

---

## Performance Optimizations

### 1. Lazy Loading:
- Components loaded on tab switch
- No heavy libraries imported upfront

### 2. Memoization:
- Consider useMemo for expensive calculations
- useCallback for event handlers passed to children

### 3. Debouncing:
- Search input should debounce (not implemented)
- Prevents excessive API calls

### 4. Image Optimization:
- Placeholder for missing images
- Lazy loading for product images

### 5. List Virtualization:
- Large lists should use virtualization (not implemented)
- Currently renders all items

---

## Accessibility Features

### Implemented:
- Semantic HTML (nav, main, section, header)
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management
- Error messages announced

### To Improve:
- Skip to main content link
- Better focus indicators
- Screen reader announcements for dynamic content
- Color contrast improvements

---

## Browser Compatibility

### Supported Browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

### Polyfills:
- None explicitly added
- Relies on modern browser features (fetch, Promise, async/await)

---

## Build & Deployment

### Development:
```bash
npm run dev
# Runs on http://localhost:5173 with HMR
```

### Production Build:
```bash
npm run build
# Outputs to dist/ folder
```

### Preview:
```bash
npm run preview
# Serves production build locally
```

### Environment Variables:
```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL),
  },
});
```

### Deployment Checklist:
- [ ] Set `VITE_API_BASE_URL` to production backend
- [ ] Build production bundle
- [ ] Configure web server (nginx, Apache)
- [ ] Enable gzip/brotli compression
- [ ] Set up HTTPS
- [ ] Configure caching headers
- [ ] Test all features in production

---

## Known Issues & Limitations

### Current Limitations:
1. **No Client-Side Routing:**
   - State-based navigation
   - URL doesn't reflect current view
   - Can't deep-link to specific pages

2. **No Global State Management:**
   - All state in App.jsx
   - Prop drilling to children
   - Consider Context API or Zustand for larger app

3. **No Form Validation Library:**
   - Manual validation
   - Consider React Hook Form or Formik

4. **No Data Table Component:**
   - Basic tables with manual sorting
   - Consider TanStack Table for advanced features

5. **No Real-time Updates:**
   - Manual refresh required
   - Consider WebSocket for live updates

### Bugs to Fix:
- [ ] Search doesn't reset on tab switch
- [ ] Cart state not persisted on refresh
- [ ] No loading states for all async operations
- [ ] Error boundaries not implemented
- [ ] Memory leaks in useEffect cleanup

---

## Future Enhancements

### Planned Features:
- [ ] React Router for URL-based navigation
- [ ] TanStack Query for data fetching
- [ ] React Hook Form for form handling
- [ ] Toast notifications for errors/success
- [ ] PWA support (offline mode)
- [ ] Barcode scanner integration
- [ ] Receipt printing optimization
- [ ] Multi-language support (i18n)
- [ ] Theme customization
- [ ] Export to PDF/Excel

### Performance:
- [ ] Code splitting by route
- [ ] Image lazy loading
- [ ] Virtual scrolling for large lists
- [ ] Service worker for caching
- [ ] Bundle size optimization

### UX Improvements:
- [ ] Skeleton loaders
- [ ] Optimistic UI updates
- [ ] Undo for destructive actions
- [ ] Keyboard shortcuts
- [ ] Drag-and-drop for bulk operations

---

## Testing Strategy

### Manual Testing Checklist:
- [ ] Login with all user roles
- [ ] Create/edit/delete inventory items
- [ ] Process a sale through POS
- [ ] Create customer and supplier
- [ ] Create and receive purchase order
- [ ] Transfer stock between warehouses
- [ ] Generate reports
- [ ] AI summary generation
- [ ] Agent action approval

### Automated Testing (To Implement):
- Unit tests with Jest
- Component tests with React Testing Library
- E2E tests with Cypress or Playwright

---

## Troubleshooting

### Common Issues:

1. **Blank Page on Load:**
   - Check browser console for errors
   - Verify backend is running
   - Check API_BASE_URL configuration

2. **Login Not Working:**
   - Verify backend is accessible
   - Check CORS configuration
   - Ensure credentials are correct

3. **Images Not Loading:**
   - Check static file serving on backend
   - Verify image_url format
   - Use resolveApiAssetUrl() helper

4. **POS Not Processing Sales:**
   - Check warehouse selection
   - Verify stock availability
   - Check user permissions

5. **AI Features Not Working:**
   - Verify Ollama is running
   - Check ComfyUI status
   - Review backend logs for errors

---

## Code Style Guidelines

### Naming Conventions:
- Components: PascalCase (`ProductCard`)
- Functions: camelCase (`handleClick`)
- Constants: UPPER_SNAKE_CASE (`API_BASE_URL`)
- CSS classes: kebab-case (`product-card`)

### Component Structure:
```jsx
export default function ComponentName({ prop1, prop2 }) {
  // Hooks first
  const [state, setState] = useState(defaultValue);
  
  // Effects
  useEffect(() => {
    // side effect
  }, [dependency]);
  
  // Event handlers
  function handleClick() {
    // handler logic
  }
  
  // Render
  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  );
}
```

### Best Practices:
- Use descriptive variable names
- Keep components small and focused
- Extract reusable logic to utilities
- Comment complex business logic
- Avoid inline styles (use CSS classes)
- Use semantic HTML elements
