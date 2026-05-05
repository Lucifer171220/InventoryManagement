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

export default function Warehouses({ token, onError, formatCurrency }) {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    postal_code: "",
    country_code: "IN",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    loadWarehouses();
  }, []);

  async function loadWarehouses() {
    try {
      setLoading(true);
      const data = await request("/warehouses", {}, token);
      setWarehouses(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWarehouseInventory(warehouseId) {
    try {
      const data = await request(`/warehouses/${warehouseId}/inventory`, {}, token);
      setInventory(data);
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingWarehouse) {
        await request(`/warehouses/${editingWarehouse.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...formData,
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          }),
        }, token);
      } else {
        await request("/warehouses", {
          method: "POST",
          body: JSON.stringify({
            ...formData,
            latitude: formData.latitude ? parseFloat(formData.latitude) : null,
            longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          }),
        }, token);
      }
      setFormData({ name: "", code: "", address: "", postal_code: "", country_code: "IN", latitude: "", longitude: "" });
      setShowForm(false);
      setEditingWarehouse(null);
      loadWarehouses();
    } catch (err) {
      onError(err.message);
    }
  }

  function startEditWarehouse(warehouse) {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address || "",
      postal_code: warehouse.postal_code || "",
      country_code: warehouse.country_code || "IN",
      latitude: warehouse.latitude || "",
      longitude: warehouse.longitude || "",
    });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingWarehouse(null);
    setShowForm(false);
    setFormData({ name: "", code: "", address: "", postal_code: "", country_code: "IN", latitude: "", longitude: "" });
  }

  async function handleDelete(warehouseId) {
    if (!confirm("Are you sure you want to deactivate this warehouse?")) return;
    try {
      await request(`/warehouses/${warehouseId}`, { method: "DELETE" }, token);
      setSelectedWarehouse(null);
      loadWarehouses();
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleAdjustInventory(itemId, quantity) {
    if (!selectedWarehouse) return;
    try {
      await request(`/warehouses/${selectedWarehouse.id}/inventory/${itemId}/adjust`, {
        method: "POST",
        body: JSON.stringify({ quantity: parseInt(quantity) }),
      }, token);
      loadWarehouseInventory(selectedWarehouse.id);
    } catch (err) {
      onError(err.message);
    }
  }

  function selectWarehouse(warehouse) {
    setSelectedWarehouse(warehouse);
    loadWarehouseInventory(warehouse.id);
  }

  const filteredWarehouses = warehouses.filter((w) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return w.name.toLowerCase().includes(s) || w.code.toLowerCase().includes(s);
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
          <h1>Warehouses</h1>
        </div>
        <div className="header-actions">
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search warehouses..."
          />
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add Warehouse"}
          </button>
        </div>
      </header>

      {showForm && (
        <section className="panel animate-slide-up">
          <h2>{editingWarehouse ? "Edit Warehouse" : "Add New Warehouse"}</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="input-group">
              <label>Name *</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label>Code *</label>
              <input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="WH001"
                required
              />
            </div>
            <div className="input-group full-width">
              <label>Address</label>
              <input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Postal Code</label>
              <input
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Country Code</label>
              <input
                value={formData.country_code}
                onChange={(e) => setFormData({ ...formData, country_code: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
              />
            </div>
            <button type="submit" className="full-width">{editingWarehouse ? "Update Warehouse" : "Create Warehouse"}</button>
            {editingWarehouse && (
              <button type="button" onClick={cancelEdit} className="full-width secondary">Cancel</button>
            )}
          </form>
        </section>
      )}

      <div className="grid warehouses-grid">
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Warehouses ({filteredWarehouses.length})</h2>
          </div>
          <div className="warehouse-list entity-list">
            {filteredWarehouses.map((warehouse) => (
              <button
                type="button"
                key={warehouse.id}
                className={`entity-row ${selectedWarehouse?.id === warehouse.id ? "selected" : ""}`}
                onClick={() => selectWarehouse(warehouse)}
              >
                <div className="item-info">
                  <strong>{warehouse.name}</strong>
                  <p>{warehouse.code} • {warehouse.item_count} items</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className={`status-pill ${warehouse.is_active ? "active" : "inactive"}`}>
                    {warehouse.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {selectedWarehouse && (
          <section className="panel animate-slide-up">
            <div className="panel-head">
              <h2>Warehouse Details</h2>
              <div>
                <button className="secondary" onClick={() => startEditWarehouse(selectedWarehouse)}>
                  Edit
                </button>
                <button className="secondary" onClick={() => setSelectedWarehouse(null)} style={{ marginLeft: "0.5rem" }}>
                  Close
                </button>
              </div>
            </div>
            <div className="warehouse-details">
              <div className="detail-header">
                <div>
                  <h3>{selectedWarehouse.name}</h3>
                  <p className="warehouse-code">{selectedWarehouse.code}</p>
                </div>
                <span className={`status-pill ${selectedWarehouse.is_active ? "active" : "inactive"}`}>
                  {selectedWarehouse.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="detail-grid">
                <div><span>Address</span><strong>{selectedWarehouse.address || "N/A"}</strong></div>
                <div><span>Postal Code</span><strong>{selectedWarehouse.postal_code || "N/A"}</strong></div>
                <div><span>Country</span><strong>{selectedWarehouse.country_code}</strong></div>
                <div><span>Total Items</span><strong>{selectedWarehouse.item_count}</strong></div>
                {selectedWarehouse.latitude && (
                  <div><span>Location</span><strong>{selectedWarehouse.latitude}, {selectedWarehouse.longitude}</strong></div>
                )}
                <div><span>Created</span><strong>{new Date(selectedWarehouse.created_at).toLocaleDateString()}</strong></div>
              </div>

              <div className="detail-section">
                <h4>Inventory ({inventory.length} items)</h4>
                {inventory.length > 0 ? (
                  <div className="inventory-table">
                    <div className="table-header">
                      <span>Item</span>
                      <span>Available</span>
                      <span>Reserved</span>
                      <span>Action</span>
                    </div>
                    {inventory.map((item) => (
                      <div key={item.id} className="table-row">
                        <span>
                          <strong>Item #{item.item_id}</strong>
                          <p className="muted">{item.warehouse_name}</p>
                        </span>
                        <span style={{ color: item.available_quantity <= item.reorder_level ? "var(--danger)" : "var(--success)" }}>
                          {item.available_quantity}
                        </span>
                        <span>{item.reserved_quantity}</span>
                        <span>
                          <input
                            type="number"
                            min="0"
                            defaultValue={item.quantity}
                            style={{ width: "80px" }}
                            onBlur={(e) => {
                              if (parseInt(e.target.value) !== item.quantity) {
                                handleAdjustInventory(item.item_id, e.target.value);
                              }
                            }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No inventory in this warehouse</p>
                )}
              </div>

              {selectedWarehouse.is_active && (
                <div className="detail-section">
                  <button className="danger" onClick={() => handleDelete(selectedWarehouse.id)}>
                    Deactivate Warehouse
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <style>{`
        .warehouses-grid { grid-template-columns: 1fr 1fr; }
        .warehouse-list { max-height: calc(100vh - 300px); overflow-y: auto; }
        .warehouse-details { padding: 1rem 0; }
        .detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .detail-header h3 { margin-bottom: 0.25rem; }
        .warehouse-code { font-size: 0.875rem; color: var(--text-muted); font-family: 'Space Mono', monospace; }
        .status-pill { padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
        .status-pill.active { background: var(--success); color: white; }
        .status-pill.inactive { background: var(--text-muted); color: white; }
        .inventory-table { display: flex; flex-direction: column; gap: 0.5rem; }
        .table-header, .table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 0.5rem; align-items: center; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); }
        .table-header { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); background: transparent; padding: 0.5rem 0.75rem; }
        .table-row p { font-size: 0.75rem; color: var(--text-muted); margin: 0; }
        .danger { background: var(--danger) !important; }
        @media (max-width: 1024px) { .warehouses-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
