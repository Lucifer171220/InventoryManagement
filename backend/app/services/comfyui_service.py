import copy
import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings
from app.models import InventoryItem

settings = get_settings()


class ComfyUIError(RuntimeError):
    pass


def _safe_filename(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip())
    return safe[:80] or "product"


def build_product_prompt(item: InventoryItem, extra_prompt: str | None = None) -> str:
    product_bits = [
        item.name,
        item.brand,
        item.category,
        item.subcategory,
    ]
    product_text = ", ".join(str(bit) for bit in product_bits if bit)
    description = f" Product description: {item.description.strip()}." if item.description and item.description.strip() else ""
    is_book = any(
        value and "book" in str(value).lower()
        for value in [item.name, item.category, item.subcategory, item.description]
    )

    if is_book:
        base = (
            f"High quality ecommerce product photo of the book: {product_text}."
            f"{description} Show a single physical book standing upright, front cover fully visible, "
            "rectangular book shape, readable cover design style, centered composition, studio lighting, "
            "sharp details, realistic paper texture, clean white background. Do not show a box or retail packaging."
        )
    else:
        base = (
            f"High quality ecommerce product photo of {product_text}."
            f"{description} Show the product clearly, front-facing composition, studio lighting, "
            "sharp details, realistic materials, clean white background."
        )
    if extra_prompt:
        return f"{base} {extra_prompt}"
    return base


def load_workflow() -> dict[str, Any]:
    workflow_path = Path(settings.comfyui_workflow_path)
    if not workflow_path.exists():
        raise ComfyUIError(f"ComfyUI workflow file not found: {workflow_path}")
    with workflow_path.open("r", encoding="utf-8") as handle:
        workflow = json.load(handle)
    if not isinstance(workflow, dict) or not workflow:
        raise ComfyUIError(
            "ComfyUI workflow is empty. Export a workflow with a SaveImage node to "
            f"{workflow_path}, or restore backend/workflows/product_image_workflow_api.json."
        )
    return workflow


def apply_flux_product_settings(
    workflow: dict[str, Any],
    prompt: str,
    steps: int,
    cfg: float,
    width: int,
    height: int,
) -> dict[str, Any]:
    updated = convert_workflow_to_api(workflow)
    seed = int(time.time() * 1000) % 2147483647

    for node in updated.values():
        if not isinstance(node, dict):
            continue
        class_type = node.get("class_type")
        inputs = node.setdefault("inputs", {})

        if class_type == "CLIPTextEncode" and "text" in inputs:
            title = str(node.get("_meta", {}).get("title", "")).lower()
            if "negative" not in title:
                inputs["text"] = prompt

        if class_type in {"KSampler", "KSamplerAdvanced"}:
            inputs["seed"] = seed
            inputs["steps"] = steps
            inputs["cfg"] = cfg
            inputs["sampler_name"] = "euler"
            inputs["scheduler"] = "simple"

        if class_type in {"EmptyLatentImage", "EmptySD3LatentImage"}:
            inputs["width"] = width
            inputs["height"] = height

    return updated


def convert_workflow_to_api(workflow: dict[str, Any]) -> dict[str, Any]:
    """Return a ComfyUI /prompt compatible workflow.

    ComfyUI has two JSON shapes:
    - API format: {"6": {"class_type": "...", "inputs": {...}}}
    - UI format: {"nodes": [...], "links": [...], ...}

    The /prompt endpoint needs API format. This converter supports the common
    FLUX Schnell workflow nodes used by this project.
    """
    if "nodes" not in workflow:
        return copy.deepcopy(workflow)

    nodes = {str(node["id"]): node for node in workflow.get("nodes", []) if isinstance(node, dict) and "id" in node}
    link_sources: dict[int, list[Any]] = {}
    for link in workflow.get("links", []):
        if isinstance(link, list) and len(link) >= 6:
            link_id, source_node, source_slot = link[0], link[1], link[2]
            link_sources[link_id] = [str(source_node), source_slot]

    api_workflow: dict[str, Any] = {}
    for node_id, node in nodes.items():
        class_type = node.get("type")
        if class_type in {"Note", "MarkdownNote"}:
            continue

        inputs: dict[str, Any] = {}
        for input_def in node.get("inputs", []):
            link_id = input_def.get("link")
            if link_id is not None and link_id in link_sources:
                inputs[input_def["name"]] = link_sources[link_id]

        widgets = node.get("widgets_values") or []
        _apply_widget_inputs(class_type, inputs, widgets)

        api_workflow[node_id] = {
            "class_type": class_type,
            "inputs": inputs,
        }
        title = node.get("title")
        if title:
            api_workflow[node_id]["_meta"] = {"title": title}

    return api_workflow


