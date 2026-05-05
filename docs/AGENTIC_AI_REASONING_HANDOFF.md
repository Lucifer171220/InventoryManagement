# Agentic AI Reasoning Handoff

## Goal

The user wanted the existing GenAI features to become more automated with agents, using Ollama for agent creation, while preserving old behavior and avoiding failures.

## Current implementation decision

I first chose a safe read-only automation system. After the user clarified what they mean by agentic AI, I extended it with memory, workflow routing, and human-approved action execution.

The system now has two levels:

- Scheduled automation: read-only multi-agent operational scan.
- Conversational workflow: routes a user request to a specialized agent, stores memory, creates pending actions, and executes only after approval.

## Coding reasoning

The project already had GenAI code, but it was request-based:

- Inventory summary: one selected product plus one user question.
- Helpdesk chatbot: one user message plus optional SKU context.

That design is useful, but it is not agentic because the system waits for the user to ask each question manually.

To make it agentic, I added a coordinator that runs several focused agents in one request. Each agent owns one business area and produces structured output. The frontend can then show the complete automation run instead of requiring the user to manually ask separate questions.

I reused `ollama_service.py` instead of creating a separate Ollama client because that file already knows how to:

- find installed Ollama models,
- choose the best available model,
- call `/api/chat`,
- return fallback messages when Ollama is unavailable.

This keeps AI behavior consistent across old and new features.

## Framework reasoning

The user mentioned LangChain/LangGraph, AutoGen, and CrewAI.

I did not add any of those packages in this pass because the project does not already depend on them, and adding a new agent framework would increase install and runtime risk. The user's strongest requirement was that the system should work correctly and not fail.

I implemented a small in-repo workflow engine instead:

- Intent routing is handled inside `run_conversational_agent_workflow`.
- Tool calls are normal SQLAlchemy queries.
- Memory is stored in `AgentMemory`.
- Human approval is stored in `AgentAction`.
- Approved actions call deterministic Python functions.

This gives the project the core agentic behavior now without dependency risk.

If a framework is added later, LangGraph is the best fit because the app now naturally maps to graph nodes:

- classify intent,
- retrieve memory,
- gather database facts,
- call Ollama,
- create pending action,
- wait for approval,
- execute approved action.

## Replacement explanation

The new code does not replace the existing files in the sense of deleting them or changing their endpoint behavior.

Instead, it replaces the user's manual workflow:

- Before: user manually opens inventory, reports, suppliers, and helpdesk, then asks AI one thing at a time.
- After: user opens `AI Agents`, clicks `Run Automation`, and the backend runs all operational checks together.

Existing implementation remains active:

- `backend/app/routers/inventory.py` still handles item summary.
- `backend/app/routers/helpdesk.py` still handles chatbot responses.
- `backend/app/routers/reports.py` still handles reports and exports.
- `backend/app/services/ollama_service.py` still handles model selection and Ollama requests.

New implementation added:

- `backend/app/services/agent_service.py` contains the agent logic.
- `backend/app/routers/agents.py` exposes the agent API.
- `backend/app/models.py` stores agent memory and pending actions.
- `frontend/src/AgentAutomation.jsx` displays the agent run.
- `frontend/src/App.jsx` adds navigation to the new screen.

In short: old endpoint behavior is preserved; new automation behavior is added.

## Agent design

- Inventory Agent checks active products at or below reorder level.
- Warehouse Agent checks reserved stock and available warehouse quantity.
- Sales Agent compares recent 30-day revenue with the previous 30 days and finds top sellers.
- Supplier Agent checks overdue pending purchase orders.
- Executive Agent asks Ollama to summarize the other agents. If Ollama is missing, it uses deterministic fallback text.

## Detailed code flow

Scheduled automation:

