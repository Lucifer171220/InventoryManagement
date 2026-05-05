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

export default function Suppliers({ token, onError, formatCurrency }) {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "India",
    tax_id: "",
    payment_terms: "",
    lead_time_days: "",
    notes: "",
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await request(`/suppliers${query}`, {}, token);
      setSuppliers(data);
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await request(`/suppliers/${editingSupplier.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...formData,
            lead_time_days: formData.lead_time_days ? parseInt(formData.lead_time_days) : null,
          }),
        }, token);
      } else {
        await request("/suppliers", {
          method: "POST",
          body: JSON.stringify({
            ...formData,
            lead_time_days: formData.lead_time_days ? parseInt(formData.lead_time_days) : null,
          }),
        }, token);
      }
      setFormData({
        name: "",
        code: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        country: "India",
        tax_id: "",
        payment_terms: "",
        lead_time_days: "",
        notes: "",
      });
      setShowForm(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (err) {
      onError(err.message);
    }
  }

  function startEditSupplier(supplier) {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      code: supplier.code || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      city: supplier.city || "",
      state: supplier.state || "",
      postal_code: supplier.postal_code || "",
      country: supplier.country || "India",
      tax_id: supplier.tax_id || "",
      payment_terms: supplier.payment_terms || "",
      lead_time_days: supplier.lead_time_days || "",
      notes: supplier.notes || "",
    });
    setShowForm(true);
  }

  async function handleDeleteSupplier(supplierId) {
    if (!window.confirm("Are you sure you want to delete this supplier? This action cannot be undone.")) {
      return;
    }
    try {
      await request(`/suppliers/${supplierId}`, {
        method: "DELETE",
      }, token);
      setSelectedSupplier(null);
      loadSuppliers();
    } catch (err) {
      onError(err.message);
    }
  }

  function cancelEdit() {
    setEditingSupplier(null);
    setShowForm(false);
    setFormData({
      name: "",
      code: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      postal_code: "",
      country: "India",
      tax_id: "",
      payment_terms: "",
      lead_time_days: "",
      notes: "",
    });
  }

  const getSupplierInitials = (supplier) =>
    (supplier.name || "SU")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Supply Chain</p>
          <h1>Suppliers</h1>
        </div>
        <div className="header-actions">
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadSuppliers()}
            placeholder="Search suppliers..."
          />
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add Supplier"}
          </button>
        </div>
      </header>

      {showForm && (
        <section className="panel animate-slide-up">
          <h2>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</h2>
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
              <label>Code</label>
              <input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="SUP001"
              />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Phone</label>
              <input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
              <label>City</label>
              <input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>State</label>
              <input
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Tax ID / GST</label>
              <input
                value={formData.tax_id}
                onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                placeholder="GST123456"
              />
            </div>
            <div className="input-group">
              <label>Payment Terms</label>
              <input
                value={formData.payment_terms}
                onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                placeholder="Net 30"
              />
            </div>
            <div className="input-group">
              <label>Lead Time (days)</label>
              <input
                type="number"
                value={formData.lead_time_days}
                onChange={(e) => setFormData({ ...formData, lead_time_days: e.target.value })}
                placeholder="7"
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
            <button type="submit" className="full-width">{editingSupplier ? "Update Supplier" : "Create Supplier"}</button>
            {editingSupplier && (
              <button type="button" onClick={cancelEdit} className="full-width secondary">Cancel</button>
            )}
          </form>
        </section>
      )}

      <div className="grid suppliers-grid">
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Supplier List ({suppliers.length})</h2>
          </div>
          <div className="supplier-list entity-list">
            {suppliers.map((supplier) => (
              <button
                type="button"
                key={supplier.id}
                className={`entity-row ${selectedSupplier?.id === supplier.id ? "selected" : ""}`}
                onClick={() => setSelectedSupplier(supplier)}
              >
                <div className="entity-row-media">
                  <div className="entity-avatar supplier" aria-hidden="true">
                    {getSupplierInitials(supplier)}
                  </div>
                </div>
                <div className="entity-row-main">
                  <div className="item-info">
                    <strong className="entity-row-title">{supplier.name}</strong>
                    <p className="entity-row-meta">{supplier.code || supplier.email || "No contact info"}</p>
                  </div>
                  <div className="entity-row-side">
                    <div className="entity-row-value">{formatCurrency(supplier.total_purchases || 0)}</div>
                    <div className="entity-row-caption">
                      {supplier.item_count || 0} products
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {selectedSupplier && (
          <section className="panel animate-slide-up">
            <div className="panel-head">
              <h2>Supplier Details</h2>
              <div>
                <button className="secondary" onClick={() => startEditSupplier(selectedSupplier)}>
                  Edit
                </button>
                <button
                  className="danger"
                  onClick={() => handleDeleteSupplier(selectedSupplier.id)}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Delete
                </button>
                <button className="secondary" onClick={() => setSelectedSupplier(null)} style={{ marginLeft: "0.5rem" }}>
                  Close
                </button>
              </div>
            </div>
            <div className="supplier-details">
              <h3>{selectedSupplier.name}</h3>
              {selectedSupplier.code && (
                <p className="supplier-code">{selectedSupplier.code}</p>
              )}

              <div className="detail-grid">
                <div>
                  <span>Email</span>
                  <strong>{selectedSupplier.email || "N/A"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{selectedSupplier.phone || "N/A"}</strong>
                </div>
                <div>
                  <span>Rating</span>
                  <strong>{selectedSupplier.rating} / 5</strong>
                </div>
                <div>
                  <span>Lead Time</span>
                  <strong>{selectedSupplier.lead_time_days || "N/A"} days</strong>
                </div>
                <div>
                  <span>Payment Terms</span>
                  <strong>{selectedSupplier.payment_terms || "N/A"}</strong>
                </div>
                <div>
                  <span>Tax ID</span>
                  <strong>{selectedSupplier.tax_id || "N/A"}</strong>
                </div>
              </div>

              {selectedSupplier.address && (
                <div className="detail-section">
                  <h4>Address</h4>
                  <p>
                    {selectedSupplier.address}
                    <br />
                    {selectedSupplier.city}, {selectedSupplier.state} {selectedSupplier.postal_code}
                    <br />
                    {selectedSupplier.country}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <style>{`
        .suppliers-grid {
          grid-template-columns: 1fr 1fr;
        }
        
        .supplier-list {
          max-height: calc(100vh - 300px);
          overflow-y: auto;
        }
        
        .supplier-details {
          padding: 1rem 0;
        }
        
        .supplier-details h3 {
          margin-bottom: 0.25rem;
        }
        
        .supplier-code {
          font-size: 0.875rem;
          color: var(--text-muted);
          font-family: 'Space Mono', monospace;
          margin-bottom: 1.5rem;
        }
        
        @media (max-width: 1024px) {
          .suppliers-grid {
            grid-template-columns: 1fr;
          }
        }

        .danger {
          background: var(--danger) !important;
          color: white !important;
        }

        .danger:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
