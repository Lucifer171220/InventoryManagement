import json
import os
import shutil
import subprocess
from typing import Optional, AsyncGenerator

import httpx
from app.config import get_settings

settings = get_settings()


def locate_ollama_executable() -> Optional[str]:
    candidates = [
        shutil.which("ollama"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe"),
        os.path.join("C:\\", "Program Files", "Ollama", "ollama.exe"),
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def get_installed_models() -> list[str]:
    ollama_path = locate_ollama_executable()
    if not ollama_path:
        return []
    try:
        result = subprocess.run(
            [ollama_path, "list"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
    except (subprocess.SubprocessError, OSError):
        return []

    models = []
    for line in result.stdout.splitlines()[1:]:
        if not line.strip():
            continue
        parts = line.split()
        if parts:
            models.append(parts[0])
    return models


def choose_best_model() -> Optional[str]:
    installed = get_installed_models()
    if not installed:
        return None
    for candidate in settings.ollama_priority_models:
        if candidate in installed:
            return candidate
    return installed[0]


# ── Non-streaming ────────────────────────────────────────────────────────────

async def generate_response(prompt: str, system: str) -> tuple[str, Optional[str]]:
    """Generate a full response (non-streaming).
    Retained for compatibility with existing callers.
    """
    model = choose_best_model()
    if not model:
        return (
            "Local AI is currently unavailable. The system can still answer using inventory data, "
            "but no Ollama model was detected.",
            None,
        )

    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "options": {"temperature": 0.2},
    }

    try:
        async with httpx.AsyncClient(timeout=160.0) as client:
            response = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"], model
    except (httpx.HTTPError, KeyError, json.JSONDecodeError):
        return (
            "The AI helper could not reach Ollama right now. Inventory data is still available through the API.",
            model,
        )


# ── Streaming ─────────────────────────────────────────────────────────────────

async def generate_response_stream(prompt: str, system: str) -> AsyncGenerator[str, None]:
    """Generate a response from Ollama using streaming.
    Yields chunks of text as they become available.
    """
    model = choose_best_model()
    if not model:
        yield "Local AI is currently unavailable. No Ollama model detected."
        return

    payload = {
        "model": model,
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "options": {"temperature": 0.2},
    }

    try:
        async with httpx.AsyncClient(timeout=160.0) as client:
            async with client.stream("POST", f"{settings.ollama_base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]
                    except json.JSONDecodeError:
                        continue
        yield f"\n[model: {model}]"
    except (httpx.HTTPError, OSError):
        yield "The AI helper could not reach Ollama right now."