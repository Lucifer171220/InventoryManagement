import { useEffect, useState } from "react";

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

const icons = {
  warehouse: "🏭",
  box: "📦",
  "shopping-cart": "🛒",
  currency: "💰",
  "alert-triangle": "⚠️",
  "clipboard-list": "📋",
};

export default function Dashboard({ token, onError, formatCurrency }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      const data = await request("/dashboard", {}, token);
      setDashboard(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-skeleton" style={{ height: "200px", borderRadius: "16px" }} />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>Dashboard Unavailable</h3>
          <p>Unable to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Dashboard</h1>
        </div>
        <button onClick={loadDashboard}>Refresh</button>
      </header>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {dashboard.kpi_cards.map((card, index) => (
          <div key={index} className="kpi-card animate-slide-up">
            <div className="kpi-icon">{icons[card.icon] || "📊"}</div>
            <div className="kpi-content">
              <div className="kpi-title">{card.title}</div>
              <div className="kpi-value">{card.value}</div>
              {card.change && (
                <div className={`kpi-change ${card.change_type}`}>
                  {card.change_type === "positive" ? "↑" : card.change_type === "negative" ? "↓" : "→"} {card.change}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid dashboard-grid">
        {/* Low Stock Alerts */}
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Low Stock Alerts</h2>
            {dashboard.low_stock_alerts.length > 0 && (
              <span className="alert-badge">{dashboard.low_stock_alerts.length} items</span>
            )}
          </div>
          {dashboard.low_stock_alerts.length > 0 ? (
            <div className="inventory-list">
              {dashboard.low_stock_alerts.map((alert) => (
                <div key={alert.item_id} className="entity-row">
                  <div className="item-info">
                    <strong>{alert.name}</strong>
                    <p>{alert.sku} • {alert.warehouse_name}</p>
                  </div>
                  <div className="stock-badge danger">
                    <span className="stock-count">{alert.current_quantity}</span>
                    <span className="stock-label">/ {alert.reorder_level}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h3>All Stock Healthy</h3>
              <p>No items below reorder level</p>
            </div>
          )}
        </section>

        {/* Top Selling Items */}
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Top Selling Items</h2>
            <span className="muted">Last 30 days</span>
          </div>
          {dashboard.top_selling_items.length > 0 ? (
            <div className="inventory-list">
              {dashboard.top_selling_items.map((item, index) => (
                <div key={item.item_id} className="entity-row">
                  <div className="item-info">
                    <strong>#{index + 1} {item.name}</strong>
                    <p>{item.sku}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600, color: "var(--success)" }}>
                      {formatCurrency(item.total_revenue)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {item.total_sold} sold
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📈</div>
              <h3>No Sales Yet</h3>
              <p>Start making sales to see top items</p>
            </div>
          )}
        </section>

        {/* Category Distribution */}
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Category Distribution</h2>
          </div>
          {dashboard.category_distribution.length > 0 ? (
            <div className="category-list">
              {dashboard.category_distribution.map((cat) => (
                <div key={cat.category} className="category-item">
                  <div className="category-info">
                    <span className="category-name">{cat.category}</span>
                    <span className="category-count">{cat.count} items</span>
                  </div>
                  <div className="category-bar">
                    <div
                      className="category-fill"
                      style={{
                        width: `${(cat.value / dashboard.total_inventory_value) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="category-value">{formatCurrency(cat.value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No category data available</p>
            </div>
          )}
        </section>

        {/* Sales Trend */}
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <h2>Sales Trend</h2>
            <span className="muted">Last 7 days</span>
          </div>
          {dashboard.sales_trend.length > 0 ? (
            <div className="sales-chart">
              {dashboard.sales_trend.map((day, index) => {
                const maxRevenue = Math.max(...dashboard.sales_trend.map((d) => d.revenue));
                const height = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={index} className="chart-bar-container">
                    <div className="chart-bar-wrapper">
                      <div
                        className="chart-bar"
                        style={{ height: `${Math.max(height, 5)}%` }}
                        title={`${day.date}: ${formatCurrency(day.revenue)}`}
                      />
                    </div>
                    <span className="chart-label">{new Date(day.date).toLocaleDateString("en-US", { weekday: "short" })}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <p>No sales data available</p>
            </div>
          )}
        </section>
      </div>

      {/* Quick Actions */}
      <section className="panel animate-slide-up">
        <h2>Quick Actions</h2>
        <div className="quick-actions">
          <button className="quick-action-btn" onClick={() => window.location.hash = "pos"}>
            <span className="quick-action-icon">🛒</span>
            <span>New Sale</span>
          </button>
          <button className="quick-action-btn" onClick={() => window.location.hash = "inventory"}>
            <span className="quick-action-icon">➕</span>
            <span>Add Product</span>
          </button>
          <button className="quick-action-btn" onClick={() => window.location.hash = "purchaseOrders"}>
            <span className="quick-action-icon">📦</span>
            <span>Create PO</span>
          </button>
          <button className="quick-action-btn" onClick={() => window.location.hash = "customers"}>
            <span className="quick-action-icon">👤</span>
            <span>Add Customer</span>
          </button>
        </div>
      </section>

      <style>{`
        .category-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .category-item {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 0.75rem;
        }
        
        .category-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .category-name {
          font-weight: 500;
        }
        
        .category-count {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        .category-bar {
          grid-column: 1 / -1;
          height: 8px;
          background: var(--bg-secondary);
          border-radius: var(--radius-full);
          overflow: hidden;
        }
        
        .category-fill {
          height: 100%;
          background: var(--gradient-primary);
          border-radius: var(--radius-full);
          transition: width 0.5s var(--ease-out);
        }
        
        .category-value {
          font-weight: 600;
          font-size: 0.875rem;
        }
        
        .sales-chart {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          height: 150px;
          padding-top: 1rem;
        }
        
        .chart-bar-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        
        .chart-bar-wrapper {
          height: 100px;
          width: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        
        .chart-bar {
          width: 24px;
          background: var(--gradient-primary);
          border-radius: var(--radius-sm) var(--radius-sm) 0 0;
          min-height: 4px;
          transition: all 0.3s;
        }
        
        .chart-bar:hover {
          background: var(--accent-cyan);
          transform: scaleY(1.05);
        }
        
        .chart-label {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        .quick-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          margin-top: 1rem;
        }
        
        .quick-action-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 1.25rem;
          background: var(--bg-secondary);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .quick-action-btn:hover {
          background: var(--accent-blue);
          color: white;
          border-color: var(--accent-blue);
          transform: translateY(-2px);
        }
        
        .quick-action-icon {
          font-size: 1.25rem;
        }
      `}</style>
    </div>
  );
}
