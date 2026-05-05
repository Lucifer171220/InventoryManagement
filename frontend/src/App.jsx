import { useEffect, useRef, useState } from "react";
import EmailForm from "./components/EmailForm";
import ChartBuilder from "./components/ChartBuilder";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import PurchaseOrders from "./pages/PurchaseOrders";
import Warehouses from "./pages/Warehouses";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import BulkImport from "./pages/BulkImport";
import AgentAutomation from "./pages/AgentAutomation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const emptyItem = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category: "general",
  subcategory: "",
  brand: "",
  quantity: 0,
  reorder_level: 10,
  reorder_quantity: 50,
  unit_price: 0,
  cost_price: 0,
  sale_price: "",
  tax_rate: 18,
  supplier_id: "",
};

function itemToForm(item = emptyItem) {
  return {
    sku: item.sku || "",
    barcode: item.barcode || "",
    name: item.name || "",
    description: item.description || "",
    category: item.category || "general",
    subcategory: item.subcategory || "",
    brand: item.brand || "",
    quantity: item.quantity ?? 0,
    reorder_level: item.reorder_level ?? 10,
    reorder_quantity: item.reorder_quantity ?? 50,
    unit_price: item.unit_price ?? 0,
    cost_price: item.cost_price ?? 0,
    sale_price: item.sale_price ?? "",
    tax_rate: item.tax_rate ?? 18,
    supplier_id: item.supplier_id || "",
  };
}

function itemFormPayload(form, { includeSku = false } = {}) {
  const payload = {
    barcode: form.barcode || null,
    name: form.name,
    description: form.description || "",
    category: form.category || "general",
    subcategory: form.subcategory || null,
    brand: form.brand || null,
    quantity: Number(form.quantity) || 0,
    reorder_level: Number(form.reorder_level) || 0,
    reorder_quantity: Number(form.reorder_quantity) || 0,
    unit_price: Number(form.unit_price) || 0,
    cost_price: Number(form.cost_price) || 0,
    sale_price: form.sale_price === "" ? null : Number(form.sale_price),
    tax_rate: Number(form.tax_rate) || 0,
    supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
  };
  if (includeSku) payload.sku = form.sku;
  return payload;
}

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

async function streamSSEPost(path, body, token, onEvent) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Streaming request failed");
  }
  if (!response.body) {
    throw new Error("Streaming is not supported by this browser");
  }

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

  const finalPayload = buffer.trim().replace(/^data:\s*/, "");
  if (finalPayload) onEvent(JSON.parse(finalPayload));
}

function roleClass(role) {
  return role === "manager" ? "role-manager" : role === "moderator" ? "role-moderator" : "role-user";
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
}

function resolveApiAssetUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${apiOrigin}${url}`;
}

function formatPostalPlaceAddress(place, country, postalCode) {
  return [
    place["place name"],
    place.district,
    place.state,
    country,
    postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

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

    markerRef.current = L.circleMarker([coordinate.latitude, coordinate.longitude], {
      radius: 8,
      color: "#db6c28",
      weight: 3,
      fillColor: "#12355b",
      fillOpacity: 0.85,
    })
      .addTo(mapRef.current)
      .bindPopup(coordinate.label)
      .openPopup();

    mapRef.current.setView([coordinate.latitude, coordinate.longitude], 12);
  }, [coordinate]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={mapContainerRef} className="postal-map" aria-label="Postal lookup map" />;
}

// Navigation Item Component
function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </button>
  );
}

export default function App() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editItemForm, setEditItemForm] = useState(emptyItem);
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemDeleting, setItemDeleting] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "manager@inventory.local", password: "ChangeMe123!" });
  const [search, setSearch] = useState("");
  const [summaryQuestion, setSummaryQuestion] = useState("Give me a quick operational summary for this item.");
  const [summary, setSummary] = useState("");
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [comfyStatus, setComfyStatus] = useState(null);
  const [chat, setChat] = useState({ message: "", answer: "", conversationId: null });
  const [shipping, setShipping] = useState({
    origin_address: "",
    destination_address: "",
    weight_kg: 2,
  });
  const [shippingAnswer, setShippingAnswer] = useState(null);
  const [barcodeLookup, setBarcodeLookup] = useState({ query: "", result: null });
  const [postalLookup, setPostalLookup] = useState({ country: "IN", postal: "", result: null });
  const [postalMap, setPostalMap] = useState({ coordinate: null, loading: false, activeKey: "" });
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [darkMode, setDarkMode] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    const savedToken = localStorage.getItem("inventory_token");
    const savedDarkMode = localStorage.getItem("dark_mode") === "true";
    if (savedToken) {
      setToken(savedToken);
    }
    setDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.body.classList.add("dark-mode");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem("inventory_token", token);
    loadProfile(token);
    loadItems(token, search);
    loadNotificationCount(token);
    loadComfyStatus(token);
  }, [token]);

  function clearSession() {
    setToken("");
    setProfile(null);
    localStorage.removeItem("inventory_token");
  }

  function handleAuthError(err) {
    if (err.message === "Could not validate credentials" || err.message === "Not authenticated") {
      clearSession();
      setError("Your session expired. Please sign in again.");
      return true;
    }
    return false;
  }

  async function loadNotificationCount(activeToken = token) {
    try {
      const data = await request("/notifications/unread-count", {}, activeToken);
      setNotificationCount(data.unread_count);
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function loadProfile(activeToken = token) {
    try {
      const me = await request("/users/me", {}, activeToken);
      setProfile(me);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err.message);
    }
  }

  async function loadItems(activeToken = token, activeSearch = search) {
    if (!activeToken) return;
    try {
      const query = activeSearch ? `?search=${encodeURIComponent(activeSearch)}` : "";
      const data = await request(`/inventory${query}`, {}, activeToken);
      setItems(data);
      setSelectedSku((currentSku) => (
        data.some((item) => item.sku === currentSku) ? currentSku : data[0]?.sku || ""
      ));
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err.message);
    }
  }

  async function loadComfyStatus(activeToken = token) {
    try {
      const data = await request("/inventory/image/status/comfyui", {}, activeToken);
      setComfyStatus(data);
    } catch (err) {
      setComfyStatus({ available: false, error: err.message });
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
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

  async function handleCreateItem(event) {
    event.preventDefault();
    setError("");
    try {
      const createdItem = await request("/inventory", {
        method: "POST",
        body: JSON.stringify(itemFormPayload(itemForm, { includeSku: true })),
      }, token);
      setItemForm(emptyItem);
      setSelectedSku(createdItem.sku);
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditingItem() {
    if (!selectedItem) return;
    setEditItemForm(itemToForm(selectedItem));
    setIsEditingItem(true);
  }

  function cancelEditingItem() {
    setEditItemForm(emptyItem);
    setIsEditingItem(false);
  }

  async function handleUpdateItem(event) {
    event.preventDefault();
    if (!selectedSku) return;
    setError("");
    setItemSaving(true);
    try {
      const updatedItem = await request(`/inventory/${selectedSku}`, {
        method: "PUT",
        body: JSON.stringify(itemFormPayload(editItemForm)),
      }, token);
      setItems((current) => current.map((item) => (
        item.sku === selectedSku ? updatedItem : item
      )));
      setEditItemForm(emptyItem);
      setIsEditingItem(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setItemSaving(false);
    }
  }

  async function handleDeleteItem() {
    if (!selectedItem) return;
    const confirmed = window.confirm(`Delete ${selectedItem.name} (${selectedItem.sku}) from the product catalog?`);
    if (!confirmed) return;
    setError("");
    setItemDeleting(true);
    try {
      await request(`/inventory/${selectedItem.sku}`, { method: "DELETE" }, token);
      setItems((current) => {
        const remaining = current.filter((item) => item.sku !== selectedItem.sku);
        setSelectedSku(remaining[0]?.sku || "");
        return remaining;
      });
      setSummary("");
      setEditItemForm(emptyItem);
      setIsEditingItem(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setItemDeleting(false);
    }
  }

  async function askSummary() {
    if (!selectedSku) return;
    setError("");
    setSummary("");
    try {
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
    } catch (err) {
      setError(err.message);
    }
  }

  async function generateProductImage() {
    if (!selectedSku) return;
    setError("");
    try {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setImageGenerating(false);
    }
  }

  async function sendChat() {
    setError("");
    if (!chat.message.trim()) return;
    const outgoingMessage = chat.message;
    setChat((current) => ({ ...current, answer: "", message: "" }));
    try {
      let answer = "";
      await streamSSEPost(
        "/helpdesk/chat/stream",
        {
          message: outgoingMessage,
          sku: selectedSku || undefined,
          conversation_id: chat.conversationId,
        },
        token,
        (event) => {
          if (event.conversation_id) {
            setChat((current) => ({ ...current, conversationId: event.conversation_id }));
          }
          if (event.chunk) {
            answer += event.chunk;
            setChat((current) => ({ ...current, answer }));
          }
          if (event.done) {
            setChat((current) => ({
              ...current,
              answer: `${answer}\n\nModel: ${event.source_model || "fallback"}`,
              conversationId: event.conversation_id || current.conversationId,
            }));
          }
        }
      );
    } catch (err) {
      setError(err.message);
      setChat((current) => ({ ...current, message: outgoingMessage }));
    }
  }

  async function getShippingEstimate(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await request("/inventory/shipping/estimate", {
        method: "POST",
        body: JSON.stringify({
          ...shipping,
          weight_kg: Number(shipping.weight_kg),
        }),
      }, token);
      setShippingAnswer(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function lookupBarcode(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await request(`/inventory/lookup/barcode/${barcodeLookup.query}`, {}, token);
      setBarcodeLookup((current) => ({ ...current, result: data }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function lookupPostal(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await request(`/inventory/lookup/postal/${postalLookup.country}/${postalLookup.postal}`, {}, token);
      setPostalLookup((current) => ({ ...current, result: data }));
      setPostalMap({ coordinate: null, loading: false, activeKey: "" });
      if (data.places?.length) {
        const firstPlace = data.places[0];
        const address = formatPostalPlaceAddress(firstPlace, data.country, data.postal_code);
        await showPostalPlaceOnMap(address, firstPlace, data);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function showPostalPlaceOnMap(address, place, result = postalLookup.result) {
    if (!address) return;

    const activeKey = `${place["place name"]}-${place.district}-${place.state}`;
    setPostalMap((current) => ({ ...current, loading: true, activeKey }));
    try {
      const data = await request(`/inventory/lookup/geocode?address=${encodeURIComponent(address)}`, {}, token);
      setPostalMap({
        loading: false,
        activeKey,
        coordinate: {
          latitude: data.latitude,
          longitude: data.longitude,
          label: place["place name"] || data.display_name || address,
          description: [place.district, place.state, result?.country].filter(Boolean).join(", "),
        },
      });
    } catch (err) {
      setPostalMap({ coordinate: null, loading: false, activeKey });
      setError(err.message);
    }
  }

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

  const selectedItem = items.find((item) => item.sku === selectedSku);

  // Navigation Icons
  const icons = {
    dashboard: "📊",
    inventory: "📦",
    pos: "🛒",
    customers: "👥",
    suppliers: "🏭",
    purchaseOrders: "📋",
    warehouses: "🏢",
    reports: "📈",
    email: "✉️",
    charts: "📉",
    notifications: "🔔",
    agents: "AI",
    bulkImport: "📤",
    settings: "⚙️",
  };

  if (!token || !profile) {
    return (
      <div className="login-shell">
        <div className="bg-layer bg-ambient"></div>
        <div className="bg-layer bg-rays"></div>
        <div className="bg-layer bg-grid"></div>
        <div className="bg-layer bg-accents"></div>
        <div className="bg-layer bg-glow"></div>
        <div className="login-card animate-scale-in">
          <div className="logo-section">
            <div className="logo-icon">🏪</div>
            <p className="eyebrow">GenAI-Powered Inventory Operations</p>
            <h1>Retail Inventory Manager</h1>
            <p className="muted">
              Complete retail solution with POS, CRM, multi-warehouse, supplier management, and AI-powered insights.
            </p>
          </div>
          <form onSubmit={handleLogin} className="stack">
            <div className="input-group">
              <label>Email</label>
              <input
                value={loginForm.email}
                onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                placeholder="Enter your email"
              />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                placeholder="Enter your password"
              />
            </div>
            <button type="submit" className="login-btn">Sign In</button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          <div className="demo-accounts">
            <p className="demo-title">Demo Accounts:</p>
            <div className="demo-list">
              <span>manager@inventory.local</span>
              <span>moderator@inventory.local</span>
              <span>user@inventory.local</span>
            </div>
            <p className="demo-password">Password: ChangeMe123!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="bg-layer bg-ambient"></div>
      <div className="bg-layer bg-rays"></div>
      <div className="bg-layer bg-grid"></div>
      <div className="bg-layer bg-accents"></div>
      <div className="bg-layer bg-glow"></div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-icon">🏪</span>
            <span className="brand-text">Retail Manager</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavItem
            icon={icons.dashboard}
            label="Dashboard"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavItem
            icon={icons.pos}
            label="Point of Sale"
            active={activeTab === "pos"}
            onClick={() => setActiveTab("pos")}
          />
          <NavItem
            icon={icons.inventory}
            label="Inventory"
            active={activeTab === "inventory"}
            onClick={() => setActiveTab("inventory")}
          />
          <NavItem
            icon={icons.customers}
            label="Customers"
            active={activeTab === "customers"}
            onClick={() => setActiveTab("customers")}
          />
          <NavItem
            icon={icons.suppliers}
            label="Suppliers"
            active={activeTab === "suppliers"}
            onClick={() => setActiveTab("suppliers")}
          />
          <NavItem
            icon={icons.purchaseOrders}
            label="Purchase Orders"
            active={activeTab === "purchaseOrders"}
            onClick={() => setActiveTab("purchaseOrders")}
          />
          <NavItem
            icon={icons.warehouses}
            label="Warehouses"
            active={activeTab === "warehouses"}
            onClick={() => setActiveTab("warehouses")}
          />
          <NavItem
            icon={icons.reports}
            label="Reports"
            active={activeTab === "reports"}
            onClick={() => setActiveTab("reports")}
          />
          <NavItem
            icon={icons.email}
            label="Email"
            active={activeTab === "email"}
            onClick={() => setActiveTab("email")}
          />
          <NavItem
            icon={icons.charts}
            label="Analytics"
            active={activeTab === "charts"}
            onClick={() => setActiveTab("charts")}
          />
          <NavItem
            icon={icons.notifications}
            label="Notifications"
            active={activeTab === "notifications"}
            onClick={() => setActiveTab("notifications")}
            badge={notificationCount}
          />
          <NavItem
            icon={icons.agents}
            label="AI Agents"
            active={activeTab === "agents"}
            onClick={() => setActiveTab("agents")}
          />
          {(profile.role === "manager" || profile.role === "moderator") && (
            <NavItem
              icon={icons.bulkImport}
              label="Bulk Import"
              active={activeTab === "bulkImport"}
              onClick={() => setActiveTab("bulkImport")}
            />
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{profile.full_name}</span>
            <span className={`role-pill ${roleClass(profile.role)}`}>{profile.role}</span>
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={toggleDarkMode} title="Toggle Dark Mode">
              {darkMode ? "☀️" : "🌙"}
            </button>
            <button
              type="button"
              className="icon-btn logout"
              onClick={() => {
                clearSession();
              }}
              title="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {error ? <div className="error-banner">{error}</div> : null}

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <Dashboard token={token} onError={setError} formatCurrency={formatCurrency} />
        )}

        {/* POS Tab */}
        {activeTab === "pos" && (
          <POS token={token} onError={setError} formatCurrency={formatCurrency} />
        )}

        {/* Inventory Tab */}
        {activeTab === "inventory" && (
          <div className="page">
            <header className="page-header animate-slide-up">
              <div>
                <p className="eyebrow">Inventory Management</p>
                <h1>Product Catalog</h1>
              </div>
              <div className="header-actions">
                <input
                  className="search-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") loadItems(token, event.currentTarget.value);
                  }}
                  placeholder="Search by SKU, name, category"
                />
                <button onClick={() => loadItems()}>Refresh</button>
              </div>
            </header>

            <div className="grid inventory-grid">
              <section className="panel animate-slide-up inventory-list-panel">
                <div className="panel-head">
                  <h2>Products ({items.length})</h2>
                </div>
        <div className="inventory-list">
          {items.map((item) => (
            <button
              type="button"
              key={item.sku}
              className={`entity-row inventory-card ${selectedSku === item.sku ? "selected" : ""}`}
              onClick={() => setSelectedSku(item.sku)}
            >
              <div className="inventory-card-media">
                {item.image_url ? (
                  <img
                    src={resolveApiAssetUrl(item.image_url)}
                    alt={item.name}
                    className="inventory-card-thumb"
                  />
                ) : (
                  <div className="inventory-card-thumb inventory-card-thumb-placeholder" aria-hidden="true">
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="inventory-card-overlay">
                <div className="item-info">
                  <strong>{item.name}</strong>
                  <p>{item.sku} • {item.category}</p>
                </div>
                <div className={`stock-badge ${item.quantity <= item.reorder_level ? "danger" : "healthy"}`}>
                  <span className="stock-count">{item.quantity}</span>
                  <span className="stock-label">in stock</span>
                </div>
              </div>
            </button>
          ))}
        </div>
              </section>

              <section className="panel animate-slide-up item-detail-panel">
                <div className="panel-head">
                  <h2>Product Details</h2>
                  {selectedItem && (profile.role === "moderator" || profile.role === "manager") && (
                    <div className="product-actions">
                      {isEditingItem ? (
                        <button type="button" className="secondary" onClick={cancelEditingItem}>
                          Cancel
                        </button>
                      ) : (
                        <button type="button" className="secondary" onClick={startEditingItem}>
                          Edit Product
                        </button>
                      )}
                      {profile.role === "manager" && (
                        <button type="button" className="danger-button" onClick={handleDeleteItem} disabled={itemDeleting}>
                          {itemDeleting ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {selectedItem ? (
                  <div className="stack">
                    {isEditingItem ? (
                      <form onSubmit={handleUpdateItem} className="form-grid">
                        <div className="input-group">
                          <label>SKU</label>
                          <input value={editItemForm.sku} disabled />
                        </div>
                        <div className="input-group">
                          <label>Name</label>
                          <input value={editItemForm.name} onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })} required />
                        </div>
                        <div className="input-group">
                          <label>Barcode</label>
                          <input value={editItemForm.barcode} onChange={(e) => setEditItemForm({ ...editItemForm, barcode: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Category</label>
                          <input value={editItemForm.category} onChange={(e) => setEditItemForm({ ...editItemForm, category: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Brand</label>
                          <input value={editItemForm.brand} onChange={(e) => setEditItemForm({ ...editItemForm, brand: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Quantity</label>
                          <input type="number" value={editItemForm.quantity} onChange={(e) => setEditItemForm({ ...editItemForm, quantity: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Reorder Level</label>
                          <input type="number" value={editItemForm.reorder_level} onChange={(e) => setEditItemForm({ ...editItemForm, reorder_level: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Reorder Quantity</label>
                          <input type="number" value={editItemForm.reorder_quantity} onChange={(e) => setEditItemForm({ ...editItemForm, reorder_quantity: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Unit Price (INR)</label>
                          <input type="number" step="0.01" value={editItemForm.unit_price} onChange={(e) => setEditItemForm({ ...editItemForm, unit_price: e.target.value })} />
                        </div>
                        <div className="input-group">
                          <label>Cost Price (INR)</label>
                          <input type="number" step="0.01" value={editItemForm.cost_price} onChange={(e) => setEditItemForm({ ...editItemForm, cost_price: e.target.value })} />
                        </div>
                        <div className="input-group full-width">
                          <label>Description</label>
                          <textarea value={editItemForm.description} onChange={(e) => setEditItemForm({ ...editItemForm, description: e.target.value })} rows="3" />
                        </div>
                        <button type="submit" className="full-width" disabled={itemSaving}>
                          {itemSaving ? "Saving..." : "Save Product Changes"}
                        </button>
                      </form>
                    ) : (
                      <>
                    <div className="product-image-panel">
                      {selectedItem.image_url ? (
                        <img src={resolveApiAssetUrl(selectedItem.image_url)} alt={selectedItem.name} />
                      ) : (
                        <div className="product-image-placeholder">
                          <span>{selectedItem.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                      )}
                      {(profile.role === "moderator" || profile.role === "manager") && (
                        <>
                          <div className={`comfy-status ${comfyStatus?.available ? "ready" : "offline"}`}>
                            {comfyStatus?.available
                              ? `ComfyUI ready (${comfyStatus.checkpoints?.length || 0} checkpoints)`
                              : `ComfyUI unavailable${comfyStatus?.base_url ? ` at ${comfyStatus.base_url}` : ""}`}
                          </div>
                          <button className="secondary" onClick={generateProductImage} disabled={imageGenerating || comfyStatus?.available === false}>
                            {imageGenerating ? "Generating Image..." : "Generate Product Image"}
                          </button>
                          <textarea
                            rows="3"
                            value={imagePrompt}
                            onChange={(event) => setImagePrompt(event.target.value)}
                            placeholder="Optional image prompt, e.g. front-facing physical book with cover art visible"
                          />
                          {selectedItem.image_prompt ? (
                            <details className="image-prompt-details">
                              <summary>Last image prompt</summary>
                              <p>{selectedItem.image_prompt}</p>
                            </details>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="data-grid">
                      <div><span>SKU</span><strong>{selectedItem.sku}</strong></div>
                      <div><span>Category</span><strong>{selectedItem.category}</strong></div>
                      <div><span>Brand</span><strong>{selectedItem.brand || "N/A"}</strong></div>
                      <div><span>Quantity</span><strong>{selectedItem.quantity}</strong></div>
                      <div><span>Unit Price</span><strong>{formatCurrency(selectedItem.unit_price)}</strong></div>
                      <div><span>Cost Price</span><strong>{formatCurrency(selectedItem.cost_price || 0)}</strong></div>
                    </div>
                    <div className="item-description">
                      <h4>Description</h4>
                      <p>{selectedItem.description || "No description available"}</p>
                    </div>
                    <div className="ai-summary-section">
                      <h4>AI Summary</h4>
                      <textarea
                        rows="3"
                        value={summaryQuestion}
                        onChange={(event) => setSummaryQuestion(event.target.value)}
                        placeholder="Ask a question about this item..."
                      />
                      <button onClick={askSummary} className="secondary">Generate Summary</button>
                      {summary ? <pre className="response-box">{summary}</pre> : null}
                    </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="muted">Select a product to view details</p>
                )}
              </section>

              {(profile.role === "moderator" || profile.role === "manager") && (
                <section className="panel animate-slide-up">
                  <h2>Add New Product</h2>
                  <form onSubmit={handleCreateItem} className="form-grid">
                    <div className="input-group">
                      <label>SKU</label>
                      <input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} required />
                    </div>
                    <div className="input-group">
                      <label>Name</label>
                      <input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required />
                    </div>
                    <div className="input-group">
                      <label>Barcode</label>
                      <input value={itemForm.barcode} onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label>Category</label>
                      <input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label>Quantity</label>
                      <input type="number" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label>Reorder Level</label>
                      <input type="number" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label>Unit Price (₹)</label>
                      <input type="number" step="0.01" value={itemForm.unit_price} onChange={(e) => setItemForm({ ...itemForm, unit_price: e.target.value })} />
                    </div>
                    <div className="input-group">
                      <label>Cost Price (₹)</label>
                      <input type="number" step="0.01" value={itemForm.cost_price} onChange={(e) => setItemForm({ ...itemForm, cost_price: e.target.value })} />
                    </div>
                    <div className="input-group full-width">
                      <label>Description</label>
                      <textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} rows="3" />
                    </div>
                    <button type="submit" className="full-width">Create Product</button>
                  </form>
                </section>
              )}

              <section className="panel animate-slide-up">
                <h2>Helpdesk Chatbot</h2>
                <textarea
                  rows="4"
                  value={chat.message}
                  onChange={(event) => setChat({ ...chat, message: event.target.value })}
                  placeholder="Ask about inventory, sales, or get help with the system..."
                />
                <button onClick={sendChat}>Ask Helpdesk</button>
                {chat.answer ? <pre className="response-box">{chat.answer}</pre> : null}
              </section>

              <section className="panel animate-slide-up">
                <h2>Barcode Lookup</h2>
                <form onSubmit={lookupBarcode} className="stack">
                  <input
                    value={barcodeLookup.query}
                    onChange={(event) => setBarcodeLookup({ ...barcodeLookup, query: event.target.value })}
                    placeholder="Enter barcode"
                  />
                  <button type="submit">Lookup</button>
                </form>
                {barcodeLookup.result ? (
                  <div className="result-card">
                    <p><strong>Name:</strong> {barcodeLookup.result.product_name || "Unknown"}</p>
                    <p><strong>Brand:</strong> {barcodeLookup.result.brand || "Unknown"}</p>
                    <p><strong>Categories:</strong> {barcodeLookup.result.categories || "Unknown"}</p>
                  </div>
                ) : null}
              </section>

              <section className="panel animate-slide-up">
                <h2>Postal Lookup</h2>
                <form onSubmit={lookupPostal} className="stack inline">
                  <input
                    value={postalLookup.country}
                    onChange={(event) => setPostalLookup({ ...postalLookup, country: event.target.value })}
                    placeholder="Country code"
                  />
                  <input
                    value={postalLookup.postal}
                    onChange={(event) => setPostalLookup({ ...postalLookup, postal: event.target.value })}
                    placeholder="Postal code"
                  />
                  <button type="submit">Lookup</button>
                </form>
                {postalLookup.result?.places?.length ? (
                  <div className="postal-results">
                    <div className="postal-results-head">
                      <strong>{postalLookup.result.postal_code}</strong>
                      <span>{postalLookup.result.country}</span>
                    </div>
                    <div className="postal-map-shell">
                      <PostalLookupMap coordinate={postalMap.coordinate} />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="panel animate-slide-up">
                <h2>Shipping Estimate</h2>
                <form onSubmit={getShippingEstimate} className="stack">
                  <input value={shipping.origin_address} onChange={(e) => setShipping({ ...shipping, origin_address: e.target.value })} placeholder="Origin address" />
                  <input value={shipping.destination_address} onChange={(e) => setShipping({ ...shipping, destination_address: e.target.value })} placeholder="Destination address" />
                  <input type="number" step="0.1" value={shipping.weight_kg} onChange={(e) => setShipping({ ...shipping, weight_kg: e.target.value })} placeholder="Weight (kg)" />
                  <button type="submit">Estimate</button>
                </form>
                {shippingAnswer ? (
                  <div className="result-card">
                    <p><strong>Cost:</strong> {formatCurrency(shippingAnswer.estimated_cost)}</p>
                    <p><strong>Distance:</strong> {shippingAnswer.estimated_distance_km} km</p>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === "customers" && (
          <Customers token={token} onError={setError} formatCurrency={formatCurrency} />
        )}

        {/* Suppliers Tab */}
        {activeTab === "suppliers" && (
          <Suppliers token={token} onError={setError} formatCurrency={formatCurrency} />
        )}

        {/* Purchase Orders Tab */}
        {activeTab === "purchaseOrders" && (
          <PurchaseOrders token={token} onError={setError} formatCurrency={formatCurrency} />
        )}

        {/* Warehouses Tab */}
        {activeTab === "warehouses" && (
          <Warehouses token={token} onError={setError} />
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <Reports token={token} onError={setError} formatCurrency={formatCurrency} />
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <Notifications token={token} onError={setError} onRead={() => setNotificationCount(0)} />
        )}

        {activeTab === "agents" && (
          <AgentAutomation token={token} onError={setError} />
        )}

        {/* Bulk Import Tab */}
        {activeTab === "bulkImport" && (
          <BulkImport token={token} onError={setError} />
        )}

        {/* Email Tab */}
        {activeTab === "email" && (
          <div className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">Communication</p>
                <h1>Email Center</h1>
              </div>
            </header>
            <div className="grid">
              <EmailForm />
            </div>
          </div>
        )}

        {/* Charts Tab */}
        {activeTab === "charts" && (
          <div className="page">
            <header className="page-header">
              <div>
                <p className="eyebrow">Analytics</p>
                <h1>Charts & Visualizations</h1>
              </div>
            </header>
            <div className="grid">
              <ChartBuilder />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
