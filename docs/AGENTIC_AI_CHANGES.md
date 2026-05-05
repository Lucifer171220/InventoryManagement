# Agentic AI Changes

## What changed

This project now has an Agentic AI automation layer powered by Ollama when a local model is available.

## Important: what was replaced

The new code did not delete or replace the previous GenAI features.

The previous features still work the same way:

- Product AI summary still uses `POST /api/inventory/{sku}/summary`.
- Helpdesk chatbot still uses `POST /api/helpdesk/chat`.
- Existing reports still use the old `/api/reports/...` endpoints.
- Existing Ollama helper code in `backend/app/services/ollama_service.py` is still reused.

What changed is that a new automation layer was added beside the old features:

- Old flow: user asks one question, backend sends one prompt to Ollama, frontend shows one answer.
- New flow: user clicks `Run Automation`, backend runs multiple small agents, agents inspect live database facts, then Ollama summarizes the combined results if available.

So the new code extends the system. It does not break or remove the earlier manual GenAI behavior.

## New agentic workflow features

The latest update adds the core developer components needed for agentic AI:

- LLM brain
  - Reuses existing Ollama through `backend/app/services/ollama_service.py`.

- Memory
  - Adds `AgentMemory` in `backend/app/models.py`.
  - Stores past user messages, selected agent, summaries, and structured data.

- Workflow orchestration
  - Adds natural-language routing in `run_conversational_agent_workflow`.
  - Chooses the correct agent based on the request:
    - inventory/restock questions go to Smart Inventory Agent,
    - order/refund/tracking questions go to Customer Support Agent,
    - sales/discount/campaign questions go to Sales Optimization Agent.

- Human in the loop
  - Adds `AgentAction` in `backend/app/models.py`.
  - Agents queue actions as `pending`.
  - The frontend shows Approve and Reject buttons.
  - The backend only executes sensitive actions after approval.

- Action execution
  - Can create draft purchase orders after approval.
  - Can create notifications after approval.
  - Can cancel a sale after approval when a support/refund scenario requires it.

## Framework decision

The user suggested LangChain/LangGraph, AutoGen, or CrewAI.

For this codebase, I chose a lightweight in-repo workflow first instead of adding a heavy framework dependency immediately.

Reason:

- The current project does not already include LangChain, LangGraph, AutoGen, or CrewAI.
- Adding one of them would require new dependency installation and version management.
- The user's highest priority was reliability and not failing.
- The needed workflow is simple enough to implement directly:
  - route request,
  - gather data,
  - create plan,
  - queue action,
  - wait for human approval,
  - execute approved action.

If this project grows into more complex branching workflows, LangGraph is the best next framework choice because it maps naturally to graph-style agent state, tool calls, memory, and human approval checkpoints.

## Backend files

- `backend/app/services/agent_service.py`
  - Adds small agents for inventory, warehouse stock, sales, suppliers, and executive summary.
  - Each agent first uses database facts and rules.
  - Ollama is used only for the final executive summary, so the system still works if Ollama is not running.
  - Adds conversational agent workflow routing.
  - Adds pending action creation and approval execution.

- `backend/app/routers/agents.py`
  - Adds `GET /api/agents/status`.
  - Adds `POST /api/agents/automation/run`.
  - Adds `POST /api/agents/workflow/run`.
  - Adds `POST /api/agents/actions/{action_id}/approve`.
  - Adds `POST /api/agents/actions/{action_id}/reject`.

- `backend/app/main.py`
  - Registers the new agents router.
  - This is the only backend integration point needed so FastAPI exposes the new `/api/agents/...` routes.

- `backend/app/models.py`
  - Adds `AgentMemory` for memory.
  - Adds `AgentAction` for human approval workflow.
  - Adds `AgentActionStatus` for pending, approved, rejected, and failed states.

- `backend/app/routers/inventory.py`
  - Fixes the AI summary prompt so it uses real model relationships.
  - Replaces invalid `item.warehouse_location` with a warehouse stock summary from `item.warehouse_inventory`.
  - Replaces invalid `item.supplier_name` with `item.supplier.name` when a supplier exists.
  - This fixes the `500 Internal Server Error` from `POST /api/inventory/{sku}/summary`.
  - Adds `POST /api/inventory/{sku}/summary/stream` so Ollama summary text streams chunk by chunk.

## Frontend files

- `frontend/src/AgentAutomation.jsx`
  - Adds an Automation Center screen.
  - Shows Ollama status, selected model, automation summary, and each agent result.
  - Adds an `Ask an Agent` form.
  - Shows recent memory.
  - Shows pending actions with Approve and Reject buttons.