def _apply_widget_inputs(class_type: str, inputs: dict[str, Any], widgets: list[Any]) -> None:
    if class_type == "CLIPTextEncode":
        inputs["text"] = widgets[0] if len(widgets) > 0 else ""
        return

    if class_type == "CheckpointLoaderSimple":
        if len(widgets) > 0:
            inputs["ckpt_name"] = widgets[0]
        return

    if class_type in {"EmptyLatentImage", "EmptySD3LatentImage"}:
        if len(widgets) > 0:
            inputs["width"] = widgets[0]
        if len(widgets) > 1:
            inputs["height"] = widgets[1]
        if len(widgets) > 2:
            inputs["batch_size"] = widgets[2]
        return

    if class_type in {"KSampler", "KSamplerAdvanced"}:
        if len(widgets) > 0:
            inputs["seed"] = widgets[0]
        if len(widgets) > 2:
            inputs["steps"] = widgets[2]
        if len(widgets) > 3:
            inputs["cfg"] = widgets[3]
        if len(widgets) > 4:
            inputs["sampler_name"] = widgets[4]
        if len(widgets) > 5:
            inputs["scheduler"] = widgets[5]
        if len(widgets) > 6:
            inputs["denoise"] = widgets[6]
        return

    if class_type == "SaveImage":
        inputs["filename_prefix"] = widgets[0] if len(widgets) > 0 else "ComfyUI"


async def queue_prompt(workflow: dict[str, Any], client_id: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.comfyui_base_url}/prompt",
            json={"prompt": workflow, "client_id": client_id},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ComfyUIError(f"ComfyUI rejected the workflow: {response.text[:1000]}") from exc
        data = response.json()
    prompt_id = data.get("prompt_id")
    if not prompt_id:
        error = data.get("error") or data.get("node_errors") or data
        raise ComfyUIError(f"ComfyUI did not return a prompt_id: {error}")
    return prompt_id


async def check_comfyui_ready() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.comfyui_base_url}/system_stats")
            response.raise_for_status()
            checkpoints = await get_available_checkpoints(client)
        workflow_exists = Path(settings.comfyui_workflow_path).exists()
        return {
            "available": True,
            "base_url": settings.comfyui_base_url,
            "workflow_path": settings.comfyui_workflow_path,
            "workflow_exists": workflow_exists,
            "checkpoints": checkpoints,
        }
    except httpx.HTTPError as exc:
        return {
            "available": False,
            "base_url": settings.comfyui_base_url,
            "workflow_path": settings.comfyui_workflow_path,
            "workflow_exists": Path(settings.comfyui_workflow_path).exists(),
            "checkpoints": [],
            "error": str(exc),
        }


async def get_available_checkpoints(client: httpx.AsyncClient | None = None) -> list[str]:
    async def _fetch(active_client: httpx.AsyncClient) -> list[str]:
        response = await active_client.get(f"{settings.comfyui_base_url}/object_info/CheckpointLoaderSimple")
        response.raise_for_status()
        data = response.json()
        required = data.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {})
        ckpt_info = required.get("ckpt_name", [])
        if isinstance(ckpt_info, list) and ckpt_info and isinstance(ckpt_info[0], list):
            return [str(item) for item in ckpt_info[0]]
        return []

    if client:
        return await _fetch(client)

    async with httpx.AsyncClient(timeout=10.0) as active_client:
        return await _fetch(active_client)


