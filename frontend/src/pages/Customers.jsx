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

export default function Customers({ token, onError, formatCurrency }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    notes: "",
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);
      setHasLoaded(false);
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await request(`/customers${query}`, {}, token);
      setCustomers(data || []);
      setHasLoaded(true);
    } catch (err) {
      // Only show error if it's not a "no data" scenario
      if (err.message && !err.message.toLowerCase().includes("not found")) {
        onError(err.message);
      }
      setCustomers([]);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadPurchaseHistory(customerId) {
    try {
      const data = await request(`/customers/${customerId}/purchase-history`, {}, token);
      setPurchaseHistory(data || []);
    } catch (err) {
      setPurchaseHistory([]);
    }
  }

  function selectCustomer(customer) {
    setSelectedCustomer(customer);
    loadPurchaseHistory(customer.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await request(`/customers/${editingCustomer.id}`, {
          method: "PUT",
          body: JSON.stringify(formData),
        }, token);
      } else {
        await request("/customers", {
          method: "POST",
          body: JSON.stringify(formData),
        }, token);
      }
      setFormData({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        notes: "",
      });
      setShowForm(false);
      setEditingCustomer(null);
      loadCustomers();
    } catch (err) {
      onError(err.message);
    }
  }

  function startEditCustomer(customer) {
    setEditingCustomer(customer);
    setFormData({
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      postal_code: customer.postal_code || "",
      notes: customer.notes || "",
    });
    setShowForm(true);
  }

  async function handleDeleteCustomer(customerId) {
    if (!window.confirm("Are you sure you want to delete this customer? This action cannot be undone.")) {
      return;
    }
    try {
      await request(`/customers/${customerId}`, {
        method: "DELETE",
      }, token);
      setSelectedCustomer(null);
      loadCustomers();
    } catch (err) {
      onError(err.message);
    }
  }

  function cancelEdit() {
    setEditingCustomer(null);
    setShowForm(false);
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      postal_code: "",
      notes: "",
    });
  }

  const getLoyaltyBadge = (tier) => {
    const safeTier = (tier || "bronze").toLowerCase();
    return (
      <span className={`entity-pill ${safeTier}`}>
        {safeTier}
      </span>
    );
  };

  const getCustomerInitials = (customer) =>
    `${customer.first_name?.[0] || ""}${customer.last_name?.[0] || ""}` || "CU";

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Customer Management</p>
          <h1>Customers</h1>
        </div>
        <div className="header-actions">
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadCustomers()}
          placeholder="Search customers..."
        />
        <button onClick={loadCustomers} disabled={loading}>
          {loading ? "Loading..." : "Search"}
        </button>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Customer"}
        </button>
      </div>
      </header>

      {showForm && (
        <section className="panel animate-slide-up">
          <h2>{editingCustomer ? "Edit Customer" : "Add New Customer"}</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="input-group">
              <label>First Name *</label>
              <input
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label>Last Name *</label>
              <input
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
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
              <label>Postal Code</label>
              <input
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
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
            <button type="submit" className="full-width">{editingCustomer ? "Update Customer" : "Create Customer"}</button>
            {editingCustomer && (
              <button type="button" onClick={cancelEdit} className="full-width secondary">Cancel</button>
            )}
          </form>
        </section>
      )}

      <div className="grid customers-grid">
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Customer List ({customers.length})</h2>
          </div>
          <div className="customer-list entity-list">
            {loading ? (
              <div className="empty-state">
                <div className="spinner"></div>
                <p className="muted">Loading customers...</p>
              </div>
            ) : customers.length === 0 && hasLoaded ? (
              <div className="empty-state">
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>👥</div>
                <p className="muted">No customers found</p>
                <p className="muted" style={{ fontSize: "0.875rem" }}>
                  {search ? "Try adjusting your search" : "Add your first customer to get started"}
                </p>
                {!search && (
                  <button onClick={() => setShowForm(true)} style={{ marginTop: "1rem" }}>
                    Add Customer
                  </button>
                )}
              </div>
            ) : (
              customers.map((customer) => (
                <button
                  type="button"
                  key={customer.id}
                  className={`entity-row ${selectedCustomer?.id === customer.id ? "selected" : ""}`}
                  onClick={() => selectCustomer(customer)}
                >
                  <div className="entity-row-media">
                    <div className="entity-avatar customer" aria-hidden="true">
                      {getCustomerInitials(customer)}
                    </div>
                  </div>
                  <div className="entity-row-main">
                    <div className="item-info">
                      <strong className="entity-row-title">
                        {customer.first_name} {customer.last_name}
                      </strong>
                      <p className="entity-row-meta">{customer.customer_code || customer.email}</p>
                    </div>
                    <div className="entity-row-side">
                      <div className="entity-row-value">{formatCurrency(customer.total_purchases || 0)}</div>
                      <div>{getLoyaltyBadge(customer.loyalty_tier)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {selectedCustomer && (
          <section className="panel animate-slide-up">
            <div className="panel-head">
              <h2>Customer Details</h2>
              <div>
                <button className="secondary" onClick={() => startEditCustomer(selectedCustomer)}>
                  Edit
                </button>
                <button
                  className="danger"
                  onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Delete
                </button>
                <button className="secondary" onClick={() => setSelectedCustomer(null)} style={{ marginLeft: "0.5rem" }}>
                  Close
                </button>
              </div>
            </div>
            <div className="customer-details">
              <div className="detail-header">
                <h3>
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </h3>
                <p className="customer-code">{selectedCustomer.customer_code}</p>
              </div>

              <div className="detail-grid">
                <div>
                  <span>Email</span>
                  <strong>{selectedCustomer.email || "N/A"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{selectedCustomer.phone || "N/A"}</strong>
                </div>
                <div>
                  <span>Loyalty Points</span>
                  <strong>{selectedCustomer.loyalty_points}</strong>
                </div>
                <div>
                  <span>Tier</span>
                  <strong>{getLoyaltyBadge(selectedCustomer.loyalty_tier)}</strong>
                </div>
                <div>
                  <span>Total Purchases</span>
                  <strong>{formatCurrency(selectedCustomer.total_purchases || 0)}</strong>
                </div>
                <div>
                  <span>Total Orders</span>
                  <strong>{selectedCustomer.total_orders || 0}</strong>
                </div>
              </div>

              {selectedCustomer.address && (
                <div className="detail-section">
                  <h4>Address</h4>
                  <p>
                    {selectedCustomer.address}
                    <br />
                    {selectedCustomer.city}, {selectedCustomer.state} {selectedCustomer.postal_code}
                  </p>
                </div>
              )}

              <div className="detail-section">
                <h4>Purchase History</h4>
                {purchaseHistory.length > 0 ? (
                  <div className="purchase-list">
                    {purchaseHistory.map((purchase) => (
                      <div key={purchase.sale_id} className="purchase-item">
                        <div>
                          <strong>#{purchase.sale_code}</strong>
                          <p>{new Date(purchase.sale_date).toLocaleDateString()}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 600, color: "var(--success)" }}>
                            {formatCurrency(purchase.total_amount)}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {purchase.items_count} items
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No purchase history</p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      <style>{`
        .customers-grid {
          grid-template-columns: 1fr 1fr;
        }

        .customer-list {
          max-height: calc(100vh - 300px);
          overflow-y: auto;
        }

        .empty-state {
          padding: 3rem 2rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--glass-border);
          border-top-color: var(--accent-blue);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .customer-details {
          padding: 1rem 0;
        }

        .detail-header {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--glass-border);
        }

        .detail-header h3 {
          margin-bottom: 0.25rem;
        }

        .customer-code {
          font-size: 0.875rem;
          color: var(--text-muted);
          font-family: 'Space Mono', monospace;
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

        .detail-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--glass-border);
        }

        .detail-section h4 {
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .purchase-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .purchase-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
        }

        .purchase-item p {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0;
        }

        .dropdown {
          position: relative;
        }

        .dropdown:hover .dropdown-menu {
          display: flex;
        }

        .dropdown-menu {
          display: none;
        }

        @media (max-width: 1024px) {
          .customers-grid {
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
