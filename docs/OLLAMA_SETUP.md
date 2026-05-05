# Ollama Integration Guide

This document describes the Ollama integration for AI-powered features in the AI Inventory Manager system.

## Overview

The application uses **Ollama** as the local AI backend for generating intelligent responses, providing features like:
- Natural language queries for inventory data
- AI-assisted helpdesk responses
- Smart inventory recommendations
- Context-aware suggestions

## Architecture

```
Frontend (React)
    ↓
Backend API (FastAPI)
    ↓
Ollama Service (ollama_service.py)
    ↓
Ollama Server (http://127.0.0.1:11434)
    ↓
LLM Models (gpt-oss, gemma4, qwen3.6, etc.)
```

## Configuration

### Environment Variables

Configure Ollama settings in your `.env` file or environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_MODEL_PRIMARY` | `gpt-oss:latest` | Primary model to use |
| `OLLAMA_MODE_FALLBACKS` | `gemma4:latest, qwen3.6:latest` | Fallback models (comma-separated) |

### Model Priority

The system attempts to use models in this order:
1. Primary model (`gpt-oss:latest`)
2. First fallback (`gemma4:latest`)
3. Second fallback (`qwen3.6:latest`)
4. Any other installed model

## Installation

### 1. Install Ollama

**Windows:**
```powershell
winget install Ollama.Ollama
```

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull Required Models

```bash
ollama pull gpt-oss:latest
ollama pull gemma4:latest
ollama pull qwen3.6:latest
```

### 3. Verify Installation

```bash
ollama list
ollama run gpt-oss:latest "Hello, are you working?"
```

## Usage

### Non-Streaming Response

```python
from app.services.ollama_service import generate_response

content, model = await generate_response(
    prompt="What items are low in stock?",
    system="You are an inventory management assistant."
)
```

### Streaming Response

```python
from app.services.ollama_service import generate_response_stream

async def stream_response():
    async for chunk in generate_response_stream(
        prompt="Generate a summary of inventory",
        system="You are a helpful assistant."
    ):
        yield chunk
```

### Model Selection

The system automatically selects the best available model:

```python
from app.services.ollama_service import choose_best_model, get_installed_models

# Get all installed models
models = get_installed_models()

# Choose best available model
best_model = choose_best_model()
```

## API Endpoints Using Ollama

### Inventory Router
- **Location:** `backend/app/routers/inventory.py`
- **Usage:** AI-powered inventory queries and recommendations

### Helpdesk Router
- **Location:** `backend/app/routers/helpdesk.py`
- **Usage:** AI-assisted support ticket responses

## Error Handling

The service handles errors gracefully:

- **No Ollama server:** Returns fallback message indicating AI is unavailable
- **No models installed:** Uses first available model or returns error
- **Timeout:** 160 second timeout for responses
- **HTTP errors:** Caught and converted to user-friendly messages

## Troubleshooting

### Ollama not responding

```bash
# Check if Ollama is running
ollama list

# Restart Ollama service
# Windows: Restart from system tray
# Linux/macOS: ollama serve
```

### Model not found

```bash
# Pull the missing model
ollama pull gpt-oss:latest

# Verify installation
ollama list
```

### Slow responses

- Larger models (70B+) require more GPU/CPU resources
- Consider using smaller models like `gemma4` or `qwen3.6` for faster responses
- Ensure adequate system resources (RAM, GPU memory)

## Performance Considerations

- **Temperature:** Set to 0.2 for more deterministic responses
- **Timeout:** 160 seconds for large model responses
- **Streaming:** Use streaming for better UX on long responses
- **Model size:** Larger models = better quality but slower response times

## Security Notes

- Ollama runs locally (default: `127.0.0.1:11434`)
- No external API calls for AI processing
- All data stays within your infrastructure
- Configure firewall rules if exposing Ollama on network

## References

- [Ollama Documentation](https://ollama.com/)
- [Ollama GitHub](https://github.com/ollama/ollama)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
