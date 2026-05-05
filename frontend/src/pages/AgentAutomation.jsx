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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export default function AgentAutomation({ token, onError }) {
  const [status, setStatus] = useState(null);
  const [run, setRun] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [agentMessage, setAgentMessage] = useState("We are running low on Nike shoes in Pune store, what should we do?");
  const [loading, setLoading] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const data = await request("/agents/status", {}, token);
      setStatus(data);
    } catch (err) {
      onError(err.message);
    }
  }

  async function runAutomation() {
    try {
      setLoading(true);
      const data = await request("/agents/automation/run", { method: "POST" }, token);
      setRun(data);
      setStatus((current) => current ? { ...current, selected_model: data.source_model || current.selected_model } : current);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function askAgent(event) {
    event.preventDefault();
    if (!agentMessage.trim()) return;
    try {
      setWorkflowLoading(true);
      const data = await request("/agents/workflow/run", {
        method: "POST",
        body: JSON.stringify({ message: agentMessage }),
      }, token);
      setWorkflow(data);
    } catch (err) {
      onError(err.message);
    } finally {
      setWorkflowLoading(false);
    }
  }

  async function decideAction(actionId, decision) {
    try {
      const data = await request(`/agents/actions/${actionId}/${decision}`, { method: "POST" }, token);
      setWorkflow((current) => {
        if (!current) return current;
        return {
          ...current,
          pending_actions: current.pending_actions.map((action) => (
            action.id === actionId ? data : action
          )),
        };
      });
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="page">
      <header className="page-header animate-slide-up">
        <div>
          <p className="eyebrow">Agentic AI</p>
          <h1>Automation Center</h1>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={loadStatus}>Refresh Status</button>
          <button onClick={runAutomation} disabled={loading}>
            {loading ? "Running Agents..." : "Run Automation"}
          </button>
        </div>
      </header>

      <section className="panel animate-slide-up">
        <div className="agent-status-row">
          <div>
            <span className="summary-label">Mode</span>
            <strong>{status?.mode || "Checking..."}</strong>
          </div>
          <div>
            <span className="summary-label">Selected Model</span>
            <strong>{status?.selected_model || "Fallback rules"}</strong>
          </div>
          <div>
            <span className="summary-label">Installed Models</span>
            <strong>{status?.installed_models?.length || 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel animate-slide-up">
        <div className="panel-head">
          <div>
            <h2>Ask an Agent</h2>
            <p className="muted">The agent can inspect data, use memory, and queue actions for approval.</p>
          </div>
        </div>
        <form onSubmit={askAgent} className="stack">
          <textarea
            rows="4"
            value={agentMessage}
            onChange={(event) => setAgentMessage(event.target.value)}
            placeholder="Ask about restocking, order status, refunds, campaigns, or discounts..."
          />
          <button type="submit" disabled={workflowLoading}>
            {workflowLoading ? "Thinking..." : "Ask Agent"}
          </button>
        </form>
      </section>

      {workflow ? (
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <div>
              <h2>{workflow.agent}</h2>
              <p className="muted">{workflow.run_id} | Human approval required for actions</p>
            </div>
            <span className="status-pill healthy">{workflow.source_model || "fallback"}</span>
          </div>
          <p>{workflow.answer}</p>
          {workflow.memory?.length ? (
            <div className="agent-memory">
              <span className="summary-label">Recent Memory</span>
              {workflow.memory.map((memory, index) => (
                <div key={`${memory.created_at}-${index}`} className="result-card">
                  <strong>{memory.agent}</strong>
                  <p>{memory.summary}</p>
                </div>
              ))}
            </div>
          ) : null}
          {workflow.pending_actions?.length ? (
            <div className="agent-actions">
              {workflow.pending_actions.map((action) => (
                <div key={action.id} className="result-card agent-action-card">
                  <div>
                    <strong>{action.title}</strong>
                    <p>{action.description}</p>
                    <span className={`status-pill ${action.status === "pending" ? "warning" : action.status === "approved" ? "healthy" : "danger"}`}>
                      {action.status}
                    </span>
                  </div>
                  {action.status === "pending" ? (
                    <div className="agent-action-buttons">
                      <button type="button" onClick={() => decideAction(action.id, "approve")}>Approve</button>
                      <button type="button" className="secondary" onClick={() => decideAction(action.id, "reject")}>Reject</button>
                    </div>
                  ) : null}
                  {action.result ? <pre className="response-box">{JSON.stringify(action.result, null, 2)}</pre> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No approval actions were needed for this answer.</p>
          )}
        </section>
      ) : null}

      {run ? (
        <section className="panel animate-slide-up">
          <div className="panel-head">
            <div>
              <h2>Automation Summary</h2>
              <p className="muted">{run.run_id} | {new Date(run.finished_at).toLocaleString()}</p>
            </div>
            <span className={`status-pill ${run.status === "attention" ? "danger" : "healthy"}`}>
              {run.status}
            </span>
          </div>
          <p>{run.summary}</p>
          <div className="agent-actions">
            {run.recommended_actions.map((action, index) => (
              <div key={`${action}-${index}`} className="result-card">
                {action}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {run?.agents?.length ? (
        <section className="agent-grid">
          {run.agents.map((agent) => (
            <article key={agent.agent} className="panel animate-slide-up">
              <div className="panel-head">
                <h2>{agent.agent}</h2>
                <span className={`status-pill ${agent.status === "attention" ? "danger" : "healthy"}`}>
                  {agent.status}
                </span>
              </div>
              <p>{agent.summary}</p>
              <div className="stack">
                {agent.recommended_actions.map((action, index) => (
                  <div key={`${agent.agent}-${index}`} className="result-card">
                    {action}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel animate-slide-up">
          <p className="muted">Run automation to let the agents inspect inventory, warehouse, sales, and supplier signals.</p>
        </section>
      )}

      <style>{`
        .agent-status-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }
        .agent-status-row div {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 1rem;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
        }
        .agent-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }
        .agent-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
          margin-top: 1rem;
        }
        .agent-memory {
          display: grid;
          gap: 0.75rem;
          margin-top: 1rem;
        }
        .agent-action-card {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .agent-action-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .status-pill.healthy {
          background: var(--success);
          color: white;
        }
        .status-pill.warning {
          background: var(--warning);
          color: white;
        }
        .status-pill.danger {
          background: var(--danger);
          color: white;
        }
      `}</style>
    </div>
  );
}
