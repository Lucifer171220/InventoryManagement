import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

export default function EmailForm() {
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!subject || !recipient || !body) {
      setStatus("Please fill all fields");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const resp = await fetch(`${API_BASE}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, recipient, body }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Failed to send");
      setStatus("sent");
      setSubject("");
      setRecipient("");
      setBody("");
    } catch (e) {
      setStatus(`error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel email-panel animate-slide-up">
      <div className="panel-header">
        <div className="panel-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h2>Send Email</h2>
      </div>
      <div className="form-fields">
        <div className="input-group">
          <label>Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject"
          />
        </div>
        <div className="input-group">
          <label>Recipient</label>
          <input
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="recipient@example.com"
          />
        </div>
        <div className="input-group">
          <label>Message</label>
          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message here..."
          />
        </div>
      </div>
      <button onClick={send} disabled={loading}>
        {loading ? (
          <span className="btn-loading"></span>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send Email
          </>
        )}
      </button>
      {status && (
        <div className={`status-message ${status.startsWith("error") ? "error" : "success"}`}>
          {status === "sent" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
          {status}
        </div>
      )}
    </div>
  );
}