1. User clicks `AI Agents` in the sidebar.
2. `frontend/src/App.jsx` renders `AgentAutomation`.
3. `AgentAutomation` calls `GET /api/agents/status`.
4. `backend/app/routers/agents.py` calls `choose_best_model`.
5. The UI shows whether Ollama is available.
6. User clicks `Run Automation`.
7. `AgentAutomation` calls `POST /api/agents/automation/run`.
8. `agents.py` calls `run_agentic_automation`.
9. `agent_service.py` runs Inventory, Warehouse, Sales, and Supplier agents.
10. The Executive Agent calls Ollama through `generate_response`.
11. If Ollama returns valid JSON, its summary is used.
12. If Ollama is unavailable or returns non-JSON text, fallback summary/actions are used.
13. The frontend renders the summary and each agent card.

Conversational workflow:

1. User enters a message in `Ask an Agent`.
2. `AgentAutomation.jsx` sends it to `POST /api/agents/workflow/run`.
3. `run_conversational_agent_workflow` reads the message.
4. It routes to one of:
   - Smart Inventory Agent,
   - Customer Support Agent,
   - Sales Optimization Agent.
5. The selected agent queries the database.
6. The selected agent creates a summary and structured data.
7. If a real business action is possible, it creates an `AgentAction` with `pending` status.
8. The workflow saves an `AgentMemory` row.
9. Ollama rewrites the answer if available.
10. The frontend displays the answer, memory, and approval buttons.
11. User clicks Approve or Reject.
12. Approve calls `POST /api/agents/actions/{action_id}/approve`.
13. Reject calls `POST /api/agents/actions/{action_id}/reject`.
14. The backend executes only supported approved actions.

## Database changes

Two new tables were added through SQLAlchemy models:

- `agent_memories`
  - Stores agent name, user message, summary, structured data, and timestamp.

- `agent_actions`
  - Stores pending business actions.
  - Tracks `pending`, `approved`, `rejected`, or `failed`.
  - Stores payload and execution result.

The app already calls `Base.metadata.create_all`, so these tables are created automatically when the backend can connect to the database.

## Why agents are read-only

The user said the system should work correctly and should not fail. Direct AI writes could create bad purchase orders, wrong stock transfers, incorrect emails, or duplicate actions.

The first scheduled agents are still read-only.

The new conversational agents can prepare actions, but they do not execute them immediately. A human must approve.

This means the system can do real work without letting AI silently mutate business data.

## Why fallback rules exist

Ollama can be unavailable for several reasons:

- Ollama is not installed.
- Ollama is installed but not running.
- No model is pulled.
- The selected model times out or returns malformed text.

Because of that, all important business checks are calculated with SQLAlchemy and Python rules first. Ollama is only used for the final human-friendly summary.

This is the main reliability design.

## Why this should not fail hard

- All core recommendations are calculated without AI.
- Ollama is optional for the final narrative only.
- `/api/agents/status` tells the frontend whether the system is using Ollama or fallback rules.
- No database schema migration was added.
- No existing endpoint contract was changed.

## Files changed

- `backend/app/services/agent_service.py`
- `backend/app/routers/agents.py`
- `backend/app/main.py`
- `frontend/src/AgentAutomation.jsx`
- `frontend/src/App.jsx`
- `backend/app/routers/inventory.py`
- `AGENTIC_AI_CHANGES.md`
- `AGENTIC_AI_REASONING_HANDOFF.md`

## Bug fix after agent work

The product AI summary endpoint was returning `500 Internal Server Error`.

Cause:

- `backend/app/routers/inventory.py` used `item.warehouse_location`.
- `InventoryItem` does not have `warehouse_location`.
- It also used `item.supplier_name`.
- `InventoryItem` does not have `supplier_name`.

Fix:

- Build `warehouse_summary` from `item.warehouse_inventory`.
- Build `supplier_name` from `item.supplier.name` if present.
- Use `Not assigned` when either relationship is missing.

This keeps the old product summary feature working while still using the correct current database model.

## Streaming response update

The user reported that Ollama responses looked stuck because the frontend waited for the full summary.

Cause:

