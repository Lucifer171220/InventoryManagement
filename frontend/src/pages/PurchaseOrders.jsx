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

const statusColors = {
  draft: "#6b7280",
  sent: "#3b82f6",
  confirmed: "#8b5cf6",
  partial: "#f59e0b",
  received: "#10b981",
  cancelled: "#ef4444",
};

export default function PurchaseOrders({ token, onError, formatCurrency }) {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [showReceiveForm, setShowReceiveForm] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    supplier_id: "",
    warehouse_id: "",
    expected_delivery: "",
    notes: "",
    items: [],
  });
  const [receiveData, setReceiveData] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [ordersData, statsData, suppliersData, warehousesData, itemsData] = await Promise.all([
        request("/purchase-orders", {}, token),
        request("/purchase-orders/stats/overview", {}, token),
        request("/suppliers", {}, token),
        request("/warehouses", {}, token),
        request("/inventory", {}, token),
      ]);
      setOrders(ordersData);
      setStats(statsData);
      setSuppliers(suppliersData);
      setWarehouses(warehousesData);
      setItems(itemsData);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function addItemToOrder(itemId) {
    const item = items.find((i) => i.id === parseInt(itemId));
    if (!item) return;
    if (formData.items.find((i) => i.item_id === parseInt(itemId))) return;

    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { item_id: parseInt(itemId), quantity: 1, unit_price: item.cost_price || item.unit_price, name: item.name, sku: item.sku },
      ],
    });
  }

  function updateOrderItem(itemId, field, value) {
    setFormData({
      ...formData,
      items: formData.items.map((i) => (i.item_id === itemId ? { ...i, [field]: value } : i)),
    });
  }

  function removeOrderItem(itemId) {
    setFormData({
      ...formData,
      items: formData.items.filter((i) => i.item_id !== itemId),
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingOrder) {
        await request(`/purchase-orders/${editingOrder.id}`, {
          method: "PUT",
          body: JSON.stringify({
            supplier_id: parseInt(formData.supplier_id),
            warehouse_id: parseInt(formData.warehouse_id),
            expected_delivery: formData.expected_delivery || null,
            notes: formData.notes,
            items: formData.items.map((i) => ({
              item_id: i.item_id,
              quantity: parseInt(i.quantity),
              unit_price: i.unit_price,
            })),
          }),
        }, token);
      } else {
        await request("/purchase-orders", {
          method: "POST",
          body: JSON.stringify({
            supplier_id: parseInt(formData.supplier_id),
            warehouse_id: parseInt(formData.warehouse_id),
            expected_delivery: formData.expected_delivery || null,
            notes: formData.notes,
            items: formData.items.map((i) => ({
              item_id: i.item_id,
              quantity: parseInt(i.quantity),
              unit_price: i.unit_price,
            })),
          }),
        }, token);
      }
      setFormData({ supplier_id: "", warehouse_id: "", expected_delivery: "", notes: "", items: [] });
      setShowForm(false);
      setEditingOrder(null);
      loadData();
    } catch (err) {
      onError(err.message);
    }
  }

  function startEditOrder(order) {
    setEditingOrder(order);
    setFormData({
      supplier_id: order.supplier_id,
      warehouse_id: order.warehouse_id,
      expected_delivery: order.expected_delivery ? order.expected_delivery.split("T")[0] : "",
      notes: order.notes || "",
      items: order.items.map((i) => ({
        item_id: i.item_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        name: i.item_name,
        sku: i.item_sku,
      })),
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingOrder(null);
    setShowForm(false);
    setFormData({ supplier_id: "", warehouse_id: "", expected_delivery: "", notes: "", items: [] });
  }

  async function handleStatusChange(orderId, newStatus) {
    try {
      await request(`/purchase-orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      }, token);
      loadData();
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleReceive(orderId) {
    const orderItems = receiveData[orderId] || [];
    try {
      await request(`/purchase-orders/${orderId}/receive`, {
        method: "POST",
        body: JSON.stringify({
          items: orderItems.map((i) => ({
            item_id: i.item_id,
            quantity_received: parseInt(i.quantity_received),
          })),
        }),
      }, token);
      setShowReceiveForm(null);
      setReceiveData({});
      loadData();
      setSelectedOrder(null);
    } catch (err) {
      onError(err.message);
    }
  }

  function initReceiveData(order) {
    const data = order.items.map((i) => ({
      item_id: i.item_id,
      quantity_received: i.quantity - i.received_quantity,
      max_quantity: i.quantity - i.received_quantity,
      name: i.item_name,
      sku: i.item_sku,
    }));
    setReceiveData({ ...receiveData, [order.id]: data });
    setShowReceiveForm(order.id);
  }

  const filteredOrders = orders.filter((order) => {
    if (filterStatus && order.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return order.po_number.toLowerCase().includes(s) || order.supplier_name.toLowerCase().includes(s);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="page">
        <div className="loading-skeleton" style={{ height: "200px", borderRadius: "16px" }} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Supply Chain</p>
          <h1>Purchase Orders</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Create PO"}
          </button>
        </div>
      </header>

      {stats && (
        <div className="kpi-grid" style={{ marginBottom: "1.5rem" }}>
          <div className="kpi-card">
            <div className="kpi-icon">📋</div>
            <div className="kpi-content">
              <div className="kpi-title">Pending Orders</div>
              <div className="kpi-value">{stats.pending_orders}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">📅</div>
            <div className="kpi-content">
              <div className="kpi-title">Expected This Week</div>
              <div className="kpi-value">{stats.expected_this_week}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon">💰</div>
            <div className="kpi-content">
              <div className="kpi-title">Pending Value</div>
              <div className="kpi-value">{formatCurrency(stats.total_pending_value)}</div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <section className="panel animate-slide-up">
          <h2>{editingOrder ? "Edit Purchase Order" : "Create Purchase Order"}</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="input-group">
              <label>Supplier *</label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                required
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Warehouse *</label>
              <select
                value={formData.warehouse_id}
                onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                required
              >
                <option value="">Select Warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Expected Delivery</label>
              <input
                type="date"
                value={formData.expected_delivery}
                onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
              />
            </div>
            <div className="input-group full-width">
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="2"
              />
            </div>

            <div className="input-group full-width">
              <label>Add Items</label>
              <select onChange={(e) => { addItemToOrder(e.target.value); e.target.value = ""; }}>
                <option value="">Select an item to add...</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                ))}
              </select>
            </div>

            {formData.items.length > 0 && (
              <div className="full-width">
                <h4>Order Items</h4>
                {formData.items.map((item) => (
                  <div key={item.item_id} className="form-row" style={{ marginBottom: "0.5rem", alignItems: "center" }}>
                    <div style={{ flex: 2 }}>
                      <strong>{item.name}</strong>
                      <span className="muted" style={{ marginLeft: "0.5rem" }}>{item.sku}</span>
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                      <label>Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateOrderItem(item.item_id, "quantity", e.target.value)}
                      />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                      <label>Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateOrderItem(item.item_id, "unit_price", e.target.value)}
                      />
                    </div>
                    <button type="button" onClick={() => removeOrderItem(item.item_id)} style={{ padding: "0.5rem" }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <button type="submit" className="full-width" disabled={formData.items.length === 0}>
              {editingOrder ? "Update Purchase Order" : "Create Purchase Order"}
            </button>
            {editingOrder && (
              <button type="button" onClick={cancelEdit} className="full-width secondary">Cancel</button>
            )}
          </form>
        </section>
      )}

      <div className="grid purchase-orders-grid">
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Orders ({filteredOrders.length})</h2>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: "auto" }}
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="confirmed">Confirmed</option>
              <option value="partial">Partial</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="order-list entity-list">
            {filteredOrders.map((order) => (
              <button
                type="button"
                key={order.id}
                className={`entity-row ${selectedOrder?.id === order.id ? "selected" : ""}`}
                onClick={() => setSelectedOrder(order)}
              >
                <div className="item-info">
                  <strong>{order.po_number}</strong>
                  <p>{order.supplier_name} • {order.warehouse_name}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    className="status-pill"
                    style={{ background: statusColors[order.status], color: "white" }}
                  >
                    {order.status}
                  </span>
                  <p style={{ marginTop: "0.25rem", fontWeight: 600 }}>{formatCurrency(order.total_amount)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {selectedOrder && (
          <section className="panel animate-slide-up">
            <div className="panel-head">
              <h2>Order Details</h2>
              <div>
                {selectedOrder.status === "draft" && (
                  <button className="secondary" onClick={() => startEditOrder(selectedOrder)}>
                    Edit
                  </button>
                )}
                <button className="secondary" onClick={() => setSelectedOrder(null)} style={{ marginLeft: "0.5rem" }}>
                  Close
                </button>
              </div>
            </div>
            <div className="order-details">
              <div className="detail-header">
                <h3>{selectedOrder.po_number}</h3>
                <span
                  className="status-pill"
                  style={{ background: statusColors[selectedOrder.status], color: "white" }}
                >
                  {selectedOrder.status}
                </span>
              </div>

              <div className="detail-grid">
                <div><span>Supplier</span><strong>{selectedOrder.supplier_name}</strong></div>
                <div><span>Warehouse</span><strong>{selectedOrder.warehouse_name}</strong></div>
                <div><span>Expected Delivery</span><strong>{selectedOrder.expected_delivery ? new Date(selectedOrder.expected_delivery).toLocaleDateString() : "N/A"}</strong></div>
                <div><span>Created</span><strong>{new Date(selectedOrder.created_at).toLocaleDateString()}</strong></div>
              </div>

              <div className="detail-section">
                <h4>Items</h4>
                <div className="po-items-list">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="po-item">
                      <div>
                        <strong>{item.item_name}</strong>
                        <p className="muted">{item.item_sku}</p>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <p className="muted">Ordered</p>
                        <strong>{item.quantity}</strong>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <p className="muted">Received</p>
                        <strong style={{ color: item.received_quantity >= item.quantity ? "var(--success)" : "var(--warning)" }}>
                          {item.received_quantity}
                        </strong>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <strong>{formatCurrency(item.total)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-section">
                <div className="receipt-line">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="receipt-line">
                  <span>Tax (18%):</span>
                  <span>{formatCurrency(selectedOrder.tax_amount)}</span>
                </div>
                <div className="receipt-line total">
                  <span>Total:</span>
                  <span>{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
              </div>

              {selectedOrder.notes && (
                <div className="detail-section">
                  <h4>Notes</h4>
                  <p>{selectedOrder.notes}</p>
                </div>
              )}

              <div className="detail-section">
                <h4>Actions</h4>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {selectedOrder.status === "draft" && (
                    <button onClick={() => handleStatusChange(selectedOrder.id, "sent")}>Mark as Sent</button>
                  )}
                  {["sent", "confirmed"].includes(selectedOrder.status) && (
                    <button onClick={() => handleStatusChange(selectedOrder.id, "confirmed")}>Confirm</button>
                  )}
                  {["sent", "confirmed", "partial"].includes(selectedOrder.status) && (
                    <button onClick={() => initReceiveData(selectedOrder)}>Receive Items</button>
                  )}
                  {selectedOrder.status === "draft" && (
                    <button className="danger" onClick={() => handleStatusChange(selectedOrder.id, "cancelled")}>
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>

              {showReceiveForm === selectedOrder.id && (
                <div className="detail-section">
                  <h4>Receive Items</h4>
                  {(receiveData[selectedOrder.id] || []).map((item) => (
                    <div key={item.item_id} className="form-row" style={{ marginBottom: "0.5rem", alignItems: "center" }}>
                      <div style={{ flex: 2 }}>
                        <strong>{item.name}</strong>
                        <p className="muted">{item.sku}</p>
                      </div>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label>Qty (max: {item.max_quantity})</label>
                        <input
                          type="number"
                          min="0"
                          max={item.max_quantity}
                          value={item.quantity_received}
                          onChange={(e) => {
                            const newData = [...(receiveData[selectedOrder.id] || [])];
                            const idx = newData.findIndex((i) => i.item_id === item.item_id);
                            newData[idx] = { ...newData[idx], quantity_received: parseInt(e.target.value) || 0 };
                            setReceiveData({ ...receiveData, [selectedOrder.id]: newData });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => handleReceive(selectedOrder.id)}>Confirm Receipt</button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <style>{`
        .purchase-orders-grid { grid-template-columns: 1fr 1fr; }
        .order-list { max-height: calc(100vh - 400px); overflow-y: auto; }
        .order-details { padding: 1rem 0; }
        .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .detail-header h3 { margin-bottom: 0; }
        .status-pill { padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
        .po-items-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .po-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); }
        .po-item p { font-size: 0.75rem; color: var(--text-muted); margin: 0; }
        .receipt-line { display: flex; justify-content: space-between; padding: 0.5rem 0; }
        .receipt-line.total { font-weight: 700; font-size: 1.25rem; border-top: 2px solid var(--text-primary); margin-top: 0.5rem; }
        .form-row { display: flex; gap: 1rem; }
        .danger { background: var(--danger) !important; }
        @media (max-width: 1024px) { .purchase-orders-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
