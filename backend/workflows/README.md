# ComfyUI Workflows

python main.py --listen 0.0.0.0 --port 8188

This directory contains ComfyUI workflow definitions used by the backend to generate product images for inventory items.

## Quick Start

1. **Design your workflow in ComfyUI** - Create your image generation pipeline using ComfyUI's node-based interface
2. **Enable Dev Mode** - In ComfyUI settings, enable "Dev mode" option
3. **Export as API Format** - Use "Save (API Format)" to export the workflow JSON
4. **Place in workflows directory** - Save the exported file as `product_image_workflow_api.json`

## How the Integration Works

### Backend Flow

The backend integration is handled in `app/services/comfyui_service.py`:

1. **`load_workflow()`** - Loads the workflow JSON file from this directory
2. **`apply_flux_product_settings()`** - Modifies the workflow nodes with runtime parameters:
   - Updates `CLIPTextEncode` nodes with the product prompt
   - Configures `KSampler` nodes with steps, CFG, sampler settings, and seed
   - Sets `EmptySD3LatentImage` dimensions (width/height)
3. **`queue_prompt()`** - Sends the modified workflow to ComfyUI's `/prompt` API endpoint
4. **`wait_for_history()`** - Polls ComfyUI's `/history/{prompt_id}` endpoint until generation completes
5. **`fetch_first_image()`** - Retrieves the generated image from ComfyUI's `/view` endpoint

### Workflow Node Structure

The integration expects nodes in API format with this structure:

```json
{
  "nodes": [
    {
      "id": 6,
      "type": "CLIPTextEncode",
      "widgets_values": ["Your prompt here"]
    },
    {
      "id": 31,
      "type": "KSampler",
      "widgets_values": [seed, "randomize", steps, cfg, "sampler_name", "scheduler", ...]
    },
    {
      "id": 27,
      "type": "EmptySD3LatentImage",
      "widgets_values": [width, height, batch_size]
    }
  ],
  "links": [...],
  "extra": {...}
}
```

### Supported Node Types

| Node Type | Modification | Widget Index |
|-----------|-------------|--------------|
| `CLIPTextEncode` | Sets prompt text | Index 0 |
| `KSampler` / `KSamplerAdvanced` | Sets seed, steps, sampler, scheduler | Index 0, 2, 4, 5 |
| `EmptySD3LatentImage` | Sets width and height | Index 0, 1 |

## Configuration

The following settings in `app/config.py` control the integration:

- `comfyui_base_url` - Base URL for ComfyUI server (default: `http://127.0.0.1:8188`)
- `comfyui_workflow_path` - Path to workflow JSON file
- `comfyui_timeout_seconds` - Timeout for waiting on generation to complete

## API Endpoint

Once configured, product images can be generated via:

```
POST /api/inventory/{sku}/image
```

Request body:
```json
{
  "prompt": "Optional custom prompt",
  "steps": 4,
  "cfg": 1.0,
  "width": 1024,
  "height": 1024
}
```

## Troubleshooting

1. **`'str' object has no attribute 'get'`** - Ensure workflow is saved in API format (not regular format)
2. **Timeout errors** - Increase `comfyui_timeout_seconds` or check ComfyUI server status
3. **Missing nodes** - Verify all custom nodes in workflow are installed in ComfyUI

## Example Workflow

See `product_image_workflow_api.json` for a working Flux Schnell example with:
- Checkpoint loader (Flux model)
- CLIP text encoders (positive/negative prompts)
- KSampler for diffusion
- Empty latent image configuration
- VAE decode and image save
