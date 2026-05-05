import { useState, useRef, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const importTypes = [
  { key: "items", label: "Products", icon: "📦", desc: "Import inventory items with SKUs, quantities, prices" },
  { key: "suppliers", label: "Suppliers", icon: "🏭", desc: "Import supplier information" },
  { key: "customers", label: "Customers", icon: "👥", desc: "Import customer data" },
];

export default function BulkImport({ token, onError }) {
  const [activeType, setActiveType] = useState("items");
  const [file, setFile] = useState(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const fileInputRef = useRef(null);

  // Load warehouses when items type is selected
  useEffect(() => {
    loadWarehouses();
  }, []);

  async function loadWarehouses() {
    try {
      const response = await fetch(`${API_BASE_URL}/warehouses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouses(data);
        if (data.length > 0) {
          setWarehouseId(data[0].id);
        }
      }
    } catch (err) {
      // Silently fail - warehouses not required
    }
  }

  function handleFileChange(e) {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith('.csv')) {
      setFile(selectedFile);
      setResult(null);
    } else {
      onError("Please select a valid CSV file");
      setFile(null);
    }
  }

  function clearFile() {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function downloadTemplate(type) {
    try {
      const response = await fetch(`${API_BASE_URL}/bulk/export/template/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to download template");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}_import_template.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleUpload() {
    if (!file) {
      onError("Please select a CSV file to import");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      
      if (activeType === "items" && warehouseId) {
        formData.append("warehouse_id", warehouseId);
      }

      const response = await fetch(`${API_BASE_URL}/bulk/import/${activeType}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "Import failed");
      }

      setResult(data);
      clearFile();
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (type) => {
    switch (type) {
      case "success":
        return "#10b981";
      case "warning":
        return "#f59e0b";
      case "error":
        return "#ef4444";
      default:
        return "var(--text-muted)";
    }
  };

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Data Management</p>
          <h1>Bulk Import</h1>
        </div>
      </header>

      <div className="grid bulk-import-grid">
        {/* Import Type Selection */}
        <section className="panel animate-slide-up">
          <h2>Select Import Type</h2>
          <div className="import-type-list">
            {importTypes.map((type) => (
              <button
                key={type.key}
                className={`import-type-card ${activeType === type.key ? "active" : ""}`}
                onClick={() => {
                  setActiveType(type.key);
                  clearFile();
                  setResult(null);
                }}
              >
                <span className="import-icon">{type.icon}</span>
                <div className="import-info">
                  <strong>{type.label}</strong>
                  <p className="muted">{type.desc}</p>
                </div>
                {activeType === type.key && <span className="check-mark">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* Upload Panel */}
        <section className="panel animate-slide-up">
          <h2>Upload {importTypes.find(t => t.key === activeType)?.label}</h2>
          
          {/* Template Download */}
          <div className="template-section">
            <p className="muted">Download a CSV template to ensure your data is formatted correctly:</p>
            <button 
              className="secondary template-btn"
              onClick={() => downloadTemplate(activeType)}
            >
              📥 Download {importTypes.find(t => t.key === activeType)?.label} Template
            </button>
          </div>

          {/* Warehouse Selection (for items only) */}
          {activeType === "items" && warehouses.length > 0 && (
            <div className="input-group">
              <label>Default Warehouse</label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">Select a warehouse (optional)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* File Upload */}
          <div className="upload-area">
            {!file ? (
              <div className="upload-placeholder">
                <div className="upload-icon">📄</div>
                <p>Drop your CSV file here or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="file-input"
                />
                <button 
                  className="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose File
                </button>
              </div>
            ) : (
              <div className="file-selected">
                <div className="file-info">
                  <span className="file-icon">📄</span>
                  <div>
                    <strong>{file.name}</strong>
                    <p className="muted">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button className="icon-btn" onClick={clearFile} title="Remove file">
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <button
            className="upload-btn full-width"
            onClick={handleUpload}
            disabled={!file || loading}
          >
            {loading ? (
              <>
                <span className="spinner-small"></span>
                Importing...
              </>
            ) : (
              <>📤 Import {importTypes.find(t => t.key === activeType)?.label}</>
            )}
          </button>
        </section>

        {/* Results Panel */}
        {result && (
          <section className="panel animate-slide-up result-panel">
            <h2>Import Results</h2>
            
            <div className="result-summary">
              <div className="result-card success">
                <span className="result-label">Successful</span>
                <span className="result-value">{result.successful}</span>
              </div>
              <div className="result-card warning">
                <span className="result-label">Failed</span>
                <span className="result-value">{result.failed}</span>
              </div>
              <div className="result-card info">
                <span className="result-label">Total Rows</span>
                <span className="result-value">{result.total_rows}</span>
              </div>
            </div>

            {result.warnings && result.warnings.length > 0 && (
              <div className="result-section">
                <h4>⚠️ Warnings ({result.warnings.length})</h4>
                <div className="result-list">
                  {result.warnings.map((warning, idx) => (
                    <div key={idx} className="result-item warning">
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="result-section">
                <h4>❌ Errors ({result.errors.length})</h4>
                <div className="result-list">
                  {result.errors.map((error, idx) => (
                    <div key={idx} className="result-item error">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.successful > 0 && result.errors?.length === 0 && (
              <div className="success-message">
                ✅ Import completed successfully!
              </div>
            )}
          </section>
        )}

        {/* Help Panel */}
        <section className="panel animate-slide-up help-panel">
          <h2>📋 Import Guidelines</h2>
          <div className="guidelines">
            <h4>CSV Format Requirements:</h4>
            <ul>
              <li>First row must contain column headers</li>
              <li>Use UTF-8 encoding</li>
              <li>Maximum file size: 10MB</li>
              <li>Use comma (,) as delimiter</li>
            </ul>
            
            <h4>Required Fields by Type:</h4>
            <div className="field-list">
              {activeType === "items" && (
                <ul>
                  <li><strong>sku</strong> - Unique product code</li>
                  <li><strong>name</strong> - Product name</li>
                  <li>quantity - Initial stock quantity</li>
                  <li>unit_price - Selling price</li>
                  <li>cost_price - Purchase cost</li>
                </ul>
              )}
              {activeType === "suppliers" && (
                <ul>
                  <li><strong>name</strong> - Supplier name</li>
                  <li>code - Supplier code (optional)</li>
                  <li>email - Contact email</li>
                  <li>phone - Contact phone</li>
                </ul>
              )}
              {activeType === "customers" && (
                <ul>
                  <li><strong>first_name</strong> - Customer first name</li>
                  <li><strong>last_name</strong> - Customer last name</li>
                  <li>email - Email address</li>
                  <li>phone - Phone number</li>
                  <li>loyalty_tier - bronze/silver/gold/platinum</li>
                </ul>
              )}
            </div>

            <div className="tip-box">
              <strong>💡 Tip:</strong> Download the template to see the exact format required for each field.
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .bulk-import-grid {
          grid-template-columns: 1fr 2fr;
        }

        .result-panel {
          grid-column: 1 / -1;
        }

        .help-panel {
          grid-column: 1 / -1;
        }

        .import-type-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .import-type-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .import-type-card:hover {
          background: var(--bg-elevated);
          border-color: var(--accent-blue);
        }

        .import-type-card.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: white;
        }

        .import-type-card.active .muted {
          color: rgba(255, 255, 255, 0.7);
        }

        .import-icon {
          font-size: 1.5rem;
        }

        .import-info {
          flex: 1;
        }

        .import-info strong {
          display: block;
          margin-bottom: 0.25rem;
        }

        .import-info p {
          margin: 0;
          font-size: 0.75rem;
        }

        .check-mark {
          font-size: 1.25rem;
          font-weight: bold;
        }

        .template-section {
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
        }

        .template-btn {
          margin-top: 0.75rem;
        }

        .upload-area {
          border: 2px dashed var(--glass-border);
          border-radius: var(--radius-md);
          padding: 2rem;
          margin-bottom: 1.5rem;
          background: var(--bg-secondary);
        }

        .upload-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          text-align: center;
        }

        .upload-icon {
          font-size: 3rem;
          opacity: 0.5;
        }

        .file-input {
          display: none;
        }

        .file-selected {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .file-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .file-icon {
          font-size: 2rem;
        }

        .file-info strong {
          display: block;
          margin-bottom: 0.25rem;
        }

        .upload-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .result-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .result-card {
          padding: 1rem;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .result-card.success {
          background: #d1fae5;
          color: #065f46;
        }

        .result-card.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .result-card.info {
          background: #dbeafe;
          color: #1e40af;
        }

        .result-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          font-weight: 600;
        }

        .result-value {
          font-size: 2rem;
          font-weight: 700;
        }

        .result-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--glass-border);
        }

        .result-section h4 {
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
        }

        .result-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 200px;
          overflow-y: auto;
        }

        .result-item {
          padding: 0.75rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-family: monospace;
        }

        .result-item.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .result-item.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .success-message {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #d1fae5;
          color: #065f46;
          border-radius: var(--radius-md);
          text-align: center;
          font-weight: 500;
        }

        .guidelines h4 {
          margin: 1.5rem 0 0.75rem;
          font-size: 0.875rem;
        }

        .guidelines h4:first-child {
          margin-top: 0;
        }

        .guidelines ul {
          margin: 0 0 1rem;
          padding-left: 1.25rem;
        }

        .guidelines li {
          margin-bottom: 0.5rem;
          color: var(--text-secondary);
        }

        .field-list {
          background: var(--bg-secondary);
          padding: 1rem;
          border-radius: var(--radius-md);
        }

        .field-list ul {
          margin: 0;
        }

        .tip-box {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #dbeafe;
          color: #1e40af;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
        }

        @media (max-width: 1024px) {
          .bulk-import-grid {
            grid-template-columns: 1fr;
          }

          .result-summary {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 640px) {
          .result-summary {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
