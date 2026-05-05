import React, { useEffect, useState } from "react";

// Component that builds a chart from the current inventory data
export default function ChartBuilder() {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
  const [items, setItems] = useState([]);
  const [type, setType] = useState('bar');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imgUrl, setImgUrl] = useState(null);

  // Load inventory items once on mount
  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("inventory_token");
        const resp = await fetch(`${API_BASE}/inventory`, { headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || "Failed to load inventory");
        setItems(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const buildChart = async () => {
    if (items.length === 0) {
      setError("No inventory data to chart");
      return;
    }
    // Use SKU as labels and quantity as values for a bar chart
    const labels = items.map((it) => it.sku);
    const values = items.map((it) => it.quantity);
    const title = "Inventory Quantities by SKU";
    try {
      const resp = await fetch(`${API_BASE}/chart/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart_type: type, labels, values, title }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Chart generation failed");
      setImgUrl(`${API_BASE}/${data.chart_path}`);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="panel chart-panel animate-slide-up">
      <div className="panel-header">
        <h2>Inventory Chart</h2>
      </div>
      <div className="chart-type-selector">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
      </div>
      <button onClick={buildChart} disabled={loading} className="generate-btn">
        {loading ? "Loading…" : "Generate Chart"}
      </button>
      {error && <div className="status-message error">{error}</div>}
      {imgUrl && (
        <div className="chart-preview">
          <img src={imgUrl} alt="Inventory chart" />
        </div>
      )}
    </div>
  );
}
