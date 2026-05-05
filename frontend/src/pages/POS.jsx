import { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

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
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function resolveApiAssetUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${apiOrigin}${url}`;
}

export default function POS({ token, onError, formatCurrency }) {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saleNotes, setSaleNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saleComplete, setSaleComplete] = useState(null);
  const [sales, setSales] = useState([]);
  const [showSaleHistory, setShowSaleHistory] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [salesLoading, setSalesLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [itemsData, customersData, warehousesData] = await Promise.all([
        request("/inventory", {}, token),
        request("/customers", {}, token),
        request("/warehouses", {}, token),
      ]);
      setItems(itemsData);
      setCustomers(customersData);
      setWarehouses(warehousesData);
      if (warehousesData.length > 0) {
        setSelectedWarehouse(warehousesData[0].id.toString());
      }
    } catch (err) {
      onError(err.message);
    }
  }

  async function loadSales() {
    try {
      setSalesLoading(true);
      const data = await request("/sales", {}, token);
      setSales(data || []);
    } catch (err) {
      onError(err.message);
    } finally {
      setSalesLoading(false);
    }
  }

  async function handleCancelSale(saleId) {
    if (!window.confirm("Are you sure you want to cancel this sale? Items will be returned to inventory.")) {
      return;
    }
    try {
      await request(`/sales/${saleId}/cancel`, { method: "POST" }, token);
      setSelectedSale(null);
      loadSales();
    } catch (err) {
      onError(err.message);
    }
  }

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode?.toLowerCase().includes(search.toLowerCase())
  );

function addToCart(item) {
  const existing = cart.find((c) => c.item_id === item.id);
  if (existing) {
    setCart(cart.map((c) => (c.item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c)));
  } else {
    setCart([
      ...cart,
      {
        item_id: item.id,
        name: item.name,
        sku: item.sku,
        image_url: item.image_url,
        unit_price: item.sale_price || item.unit_price,
        quantity: 1,
        discount_percent: 0,
      },
    ]);
  }
}

  function updateQuantity(itemId, quantity) {
    if (quantity <= 0) {
      setCart(cart.filter((c) => c.item_id !== itemId));
    } else {
      setCart(cart.map((c) => (c.item_id === itemId ? { ...c, quantity } : c)));
    }
  }

  function updateDiscount(itemId, discount) {
    setCart(cart.map((c) => (c.item_id === itemId ? { ...c, discount_percent: discount } : c)));
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discount = cart.reduce(
    (sum, item) => sum + (item.unit_price * item.quantity * item.discount_percent) / 100,
    0
  );
  const tax = ((subtotal - discount) * 18) / 100; // 18% GST
  const total = subtotal - discount + tax;

  async function completeSale() {
    if (cart.length === 0) {
      onError("Cart is empty");
      return;
    }
    if (!selectedWarehouse) {
      onError("Please select a warehouse");
      return;
    }

    try {
      setLoading(true);
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
      setSaleNotes("");
      setSelectedCustomer("");
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function printReceipt() {
    window.print();
  }

  if (saleComplete) {
    return (
      <div className="page">
        <section className="panel animate-slide-up" style={{ maxWidth: "500px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>✅</div>
            <h1>Sale Complete!</h1>
            <p className="muted">Receipt #{saleComplete.sale_code}</p>

            <div style={{ marginTop: "2rem", textAlign: "left" }}>
              <div className="receipt-line">
                <span>Subtotal:</span>
                <span>{formatCurrency(saleComplete.subtotal)}</span>
              </div>
              <div className="receipt-line">
                <span>Tax (18%):</span>
                <span>{formatCurrency(saleComplete.tax_amount)}</span>
              </div>
              <div className="receipt-line">
                <span>Discount:</span>
                <span>-{formatCurrency(saleComplete.discount_amount)}</span>
              </div>
              <div className="receipt-line total">
                <span>Total:</span>
                <span>{formatCurrency(saleComplete.total_amount)}</span>
              </div>
              <div className="receipt-line" style={{ marginTop: "1rem" }}>
                <span>Payment:</span>
                <span style={{ textTransform: "capitalize" }}>{saleComplete.payment_method}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
              <button onClick={printReceipt} className="secondary">
                Print Receipt
              </button>
              <button onClick={() => setSaleComplete(null)}>New Sale</button>
            </div>
          </div>
        </section>

        <style>{`
          .receipt-line {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--glass-border);
          }
          .receipt-line.total {
            font-weight: 700;
            font-size: 1.25rem;
            border-top: 2px solid var(--text-primary);
            margin-top: 0.5rem;
            padding-top: 0.75rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Point of Sale</p>
          <h1>{showSaleHistory ? "Sale History" : "New Sale"}</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => {
            if (!showSaleHistory) {
              loadSales();
            }
            setShowSaleHistory(!showSaleHistory);
            setSelectedSale(null);
          }}>
            {showSaleHistory ? "Back to POS" : "View Sales History"}
          </button>
        </div>
      </header>

      {showSaleHistory ? (
        <section className="panel animate-slide-up">
          <h2>Sales History</h2>
          {salesLoading ? (
            <div className="loading-state">Loading sales...</div>
          ) : sales.length === 0 ? (
            <div className="empty-state">
              <p>No sales found</p>
            </div>
          ) : (
            <div className="sales-list">
              {sales.map((sale) => (
                <button
                  key={sale.id}
                  className={`inventory-card ${selectedSale?.id === sale.id ? "selected" : ""}`}
                  onClick={() => setSelectedSale(sale)}
                >
                  <div className="item-info">
                    <strong>{sale.sale_code}</strong>
                    <p>{sale.customer_name || "Walk-in Customer"}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      className="status-pill"
                      style={{
                        background: sale.status === "completed" ? "var(--success)" :
                                   sale.status === "cancelled" ? "var(--danger)" : "var(--warning)",
                        color: "white"
                      }}
                    >
                      {sale.status}
                    </span>
                    <p style={{ fontWeight: 600, marginTop: "0.25rem" }}>
                      {formatCurrency(sale.total_amount)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
      <div className="grid pos-grid">
        {/* Product Selection */}
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Products</h2>
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
            />
          </div>
        <div className="pos-product-list">
          {filteredItems.map((item) => (
        <button
        key={item.id}
        className="pos-product-card"
        onClick={() => addToCart(item)}
        disabled={item.quantity <= 0}
        >
          <div className="product-image-wrapper">
            <img 
              src={item.image_url ? resolveApiAssetUrl(item.image_url) : '/image/placeholder.svg'} 
              alt={item.name}
              className="product-image"
            />
          </div>
          <div className="product-card-content">
            <div className="product-info">
              <strong>{item.name}</strong>
              <p>{item.sku}</p>
            </div>
            <div className="product-price">
              {formatCurrency(item.sale_price || item.unit_price)}
            </div>
          </div>
        </button>
          ))}
        </div>
        </section>

        {/* Cart */}
        <section className="panel animate-slide-up">
          <h2>Cart ({cart.length} items)</h2>

          <div className="form-row">
            <div className="input-group">
              <label>Customer</label>
              <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} ({c.customer_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Warehouse</label>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                required
              >
                <option value="">Select Warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

{cart.length > 0 ? (
          <div className="cart-items">
            {cart.map((item) => (
<div key={item.item_id} className="cart-item">
          <div className="cart-item-image">
            {item.image_url ? (
              <img src={resolveApiAssetUrl(item.image_url)} alt={item.name} />
            ) : (
              <div className="cart-item-image-placeholder">{item.sku || item.name.slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="cart-item-info">
            <strong>{item.name}</strong>
            <p>SKU: {item.sku} | {formatCurrency(item.unit_price)} each</p>
          </div>
                <div className="cart-item-controls">
                  <div className="quantity-control">
                    <button onClick={() => updateQuantity(item.item_id, item.quantity - 1)}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.item_id, item.quantity + 1)}>+</button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount_percent}
                    onChange={(e) => updateDiscount(item.item_id, parseFloat(e.target.value) || 0)}
                    className="discount-input"
                    placeholder="Discount %"
                  />
                </div>
                <div className="cart-item-total">
                  {formatCurrency(item.unit_price * item.quantity * (1 - item.discount_percent / 100))}
                </div>
              </div>
            ))}
          </div>
        ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🛒</div>
              <p>Cart is empty</p>
            </div>
          )}

          <div className="cart-summary">
            <div className="summary-line">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="summary-line">
              <span>Discount:</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
            <div className="summary-line">
              <span>Tax (18%):</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="summary-line total">
              <span>Total:</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="input-group" style={{ marginTop: "1rem" }}>
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="netbanking">Net Banking</option>
            </select>
          </div>

          <div className="input-group" style={{ marginTop: "1rem" }}>
            <label>Notes</label>
            <textarea
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              rows="2"
              placeholder="Add any notes..."
            />
          </div>

          <button
            onClick={completeSale}
            disabled={cart.length === 0 || loading || !selectedWarehouse}
            style={{ marginTop: "1.5rem", width: "100%" }}
          >
            {loading ? "Processing..." : `Complete Sale - ${formatCurrency(total)}`}
          </button>
        </section>
      </div>
      )}

      {selectedSale && (
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Sale Details</h2>
            <div>
              {selectedSale.status === "completed" && (
                <button
                  className="danger"
                  onClick={() => handleCancelSale(selectedSale.id)}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Cancel Sale
                </button>
              )}
              <button
                className="secondary"
                onClick={() => setSelectedSale(null)}
                style={{ marginLeft: "0.5rem" }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="sale-details">
            <div className="detail-grid">
              <div><span>Sale Code</span><strong>{selectedSale.sale_code}</strong></div>
              <div><span>Customer</span><strong>{selectedSale.customer_name || "Walk-in Customer"}</strong></div>
              <div><span>Status</span><strong>{selectedSale.status}</strong></div>
              <div><span>Payment</span><strong style={{ textTransform: "capitalize" }}>{selectedSale.payment_method}</strong></div>
              <div><span>Subtotal</span><strong>{formatCurrency(selectedSale.subtotal)}</strong></div>
              <div><span>Tax</span><strong>{formatCurrency(selectedSale.tax_amount)}</strong></div>
              <div><span>Discount</span><strong>-{formatCurrency(selectedSale.discount_amount)}</strong></div>
              <div><span>Total</span><strong style={{ color: "var(--success)" }}>{formatCurrency(selectedSale.total_amount)}</strong></div>
            </div>
            {selectedSale.notes && (
              <div className="detail-section">
                <h4>Notes</h4>
                <p>{selectedSale.notes}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <style>{`
        .pos-grid {
          grid-template-columns: 1fr 400px;
        }
        
        .pos-product-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 0.75rem;
          max-height: calc(100vh - 300px);
          overflow-y: auto;
          padding-right: 0.5rem;
        }
        
.pos-product-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  min-height: 140px;
  position: relative;
  overflow: hidden;
  gap: 0.5rem;
}

.product-image-wrapper {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-elevated);
  margin-bottom: 0.5rem;
}

.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pos-product-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 100%);
  z-index: 0;
  transition: all 0.2s;
}

.pos-product-card:hover::before {
  background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%);
}

.pos-product-card .product-card-content {
  position: relative;
  z-index: 1;
  width: 100%;
  text-align: center;
}
        
.pos-product-card:hover {
  border-color: var(--accent-blue);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
        
        .pos-product-card:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .pos-product-card .product-info {
          text-align: center;
          margin-bottom: 0.5rem;
        }
        
        .pos-product-card strong {
          font-size: 0.875rem;
          display: block;
          margin-bottom: 0.25rem;
        }
        
        .pos-product-card p {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        .pos-product-card .product-price {
          font-weight: 700;
          color: var(--success);
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .cart-items {
          max-height: 300px;
          overflow-y: auto;
          margin: 1rem 0;
        }
        
.cart-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 0.5rem;
}

.cart-item-image {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
}

.cart-item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cart-item-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-card);
}

.cart-item-info {
  flex: 1;
  min-width: 0;
}
        
        .cart-item-info p {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0;
        }
        
        .cart-item-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .quantity-control {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        
.quantity-control button {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 1.25rem;
  font-weight: 600;
  background: var(--bg-elevated);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  cursor: pointer;
  line-height: 1;
}

.quantity-control button:hover {
  background: var(--accent-blue);
  color: white;
  border-color: var(--accent-blue);
}
        
        .quantity-control span {
          min-width: 24px;
          text-align: center;
          font-weight: 600;
        }
        
        .discount-input {
          width: 60px;
          padding: 0.375rem;
          font-size: 0.75rem;
        }
        
        .cart-item-total {
          font-weight: 600;
          min-width: 80px;
          text-align: right;
        }
        
        .cart-summary {
          border-top: 1px solid var(--glass-border);
          padding-top: 1rem;
          margin-top: 1rem;
        }
        
        .summary-line {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
        }
        
        .summary-line.total {
          font-weight: 700;
          font-size: 1.25rem;
          border-top: 1px solid var(--glass-border);
          margin-top: 0.5rem;
          padding-top: 0.75rem;
        }
        
        @media (max-width: 1024px) {
          .pos-grid {
            grid-template-columns: 1fr;
          }
        }

        .sales-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: calc(100vh - 350px);
          overflow-y: auto;
        }

        .sale-details {
          padding: 1rem 0;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .detail-grid > div {
          padding: 0.75rem;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
        }

        .detail-grid span {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }

        .danger {
          background: var(--danger) !important;
          color: white !important;
        }

        .danger:hover {
          opacity: 0.9;
        }

        .status-pill {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.75rem;
          text-transform: uppercase;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