async def validate_comfyui_workflow(workflow: dict[str, Any]) -> None:
    if not workflow:
        raise ComfyUIError("Workflow has no nodes. ComfyUI requires a graph with at least one output node.")

    output_nodes = {
        node_id: node
        for node_id, node in workflow.items()
        if isinstance(node, dict) and node.get("class_type") in {"SaveImage", "PreviewImage", "SaveImageWebsocket"}
    }
    if not output_nodes:
        raise ComfyUIError(
            "Workflow has no output node. Add a SaveImage node in ComfyUI and export with Save (API Format)."
        )

    checkpoints = await get_available_checkpoints()
    for node_id, node in workflow.items():
        if not isinstance(node, dict):
            raise ComfyUIError(
                "Workflow is not in ComfyUI API format. Restart FastAPI so the UI-to-API converter is active."
            )
        if node.get("class_type") != "CheckpointLoaderSimple":
            continue

        ckpt_name = node.get("inputs", {}).get("ckpt_name")
        if ckpt_name not in checkpoints:
            if checkpoints:
                raise ComfyUIError(
                    f"ComfyUI checkpoint '{ckpt_name}' is not available. "
                    f"Available checkpoints: {', '.join(checkpoints)}"
                )
            raise ComfyUIError(
                f"ComfyUI checkpoint '{ckpt_name}' is not available and ComfyUI reported no checkpoint files. "
                "Put the model file in ComfyUI/models/checkpoints or update the workflow to use an installed checkpoint."
            )


async def wait_for_history(prompt_id: str) -> dict[str, Any]:
    deadline = time.time() + settings.comfyui_timeout_seconds
    async with httpx.AsyncClient(timeout=30.0) as client:
        while time.time() < deadline:
            response = await client.get(f"{settings.comfyui_base_url}/history/{prompt_id}")
            response.raise_for_status()
            history = response.json()
            if isinstance(history, dict) and prompt_id in history:
                result = history[prompt_id]
                if isinstance(result, dict):
                    return result
            await _sleep(1.0)
    raise ComfyUIError("Timed out waiting for ComfyUI image generation")


async def _sleep(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)


async def fetch_first_image(history: dict[str, Any]) -> bytes:
    outputs = history.get("outputs", {})
    async with httpx.AsyncClient(timeout=60.0) as client:
        for node_output in outputs.values():
            if not isinstance(node_output, dict):
                continue
            for image in node_output.get("images", []):
                response = await client.get(
                    f"{settings.comfyui_base_url}/view",
                    params={
                        "filename": image["filename"],
                        "subfolder": image.get("subfolder", ""),
                        "type": image.get("type", "output"),
                    },
                )
                response.raise_for_status()
                return response.content
    raise ComfyUIError("ComfyUI completed but did not return any images")


async def generate_product_image(
    item: InventoryItem,
    prompt: str,
    steps: int,
    cfg: float,
    width: int,
    height: int,
) -> tuple[str, str]:
    status = await check_comfyui_ready()
    if not status["available"]:
        raise ComfyUIError(
            f"ComfyUI is not reachable at {settings.comfyui_base_url}. "
            "Start ComfyUI with: python main.py --listen 0.0.0.0 --port 8188"
        )
    if not status["workflow_exists"]:
        raise ComfyUIError(f"ComfyUI workflow file not found: {settings.comfyui_workflow_path}")

    workflow = apply_flux_product_settings(
        workflow=load_workflow(),
        prompt=prompt,
        steps=steps,
        cfg=cfg,
        width=width,
        height=height,
    )
    await validate_comfyui_workflow(workflow)
    client_id = str(uuid.uuid4())
    prompt_id = await queue_prompt(workflow=workflow, client_id=client_id)
    history = await wait_for_history(prompt_id=prompt_id)
    image_bytes = await fetch_first_image(history)

    output_dir = Path(__file__).resolve().parents[1] / "static" / "product_images"
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{_safe_filename(item.sku)}_{uuid.uuid4().hex[:10]}.png"
    output_path = output_dir / filename
    output_path.write_bytes(image_bytes)
    return f"/api/static/product_images/{filename}", prompt