- `App.jsx` used the non-streaming `POST /api/inventory/{sku}/summary` endpoint.
- That endpoint waits until Ollama completes before returning a JSON response.
- The backend already had streaming support in `ollama_service.py`, and helpdesk already had `/helpdesk/chat/stream`, but the frontend was not using streaming.

Fix:

- Added `POST /api/inventory/{sku}/summary/stream` in `backend/app/routers/inventory.py`.
- Reused `generate_response_stream` from `backend/app/services/ollama_service.py`.
- Sent chunks as Server-Sent Events.
- Added `streamSSEPost` in `frontend/src/App.jsx`.
- Switched product summary to the streaming endpoint.
- Switched helpdesk chat to `/api/helpdesk/chat/stream`.
- Removed `debugger;` from `request()` because browser devtools would pause every request there.

Why `fetch` streaming was used:

- Browser `EventSource` only supports GET easily.
- These endpoints need POST bodies and Authorization headers.
- `fetch` with `response.body.getReader()` supports authenticated POST streaming.

## Future improvement path

The next safe upgrade would be approval-based automation:

1. Agents recommend actions.
2. User selects approved actions.
3. Backend creates draft purchase orders, draft emails, or draft stock transfers.
4. Manager reviews and confirms.

This would make the project more automated while still protecting the system from unwanted AI writes.

Part of that path is now implemented. Remaining future work:

- Add shipment tracking fields and shipping provider integration for true order tracking.
- Add marketing campaign and experiment tables for real A/B testing.
- Add persistent agent run history separate from memory.
- Replace the in-repo workflow with LangGraph if workflows become more complex.

## Suggested next steps

1. Run backend import checks and frontend build.
2. Start backend and frontend.
3. Login with the existing demo manager account.
4. Open `AI Agents`.
5. Click `Run Automation`.
6. Confirm results appear in fallback mode if Ollama is off.
7. Start Ollama and install a model from `OLLAMA_SETUP.md`.
8. Re-run automation and confirm the Executive Agent shows a source model.

## ComfyUI product image update

The user wanted each product to have an image generated by their ComfyUI FLUX.1 Schnell workflow.

Implementation reasoning:

- Product images belong to inventory products, so `image_url` and `image_prompt` were added to `InventoryItem`.
- Images are saved as files instead of storing raw bytes in the database.
- The app already serves `backend/app/static` at `/api/static`, so generated files are saved under `backend/app/static/product_images`.
- The backend uses ComfyUI's HTTP API and `httpx`.
- I used polling through `/history/{prompt_id}` instead of WebSocket to avoid adding the `websocket-client` dependency.
- The feature is optional and fails safely with `503` if ComfyUI or the workflow file is unavailable.

New flow:

1. Frontend calls `POST /api/inventory/{sku}/image`.
2. Backend loads `backend/workflows/product_image_workflow_api.json`.
3. Backend builds a product prompt from name, brand, category, subcategory, and SKU.
4. Backend applies FLUX defaults: steps `4`, CFG `1.0`, sampler `euler`, scheduler `simple`, resolution `1024x1024`.
5. Backend queues the workflow to ComfyUI.
6. Backend polls history until complete.
7. Backend downloads the generated image.
8. Backend saves the PNG locally.
9. Backend updates the product with `image_url` and `image_prompt`.
10. Frontend shows the product image.

Setup requirements:

- ComfyUI must run at `http://127.0.0.1:8188`.
- The exported API workflow must be saved as `backend/workflows/product_image_workflow_api.json`.
- Existing databases need `alembic upgrade head`.

Files added or changed:

- `backend/app/services/comfyui_service.py`
- `backend/app/routers/inventory.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/config.py`
- `frontend/src/App.jsx`
- `frontend/src/styles.css`
- `backend/workflows/README.md`
- `COMFYUI_PRODUCT_IMAGES.md`
- `alembic/versions/20260501_add_product_image_fields.py`

## Port conflict clarification

The user noticed that FastAPI and ComfyUI could conflict if both are started on port `8000`.

Current intended setup:

- FastAPI backend runs on `8000`.
- ComfyUI runs on `8188`.
- Ollama runs on `11434`.
- React/Vite frontend runs on `5173`.

The code already uses `comfyui_base_url = "http://127.0.0.1:8188"` in `backend/app/config.py`.

Added `PORTS_AND_STARTUP.md` so future work knows the expected ports and startup commands.

After the user reported that ComfyUI still starts on `8000`, I searched this repo and found no ComfyUI command forcing `8000`. The remaining cause is likely an external ComfyUI launcher or shortcut.

Added:

- `scripts/check_ports.ps1`
- `scripts/start_comfyui_8188.ps1`

These scripts make it easy to verify port ownership and launch ComfyUI on `8188` explicitly.

Later check:

- `scripts/check_ports.ps1` reported ports `8000`, `8188`, `5173`, and `11434` as free in the workspace shell.
- That means if Chrome still shows ComfyUI at `localhost:8000`, it is likely a stale cached page or old browser tab state, not a currently running server from this project.
- Added Chrome stale-page troubleshooting to `PORTS_AND_STARTUP.md`.

## ComfyUI 503 readiness update

The user hit:

`503: ComfyUI is unavailable: All connection attempts failed`

Meaning:

- FastAPI was running.
- Product image endpoint was called.
- Backend tried to reach ComfyUI.
- Nothing answered at the configured ComfyUI URL.

Changes made:

- Added `check_comfyui_ready` in `backend/app/services/comfyui_service.py`.
- Added `GET /api/inventory/image/status/comfyui`.
- Product generation now checks ComfyUI before queueing.
- Frontend now displays ComfyUI status and disables image generation when offline.
- `COMFYUI_PRODUCT_IMAGES.md` now includes 503 troubleshooting steps.

## ComfyUI workflow 500 update

The user then hit:

`POST http://127.0.0.1:8188/prompt "HTTP/1.1 500 Internal Server Error"`

Meaning:

- ComfyUI was reachable.
- ComfyUI rejected the workflow payload.

Cause found:

- `backend/workflows/product_image_workflow_api.json` was regular UI graph format with top-level `nodes` and `links`.
- ComfyUI `/prompt` expects API format: node id keys with `class_type` and `inputs`.

Changes made:

- Added `convert_workflow_to_api` in `backend/app/services/comfyui_service.py`.
- Converter supports this workflow's common FLUX Schnell nodes:
  - `CheckpointLoaderSimple`
  - `CLIPTextEncode`
  - `EmptySD3LatentImage`
  - `KSampler`
  - `VAEDecode`
  - `SaveImage`
- Fixed the patcher so it modifies the converted copy that is actually sent to ComfyUI.
- Added detailed response text when ComfyUI rejects `/prompt`.

## ComfyUI missing checkpoint update

The user then got:

`Value not in list: ckpt_name: 'flux1-schnell-fp8.safetensors' not in []`

Meaning:

- The workflow conversion worked well enough for ComfyUI to validate nodes.
- ComfyUI could not find the requested checkpoint.
- The available checkpoint list was empty.

Changes made:

- Added `get_available_checkpoints` to `backend/app/services/comfyui_service.py`.
- Added `validate_comfyui_workflow`.
- Product image generation now checks `CheckpointLoaderSimple` model names before queueing.
- Frontend status now shows checkpoint count.

User action needed:

- Place `flux1-schnell-fp8.safetensors` in the checkpoint folder used by the running ComfyUI instance, or update the workflow to use an installed checkpoint.
- Restart ComfyUI after adding the model.

The user said the checkpoint is in:

`C:\Users\rupam\Documents\ComfyUI\models\checkpoints`

But the ComfyUI traceback showed the running server path:

`D:\ComfyUI\resources\ComfyUI`

So the running ComfyUI instance likely cannot see the `Documents` model folder. The model should be copied or linked into:

`D:\ComfyUI\resources\ComfyUI\models\checkpoints`

Added `scripts/check_comfyui_checkpoints.ps1` to list checkpoints visible through ComfyUI's API.