- `frontend/src/App.jsx`
  - Adds an `AI Agents` navigation item.
  - Opens the new Automation Center tab.
  - Adds `streamSSEPost`, a fetch-based Server-Sent Events reader for authenticated POST streaming.
  - Product AI summary now streams from `/api/inventory/{sku}/summary/stream`.
  - Helpdesk chatbot now streams from `/api/helpdesk/chat/stream`.
  - Removes a `debugger;` statement from the shared request helper because it can pause requests when browser devtools are open.

## How it behaves

1. User opens `AI Agents`.
2. The app checks whether Ollama has an installed model.
3. User clicks `Run Automation`.
4. Backend agents inspect live inventory, warehouse, sales, and supplier data.
5. If Ollama is available, the Executive Agent creates a short final brief.
6. If Ollama is not available, deterministic fallback recommendations are returned.

## Streaming behavior

The old product summary flow waited for the whole Ollama response before updating the UI:

1. Frontend sent `POST /api/inventory/{sku}/summary`.
2. Backend waited for Ollama to finish.
3. Frontend showed the full answer at once.

The new streaming flow updates the UI as chunks arrive:

1. Frontend sends `POST /api/inventory/{sku}/summary/stream`.
2. Backend uses `generate_response_stream`.
3. Backend sends each chunk as `text/event-stream`.
4. Frontend reads `response.body.getReader()`.
5. Frontend appends each chunk to the visible answer immediately.

This makes the summary feel like ChatGPT instead of looking stuck.

## How the new code connects to existing code

The new service imports existing database models:

- `InventoryItem`
- `WarehouseInventory`
- `Sale`
- `SaleItem`
- `PurchaseOrder`
- `Supplier`

This means the agents analyze the same data already used by inventory, POS, reports, suppliers, warehouses, and purchase order screens.

The new service also imports existing Ollama helpers:

- `choose_best_model`
- `generate_response`

This means model selection and Ollama calling behavior stay centralized in `ollama_service.py`.

## Agent-by-agent behavior

- Inventory Agent
  - Looks for active items where `quantity <= reorder_level`.
  - Recommends reorder actions using each item's `reorder_quantity`.

- Warehouse Agent
  - Looks for warehouse stock where reserved quantity exists.
  - Warns when available quantity is zero or below after reservations.

- Sales Agent
  - Compares the last 30 days of completed sales against the previous 30 days.
  - Finds top-selling items so the user knows what stock needs attention.

- Supplier Agent
  - Checks pending purchase orders.
  - Warns when expected delivery dates are already past.

- Executive Agent
  - Receives the other agents' summaries.
  - Uses Ollama to create a short operations brief.
  - Falls back to rule-based actions if Ollama is missing.

## Example: Smart Inventory Agent

User says:

`We are running low on Nike shoes in Pune store, what should we do?`

Flow:

1. `AgentAutomation.jsx` sends the message to `POST /api/agents/workflow/run`.
2. `run_conversational_agent_workflow` routes it to Smart Inventory Agent.
3. The agent extracts keywords like `nike`, `shoes`, and `pune`.
4. It searches `InventoryItem` for matching SKU, name, brand, category, or description.
5. It searches `Warehouse` for a matching Pune warehouse.
6. It checks warehouse quantity from `WarehouseInventory`.
7. It checks 30-day demand from `Sale` and `SaleItem`.
8. It calculates a 14-day forecast.
9. It suggests restock quantity.
10. If supplier and warehouse data exist, it creates a pending `create_purchase_order` action.
11. The frontend shows Approve/Reject.
12. Only after approval does the backend create a draft purchase order.

This is agentic because the system does more than chat:

- it decides which agent should handle the task,
- it uses tools/database queries,
- it remembers the interaction,
- it creates an actionable plan,
- it waits for human approval,
- it can execute an approved business action.

## Example: Customer Support Agent

User says:

`Where is my order SALE202604300001?`

Flow:

1. The workflow routes to Customer Support Agent.
2. It searches `Sale` by sale code.
3. It returns the sale status.
4. If the user asks for refund, delayed delivery, or cancellation, it creates a pending `cancel_sale` action.
5. A manager or moderator must approve before cancellation restores stock.

Shipment tracking is not fully automated yet because the current database does not store shipment tracking IDs or a shipping provider API response.

## Example: Sales Optimization Agent

User says:

`Suggest a discount campaign for this month.`

Flow:

1. The workflow routes to Sales Optimization Agent.
2. It checks last 30 days sales from `Sale` and `SaleItem`.
3. It finds top revenue items.
4. It suggests a campaign or bundle discount.
5. It queues a notification action for approval.

