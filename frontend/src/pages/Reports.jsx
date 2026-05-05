import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

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

async function downloadExport(path, filename, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Export failed");

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export default function Reports({ token, onError, formatCurrency }) {
  const [activeReport, setActiveReport] = useState("sales");
  const [salesReport, setSalesReport] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [agingReport, setAgingReport] = useState(null);
  const [marginReport, setMarginReport] = useState(null);
  const [supplierReport, setSupplierReport] = useState(null);
  const [exportTables, setExportTables] = useState([]);
  const [selectedExportTable, setSelectedExportTable] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportBtnRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });


  const [salesFilters, setSalesFilters] = useState({
    date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    date_to: new Date().toISOString().split("T")[0],
    warehouse_id: "",
  });

  const [inventoryFilters, setInventoryFilters] = useState({
    category: "",
    warehouse_id: "",
    low_stock_only: false,
  });

  useEffect(() => {
    loadWarehouses();
    loadExportTables();
  }, []);

  async function loadWarehouses() {
    try {
      const data = await request("/warehouses", {}, token);
      setWarehouses(data);
    } catch (err) {
      onError(err.message);
    }
  }

  async function loadExportTables() {
    try {
      const data = await request("/reports/table-exports", {}, token);
      setExportTables(data);
      if (data.length > 0) {
        setSelectedExportTable(data[0].name);
      }
    } catch (err) {
      onError(err.message);
    }
  }

  useEffect(() => {
  function handleClickOutside(e) {
    if (exportBtnRef.current && !exportBtnRef.current.contains(e.target)) {
      setExportDropdownOpen(false);
    }
  }
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

  async function generateSalesReport() {
    try {
      setLoading(true);
      const filters = {
        date_from: new Date(salesFilters.date_from).toISOString(),
        date_to: new Date(salesFilters.date_to).toISOString(),
        warehouse_id: salesFilters.warehouse_id ? parseInt(salesFilters.warehouse_id) : null,
      };
      const data = await request("/reports/sales", {
        method: "POST",
        body: JSON.stringify(filters),
      }, token);
      setSalesReport(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateInventoryReport() {
    try {
      setLoading(true);
      const filters = {
        category: inventoryFilters.category || null,
        warehouse_id: inventoryFilters.warehouse_id ? parseInt(inventoryFilters.warehouse_id) : null,
        low_stock_only: inventoryFilters.low_stock_only,
      };
      const data = await request("/reports/inventory", {
        method: "POST",
        body: JSON.stringify(filters),
      }, token);
      setInventoryReport(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAgingReport() {
    try {
      setLoading(true);
      const data = await request("/reports/inventory-aging", {}, token);
      setAgingReport(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMarginReport() {
    try {
      setLoading(true);
      const data = await request("/reports/profit-margins", {}, token);
      setMarginReport(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSupplierReport() {
    try {
      setLoading(true);
      const data = await request("/reports/supplier-performance", {}, token);
      setSupplierReport(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    let data, filename;
    if (activeReport === "inventory" && inventoryReport) {
      data = inventoryReport.items;
      filename = "inventory_report.csv";
    } else if (activeReport === "low-stock") {
      return;
    } else {
      return;
    }

    const headers = Object.keys(data[0] || {}).join(",");
    const rows = data.map((row) => Object.values(row).join(",")).join("\n");
    const csv = headers + "\n" + rows;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async function exportTable(format) {
    try {
      if (!selectedExportTable) return;
      const ext = format === "excel" ? "xlsx" : format;
      await downloadExport(
        `/reports/table-exports/${selectedExportTable}/${format}`,
        `${selectedExportTable}_report.${ext}`,
        token
      );
    } catch (err) {
      onError(err.message);
    }
  }

  const agingStatusColors = {
    fresh: "#10b981",
    aging: "#f59e0b",
    stale: "#ef4444",
    dead: "#6b7280",
  };

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>Reports</h1>
        </div>
          <div className="header-actions" style={{ position: "relative", overflow: "visible" }}>
        <select
          value={selectedExportTable}
          onChange={(e) => setSelectedExportTable(e.target.value)}
          aria-label="Report table"
          disabled={exportTables.length === 0}
        >
          {exportTables.map((table) => (
            <option key={table.name} value={table.name}>{table.label}</option>
          ))}
        </select>
        <div 
        className="dropdown-container" 
        style={{ position: "relative" }}
        >
        <button
          ref={exportBtnRef}
          className="secondary"
          onClick={() => {
            const rect = exportBtnRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
            setExportDropdownOpen(!exportDropdownOpen);
          }}
        >
          Export
        </button>
{exportDropdownOpen && createPortal(
  <div
    onMouseDown={(e) => e.stopPropagation()}
    style={{
      position: "fixed",
      top: dropdownPos.top,
      right: dropdownPos.right,
      background: "white",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      padding: "8px",
      zIndex: 99999,
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      minWidth: "160px",
      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)"
    }}
      >
        <button onClick={() => { exportTable("csv"); setExportDropdownOpen(false); }} className="secondary" style={{ justifyContent: "flex-start", whiteSpace: "nowrap", width: "100%", padding: "8px 12px" }}>
          📄 Export CSV
        </button>
        <button onClick={() => { exportTable("excel"); setExportDropdownOpen(false); }} className="secondary" style={{ justifyContent: "flex-start", whiteSpace: "nowrap", width: "100%", padding: "8px 12px" }}>
          📊 Export Excel
        </button>
        <button onClick={() => { exportTable("pdf"); setExportDropdownOpen(false); }} className="secondary" style={{ justifyContent: "flex-start", whiteSpace: "nowrap", width: "100%", padding: "8px 12px" }}>
          📑 Export PDF
        </button>
      </div>,
      document.body
    )}
        </div>
      </div>
      </header>

      <div className="report-tabs">
        <button className={activeReport === "sales" ? "active" : ""} onClick={() => setActiveReport("sales")}>
          Sales
        </button>
        <button className={activeReport === "inventory" ? "active" : ""} onClick={() => setActiveReport("inventory")}>
          Inventory
        </button>
        <button className={activeReport === "aging" ? "active" : ""} onClick={() => { setActiveReport("aging"); if (!agingReport) loadAgingReport(); }}>
          Inventory Aging
        </button>
        <button className={activeReport === "margins" ? "active" : ""} onClick={() => { setActiveReport("margins"); if (!marginReport) loadMarginReport(); }}>
          Profit Margins
        </button>
        <button className={activeReport === "suppliers" ? "active" : ""} onClick={() => { setActiveReport("suppliers"); if (!supplierReport) loadSupplierReport(); }}>
          Suppliers
        </button>
      </div>

      {activeReport === "sales" && (
        <section className="panel animate-slide-up">
          <h2>Sales Report</h2>
          <div className="report-filters">
            <div className="input-group">
              <label>From Date</label>
              <input
                type="date"
                value={salesFilters.date_from}
                onChange={(e) => setSalesFilters({ ...salesFilters, date_from: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>To Date</label>
              <input
                type="date"
                value={salesFilters.date_to}
                onChange={(e) => setSalesFilters({ ...salesFilters, date_to: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Warehouse</label>
              <select
                value={salesFilters.warehouse_id}
                onChange={(e) => setSalesFilters({ ...salesFilters, warehouse_id: e.target.value })}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <button onClick={generateSalesReport} disabled={loading}>
              {loading ? "Generating..." : "Generate Report"}
            </button>
          </div>

          {salesReport && (
            <div className="report-results">
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="summary-label">Total Sales</span>
                  <span className="summary-value">{salesReport.summary.total_sales}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Total Revenue</span>
                  <span className="summary-value">{formatCurrency(salesReport.summary.total_revenue)}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Avg Order Value</span>
                  <span className="summary-value">{formatCurrency(salesReport.summary.average_order_value)}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Total Discounts</span>
                  <span className="summary-value">{formatCurrency(salesReport.summary.total_discounts)}</span>
                </div>
              </div>

              {salesReport.sales.length > 0 ? (
                <div className="report-table">
                  <div className="table-header">
                    <span>Sale Code</span>
                    <span>Date</span>
                    <span>Customer</span>
                    <span>Payment</span>
                    <span>Total</span>
                  </div>
                  {salesReport.sales.map((sale) => (
                    <div key={sale.sale_code} className="table-row">
                      <span><strong>{sale.sale_code}</strong></span>
                      <span>{new Date(sale.date).toLocaleDateString()}</span>
                      <span>{sale.customer}</span>
                      <span style={{ textTransform: "capitalize" }}>{sale.payment_method}</span>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(sale.total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>No sales data for this period</p>
              )}
            </div>
          )}
        </section>
      )}

      {activeReport === "inventory" && (
        <section className="panel animate-slide-up">
          <h2>Inventory Report</h2>
          <div className="report-filters">
            <div className="input-group">
              <label>Category</label>
              <input
                value={inventoryFilters.category}
                onChange={(e) => setInventoryFilters({ ...inventoryFilters, category: e.target.value })}
                placeholder="e.g., electronics"
              />
            </div>
            <div className="input-group">
              <label>Warehouse</label>
              <select
                value={inventoryFilters.warehouse_id}
                onChange={(e) => setInventoryFilters({ ...inventoryFilters, warehouse_id: e.target.value })}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={inventoryFilters.low_stock_only}
                  onChange={(e) => setInventoryFilters({ ...inventoryFilters, low_stock_only: e.target.checked })}
                />
                Low Stock Only
              </label>
            </div>
            <button onClick={generateInventoryReport} disabled={loading}>
              {loading ? "Generating..." : "Generate Report"}
            </button>
          </div>

          {inventoryReport && (
            <div className="report-results">
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="summary-label">Total Items</span>
                  <span className="summary-value">{inventoryReport.total_items}</span>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Total Value</span>
                  <span className="summary-value">{formatCurrency(inventoryReport.total_value)}</span>
                </div>
              </div>

              {inventoryReport.items.length > 0 ? (
                <div className="report-table">
                  <div className="table-header">
                    <span>SKU</span>
                    <span>Name</span>
                    <span>Category</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span>Total Value</span>
                  </div>
                  {inventoryReport.items.map((item) => (
                    <div key={item.sku} className="table-row">
                      <span><strong>{item.sku}</strong></span>
                      <span>{item.name}</span>
                      <span>{item.category}</span>
                      <span>{item.quantity}</span>
                      <span>{formatCurrency(item.unit_price)}</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(item.total_value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>No inventory data</p>
              )}
            </div>
          )}
        </section>
      )}

      {activeReport === "aging" && agingReport && (
        <section className="panel animate-slide-up">
          <h2>Inventory Aging Report</h2>
          <div className="summary-cards">
            <div className="summary-card" style={{ borderLeft: `4px solid ${agingStatusColors.fresh}` }}>
              <span className="summary-label">Fresh (≤30 days)</span>
              <span className="summary-value">{agingReport.fresh}</span>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${agingStatusColors.aging}` }}>
              <span className="summary-label">Aging (31-60 days)</span>
              <span className="summary-value">{agingReport.aging}</span>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${agingStatusColors.stale}` }}>
              <span className="summary-label">Stale (61-90 days)</span>
              <span className="summary-value">{agingReport.stale}</span>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${agingStatusColors.dead}` }}>
              <span className="summary-label">Dead (90+ days)</span>
              <span className="summary-value">{agingReport.dead}</span>
            </div>
          </div>

          <div className="report-table">
            <div className="table-header">
              <span>SKU</span>
              <span>Name</span>
              <span>Category</span>
              <span>Qty</span>
              <span>Days in Stock</span>
              <span>Status</span>
            </div>
            {agingReport.items.map((item) => (
              <div key={item.sku} className="table-row">
                <span><strong>{item.sku}</strong></span>
                <span>{item.name}</span>
                <span>{item.category}</span>
                <span>{item.quantity}</span>
                <span>{item.days_in_stock}</span>
                <span>
                  <span
                    className="status-pill"
                    style={{ background: agingStatusColors[item.aging_status], color: "white" }}
                  >
                    {item.aging_status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeReport === "margins" && marginReport && (
        <section className="panel animate-slide-up">
          <h2>Profit Margin Analysis</h2>
          <div className="summary-cards">
            <div className="summary-card">
              <span className="summary-label">Items Sold</span>
              <span className="summary-value">{marginReport.total_items_sold}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Total Profit</span>
              <span className="summary-value" style={{ color: "var(--success)" }}>{formatCurrency(marginReport.total_profit)}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Avg Margin %</span>
              <span className="summary-value">{marginReport.average_margin_percent.toFixed(1)}%</span>
            </div>
          </div>

          <div className="report-table">
            <div className="table-header">
              <span>SKU</span>
              <span>Name</span>
              <span>Cost</span>
              <span>Sale Price</span>
              <span>Margin %</span>
              <span>Sold</span>
              <span>Total Profit</span>
            </div>
            {marginReport.items.map((item) => (
              <div key={item.sku} className="table-row">
                <span><strong>{item.sku}</strong></span>
                <span>{item.name}</span>
                <span>{formatCurrency(item.cost_price)}</span>
                <span>{formatCurrency(item.sale_price)}</span>
                <span style={{ color: item.margin_percent > 20 ? "var(--success)" : item.margin_percent < 10 ? "var(--danger)" : "var(--warning)" }}>
                  {item.margin_percent.toFixed(1)}%
                </span>
                <span>{item.total_sold}</span>
                <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(item.total_profit)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeReport === "suppliers" && supplierReport && (
        <section className="panel animate-slide-up">
          <h2>Supplier Performance</h2>
          <div className="report-table">
            <div className="table-header">
              <span>Supplier</span>
              <span>Total Orders</span>
              <span>Total Value</span>
              <span>Avg Lead Time</span>
              <span>On-Time Rate</span>
              <span>Rating</span>
            </div>
            {supplierReport.suppliers.map((supplier) => (
              <div key={supplier.supplier_id} className="table-row">
                <span><strong>{supplier.supplier_name}</strong></span>
                <span>{supplier.total_orders}</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(supplier.total_value)}</span>
                <span>{supplier.avg_lead_time ? `${supplier.avg_lead_time.toFixed(1)} days` : "N/A"}</span>
                <span style={{ color: supplier.on_time_delivery_rate > 90 ? "var(--success)" : "var(--warning)" }}>
                  {supplier.on_time_delivery_rate.toFixed(0)}%
                </span>
                <span>{"★".repeat(Math.round(supplier.rating))}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <style>{`
        .report-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .report-tabs button { padding: 0.75rem 1.5rem; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: var(--radius-md); color: var(--text-primary); cursor: pointer; transition: all 0.2s; }
        .report-tabs button:hover { background: var(--bg-elevated); }
        .report-tabs button.active { background: var(--accent-blue); color: white; border-color: var(--accent-blue); }
        .report-filters { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); }
        .report-filters .input-group { margin-bottom: 0; }
        .checkbox-group { display: flex; align-items: center; }
        .checkbox-group label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
        .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .summary-card { padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.5rem; }
        .summary-label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }
        .summary-value { font-size: 1.5rem; font-weight: 700; }
        .report-table { display: flex; flex-direction: column; gap: 0.5rem; }
        .table-header, .table-row { display: grid; gap: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); align-items: center; }
        .table-header { grid-template-columns: 1.5fr 2fr 1fr 0.8fr 1fr 1fr; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); background: transparent; padding: 0.5rem 0.75rem; }
        .table-row { grid-template-columns: 1.5fr 2fr 1fr 0.8fr 1fr 1fr; }
        .table-row p { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .status-pill { padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
        .dropdown-container { position: relative; }
        .export-dropdown button { margin: 2px 0; }
      `}</style>
    </div>
  );
}
