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

const typeIcons = {
  LOW_STOCK: "⚠️",
  EXPIRY_WARNING: "📅",
  ORDER_RECEIVED: "📦",
  SALE_COMPLETED: "🛒",
  SYSTEM: "ℹ️",
};

const typeColors = {
  LOW_STOCK: "#f59e0b",
  EXPIRY_WARNING: "#ef4444",
  ORDER_RECEIVED: "#10b981",
  SALE_COMPLETED: "#3b82f6",
  SYSTEM: "#6b7280",
};

export default function Notifications({ token, onError, onRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, [filterType, showUnreadOnly]);

  async function loadNotifications() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showUnreadOnly) params.append("unread_only", "true");
      if (filterType) params.append("type_filter", filterType);

      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await request(`/notifications${query}`, {}, token);
      setNotifications(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notificationId) {
    try {
      await request(`/notifications/${notificationId}/mark-read`, { method: "POST" }, token);
      loadNotifications();
      if (onRead) onRead();
    } catch (err) {
      onError(err.message);
    }
  }

  async function markAllAsRead() {
    try {
      await request("/notifications/mark-all-read", { method: "POST" }, token);
      loadNotifications();
      if (onRead) onRead();
    } catch (err) {
      onError(err.message);
    }
  }

  async function deleteNotification(notificationId) {
    try {
      await request(`/notifications/${notificationId}`, { method: "DELETE" }, token);
      loadNotifications();
      if (onRead) onRead();
    } catch (err) {
      onError(err.message);
    }
  }

  async function triggerLowStockCheck() {
    try {
      const result = await request("/notifications/check-low-stock", { method: "POST" }, token);
      onError(`Created ${result.created} notifications`);
      loadNotifications();
    } catch (err) {
      onError(err.message);
    }
  }

  async function triggerExpiryCheck() {
    try {
      const result = await request("/notifications/check-expiry", { method: "POST" }, token);
      onError(`Created ${result.created} notifications`);
      loadNotifications();
    } catch (err) {
      onError(err.message);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
          <p className="eyebrow">System</p>
          <h1>Notifications</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowUnreadOnly(!showUnreadOnly)} className={showUnreadOnly ? "active" : ""}>
            {showUnreadOnly ? "Show All" : "Unread Only"}
          </button>
        </div>
      </header>

      <section className="panel animate-slide-up">
        <div className="panel-head">
          <h2>Recent Notifications ({unreadCount} unread)</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="secondary" onClick={markAllAsRead} disabled={unreadCount === 0}>
              Mark All Read
            </button>
            <button className="secondary" onClick={triggerLowStockCheck}>
              Check Low Stock
            </button>
            <button className="secondary" onClick={triggerExpiryCheck}>
              Check Expiry
            </button>
          </div>
        </div>

        <div className="filter-bar">
          <label>Filter by type:</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="EXPIRY_WARNING">Expiry Warning</option>
            <option value="ORDER_RECEIVED">Order Received</option>
            <option value="SALE_COMPLETED">Sale Completed</option>
            <option value="SYSTEM">System</option>
          </select>
        </div>

        {notifications.length > 0 ? (
          <div className="notification-list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item ${notification.is_read ? "read" : "unread"}`}
              >
                <div className="notification-icon" style={{ background: typeColors[notification.type] || "#6b7280" }}>
                  {typeIcons[notification.type] || "ℹ️"}
                </div>
                <div className="notification-content">
                  <div className="notification-header">
                    <strong>{notification.title}</strong>
                    <span className="notification-time">
                      {new Date(notification.created_at).toLocaleDateString()} {new Date(notification.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p>{notification.message}</p>
                  {notification.item_name && (
                    <span className="notification-item-link">Item: {notification.item_name}</span>
                  )}
                </div>
                <div className="notification-actions">
                  {!notification.is_read && (
                    <button
                      className="icon-btn"
                      onClick={() => markAsRead(notification.id)}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    className="icon-btn danger"
                    onClick={() => deleteNotification(notification.id)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🔔</div>
            <h3>No Notifications</h3>
            <p>You're all caught up!</p>
          </div>
        )}
      </section>

      <style>{`
        .notification-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .notification-item { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 4px solid transparent; }
        .notification-item.unread { border-left-color: var(--accent-blue); background: var(--bg-elevated); }
        .notification-item.read { opacity: 0.7; }
        .notification-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; }
        .notification-content { flex: 1; }
        .notification-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
        .notification-header strong { font-size: 0.9375rem; }
        .notification-time { font-size: 0.75rem; color: var(--text-muted); }
        .notification-content p { margin: 0; font-size: 0.875rem; color: var(--text-secondary); }
        .notification-item-link { font-size: 0.75rem; color: var(--accent-blue); margin-top: 0.25rem; display: inline-block; }
        .notification-actions { display: flex; gap: 0.25rem; }
        .filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); }
        .filter-bar label { font-size: 0.875rem; color: var(--text-muted); }
        .filter-bar select { padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: var(--bg-primary); color: var(--text-primary); }
        .active { background: var(--accent-blue) !important; color: white !important; }
        .icon-btn.danger:hover { background: var(--danger); color: white; }
      `}</style>
    </div>
  );
}