Actual A/B testing is not implemented yet because the current project has no marketing campaign table, experiment table, or traffic attribution data.

## Safety design

- The automation is read-only.
- Scheduled automation does not create, update, or delete records.
- Conversational workflow can create records only after human approval.
- It keeps existing GenAI item summary and helpdesk features unchanged.
- It returns useful fallback results when Ollama is missing or unreachable.

## Why this approach was chosen

The user asked for maximum automation but also said the most important thing is that the system should work correctly and not fail.

For that reason, the implementation avoids risky automatic writes. The agents currently recommend actions instead of directly changing inventory, creating purchase orders, or emailing suppliers. This makes the new system useful immediately while protecting the database from incorrect AI decisions.

## ComfyUI Product Image Generation

Added optional ComfyUI product image generation.

Files changed:

- `backend/app/services/comfyui_service.py`
  - Loads `backend/workflows/product_image_workflow_api.json`.
  - Applies product prompt and FLUX.1 Schnell settings.
  - Queues ComfyUI generation through `/prompt`.
  - Polls `/history/{prompt_id}`.
  - Downloads the first image through `/view`.
  - Saves generated PNG files to `backend/app/static/product_images`.

- `backend/app/routers/inventory.py`
  - Adds `POST /api/inventory/{sku}/image`.

- `backend/app/models.py`
  - Adds `image_url`.
  - Adds `image_prompt`.

- `backend/app/schemas.py`
  - Adds image fields and image generation request/response schemas.

- `backend/app/config.py`
  - Adds ComfyUI URL, workflow path, and timeout settings.

- `frontend/src/App.jsx`
  - Shows product thumbnails.
  - Shows product detail image preview.
  - Adds `Generate Product Image` for managers and moderators.

- `frontend/src/styles.css`
  - Adds product thumbnail and product image panel styling.

- `COMFYUI_PRODUCT_IMAGES.md`
  - Documents ComfyUI setup and workflow placement.

Behavior:

1. Manager or moderator selects a product.
2. User clicks `Generate Product Image`.
3. Backend builds a prompt from product name, brand, category, subcategory, and SKU.
4. Backend sends the workflow to ComfyUI.
5. Backend saves the image locally.
6. Backend stores `image_url` and `image_prompt` on the product.
7. Frontend shows the image in the product list and product detail view.

For existing databases, run:

```bash
alembic upgrade head
```

If ComfyUI is not running or the workflow file is missing, only image generation fails. Inventory still works normally.

## Port conflict clarification

FastAPI and ComfyUI cannot both use port `8000`.

The project is configured for:

- FastAPI: `http://localhost:8000`
- ComfyUI: `http://127.0.0.1:8188`
- Frontend: `http://localhost:5173`
- Ollama: `http://127.0.0.1:11434`

Added `PORTS_AND_STARTUP.md` with exact startup commands and guidance for changing ports safely.

Added helper scripts:

- `scripts/check_ports.ps1`
  - Shows which process owns ports `8000`, `8188`, `5173`, and `11434`.

- `scripts/start_comfyui_8188.ps1`
  - Starts an external ComfyUI folder with `--port 8188`.

- `scripts/check_comfyui_checkpoints.ps1`
  - Lists checkpoints visible to the running ComfyUI server.
  - Helps catch the case where the model is in one ComfyUI folder but the running server uses another.

## ComfyUI 503 Readiness Check

Added a ComfyUI status check before product image generation.

Files changed:

- `backend/app/services/comfyui_service.py`
  - Adds `check_comfyui_ready`.
  - Product generation now verifies ComfyUI is reachable before queueing a workflow.
  - Error now clearly says to start ComfyUI with `--port 8188`.
  - Converts regular ComfyUI UI workflow JSON (`nodes` and `links`) into `/prompt` API format.
  - Shows detailed ComfyUI rejection text when `/prompt` returns an error.
  - Checks ComfyUI's available checkpoints before queueing.
  - Returns a clear error when `flux1-schnell-fp8.safetensors` is missing.

- `backend/app/routers/inventory.py`
  - Adds `GET /api/inventory/image/status/comfyui`.

- `frontend/src/App.jsx`
  - Loads ComfyUI status after login.
  - Shows `ComfyUI ready` or `ComfyUI unavailable`.
  - Shows how many checkpoints ComfyUI reports.
  - Disables `Generate Product Image` when ComfyUI is offline.

- `frontend/src/styles.css`
  - Adds ComfyUI status styles.
