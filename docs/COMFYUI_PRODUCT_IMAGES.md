# ComfyUI Product Image Generation

## What this adds

Inventory products can now have generated product images.

The backend sends the product name, brand, category, and SKU to a ComfyUI FLUX.1 Schnell workflow. The generated image is saved locally and shown in the frontend product list and product details.

## Required ComfyUI setup

Start ComfyUI:

```bash
cd ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

Important: do not run ComfyUI on port `8000` while FastAPI is also using port `8000`.

Recommended local ports:

- FastAPI backend: `http://localhost:8000`
- ComfyUI: `http://127.0.0.1:8188`
- Frontend: `http://localhost:5173`
- Ollama: `http://127.0.0.1:11434`

The backend ComfyUI setting is:

```python
comfyui_base_url: str = "http://127.0.0.1:8188"
```

If ComfyUI still opens on port `8000`, this app is not causing it. Check your ComfyUI startup command, shortcut, or `.bat` file and remove `--port 8000`.

You can force the right port from this project with:

```powershell
.\scripts\start_comfyui_8188.ps1 -ComfyUIPath "C:\path\to\ComfyUI"
```

To see what is using ports `8000` and `8188`:

```powershell
.\scripts\check_ports.ps1
```

If Chrome still shows ComfyUI at `localhost:8000` but the port checker says `8000` is free, Chrome is showing a stale page. Open `http://127.0.0.1:8000/health` in a new tab and hard refresh with `Ctrl + Shift + R`.

Export your workflow in API format:

1. Open ComfyUI.
2. Enable Dev Mode or press `F12`.
3. Click `Save (API Format)`.
4. Save the file as:

```text
backend/workflows/product_image_workflow_api.json
```

## Files changed

- `backend/app/services/comfyui_service.py`
  - Loads the API-format workflow.
  - Updates product prompt and FLUX settings.
  - Queues the prompt through ComfyUI.
  - Polls history until the image is ready.
  - Downloads and stores the generated image locally.

- `backend/app/routers/inventory.py`
  - Adds `POST /api/inventory/{sku}/image`.

- `backend/app/models.py`
  - Adds `image_url`.
  - Adds `image_prompt`.

- `backend/app/schemas.py`
  - Adds product image fields and image generation request/response schemas.

- `backend/app/config.py`
  - Adds ComfyUI settings.

- `frontend/src/App.jsx`
  - Shows product thumbnails and product image preview.
  - Adds `Generate Product Image`.

- `frontend/src/styles.css`
  - Adds product image styling.

## Prompt behavior

The prompt asks ComfyUI to show the product clearly inside a clean retail packaging box where the product remains visible.

## FLUX.1 Schnell defaults

- Steps: `4`
- CFG: `1.0`
- Sampler: `euler`
- Scheduler: `simple`
- Resolution: `1024 x 1024`

## Existing database note

Run this for an existing database:

```bash
alembic upgrade head
```

Without this migration, the backend model will expect `image_url` and `image_prompt`, but the table may not have them yet.

## Failure behavior

If ComfyUI is not running or the workflow file is missing, normal inventory still works. The image endpoint returns a clear `503` error.

## Fixing `503: ComfyUI is unavailable`

This error means FastAPI could not connect to ComfyUI at the configured URL.

Default expected URL:

```text
http://127.0.0.1:8188
```

Check these:

1. Start ComfyUI on `8188`:

```bash
cd ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

2. Open this in the browser:

```text
http://127.0.0.1:8188/system_stats
```

You should see JSON from ComfyUI.

3. Check ports:

```powershell
.\scripts\check_ports.ps1
```

4. Make sure FastAPI is still on `8000`, not ComfyUI:

```text
http://127.0.0.1:8000/health
```

5. Make sure the workflow file exists:

```text
backend/workflows/product_image_workflow_api.json
```

The frontend now checks ComfyUI status and disables `Generate Product Image` when ComfyUI is not reachable.

## Fixing `/prompt` 500 errors

If ComfyUI is reachable but `/prompt` returns `500`, the workflow payload was rejected by ComfyUI.

Common causes:

- the checkpoint/model name in the workflow does not exist in your ComfyUI models folder,
- a custom node used by the workflow is not installed,
- the workflow JSON is regular UI format instead of API format,
- a node input name does not match your installed ComfyUI version.

The backend now converts regular UI workflow JSON with `nodes` and `links` into `/prompt` API format for the common FLUX Schnell nodes used here.

ComfyUI `/prompt` expects this shape:

```json
{
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "prompt here"
    }
  }
}
```

Regular UI workflow files look like this:

```json
{
  "nodes": [],
  "links": []
}
```

If a custom workflow still fails, export it again with `Save (API Format)` and check the detailed ComfyUI error returned by the backend.

## Fixing `ckpt_name not in []`

This ComfyUI error means your workflow asks for a checkpoint file, but ComfyUI cannot see that file.

Example:

```text
Value not in list: ckpt_name: 'flux1-schnell-fp8.safetensors' not in []
```

Meaning:

- The workflow asks for `flux1-schnell-fp8.safetensors`.
- ComfyUI's checkpoint list is empty.
- The model file is not installed in the checkpoint folder used by this ComfyUI instance.

Fix options:

1. Put the checkpoint in the checkpoint folder used by the ComfyUI instance you started.

Common locations:

```text
ComfyUI/models/checkpoints/flux1-schnell-fp8.safetensors
D:\ComfyUI\resources\ComfyUI\models\checkpoints\flux1-schnell-fp8.safetensors
```

2. Restart ComfyUI.

3. Open ComfyUI and confirm the checkpoint appears in the `CheckpointLoaderSimple` dropdown.

4. Or change the workflow checkpoint node to use a model that already appears in that dropdown.

The backend now checks available checkpoints before queueing generation. If the checkpoint is missing, it returns a clear error without sending a bad prompt.

If your checkpoint is in:

```text
C:\Users\rupam\Documents\ComfyUI\models\checkpoints
```

but the running ComfyUI log shows:

```text
D:\ComfyUI\resources\ComfyUI
```

then the running ComfyUI instance is using the `D:` ComfyUI folder, not the `Documents` ComfyUI folder. Put or link the checkpoint into:

```text
D:\ComfyUI\resources\ComfyUI\models\checkpoints
```

Then restart ComfyUI.

You can check what checkpoints the running ComfyUI server can see with:

```powershell
.\scripts\check_comfyui_checkpoints.ps1
```

If it does not list `flux1-schnell-fp8.safetensors`, the running ComfyUI server still cannot see the model.

## Restart note after backend changes

If ComfyUI logs this error:

```text
TypeError: argument of type 'int' is not iterable
```

FastAPI may still be running old backend code that sent the regular UI workflow directly. Restart FastAPI so the workflow converter is active.
