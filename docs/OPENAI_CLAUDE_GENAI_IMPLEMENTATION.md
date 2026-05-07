# OpenAI and Claude GenAI Implementation Guide

This guide explains how you could extend or replace the current Ollama-based GenAI implementation with:

- OpenAI models such as ChatGPT through the OpenAI API
- Anthropic Claude models through the Anthropic API

It is written for this project specifically, so the examples are shaped around your current backend structure:

- FastAPI backend
- SQL Server as the source of truth
- ChromaDB as the vector store
- current Ollama service for generation and embeddings

This guide covers:

1. What would change architecturally
2. How OpenAI integration should work
3. How Claude integration should work
4. How embeddings should work for each provider
5. How to refactor the current code into a provider-based design
6. Full example code snippets
7. Recommended migration strategy

## 1. Current State Of This Project

Right now the project uses:

- Ollama for chat generation
- Ollama for embeddings
- ChromaDB for vector retrieval
- SQL Server for business data

The current flow is:

```text
SQL Server
  -> inventory rows
  -> converted into text documents
  -> embedded by Ollama
  -> stored in Chroma

User question
  -> embedded by Ollama
  -> Chroma retrieves relevant docs
  -> prompt is built
  -> Ollama chat model answers
```

If you move to OpenAI or Claude, the retrieval architecture stays mostly the same.

Usually the only parts that change are:

- generation provider
- embedding provider
- provider config and authentication
- error handling
- streaming response parsing

## 2. The Big Design Principle

Do not hardcode your app around one model vendor.

Instead, split the system into responsibilities:

- `generation provider`
- `embedding provider`
- `retrieval layer`
- `application routes`

That means:

- Chroma should not care whether embeddings came from Ollama or OpenAI
- your helpdesk route should not care whether the final answer came from Ollama, ChatGPT, or Claude

This is the key to future-proofing the app.

## 3. Recommended Architecture

The clean design is:

```text
app/services/
  llm_provider.py
  ollama_service.py
  openai_service.py
  anthropic_service.py
  rag_service.py
```

### Responsibilities

- `ollama_service.py`
  Existing local provider for generation and embeddings

- `openai_service.py`
  OpenAI generation and embeddings

- `anthropic_service.py`
  Claude generation

- `llm_provider.py`
  Chooses which provider to use based on config

- `rag_service.py`
  Builds docs, stores vectors, retrieves context, independent of the chat vendor

## 4. Important Provider Difference

This is the most important thing to understand:

### OpenAI

OpenAI can do both:

- generation
- embeddings

### Anthropic Claude

Anthropic’s official embeddings guide says Anthropic does not provide its own embedding model. Their documentation recommends using a separate embeddings provider such as Voyage AI.

So if you choose Claude, your production options are usually:

- Claude for generation + Ollama for embeddings
- Claude for generation + OpenAI embeddings
- Claude for generation + Voyage embeddings

That means Claude integration is normally a two-provider architecture.

## 5. Recommended Paths

### Option A. OpenAI End To End

Use:

- OpenAI for chat generation
- OpenAI for embeddings

This is the simplest hosted-cloud replacement for Ollama.

### Option B. Claude Plus Existing Embeddings

Use:

- Claude for generation
- keep Ollama embeddings
- keep Chroma

This is the least disruptive Claude migration.

### Option C. Claude Plus Voyage Or OpenAI Embeddings

Use:

- Claude for generation
- Voyage or OpenAI for embeddings
- Chroma for vector storage

This is the cleanest fully cloud-based Claude architecture.

## 6. OpenAI API Notes

According to OpenAI’s official docs:

- the `Responses API` is recommended for new generation integrations
- the embeddings endpoint is still used for vector generation

So for OpenAI, your design should typically be:

- generation via `client.responses.create(...)`
- embeddings via `client.embeddings.create(...)`

## 7. Anthropic API Notes

According to Anthropic’s official docs:

- text generation uses the `Messages API`
- Claude conversations are stateless, so you send the necessary conversation history yourself

That fits your current backend well because you already gather recent helpdesk messages before making a model call.

## 8. Environment Variables You Would Add

If you want a provider-agnostic setup, I recommend config like this:

```env
GENERATION_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama

OPENAI_API_KEY=
OPENAI_CHAT_MODEL=
OPENAI_EMBEDDING_MODEL=

ANTHROPIC_API_KEY=
ANTHROPIC_CHAT_MODEL=

VOYAGE_API_KEY=
VOYAGE_EMBEDDING_MODEL=
```

### Example Production Combinations

OpenAI end-to-end:

```env
GENERATION_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-5
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```

Claude plus Ollama embeddings:

```env
GENERATION_PROVIDER=anthropic
EMBEDDING_PROVIDER=ollama
ANTHROPIC_API_KEY=...
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-20250514
OLLAMA_EMBEDDING_MODEL_PRIMARY=embeddinggemma:latest
```

Claude plus Voyage embeddings:

```env
GENERATION_PROVIDER=anthropic
EMBEDDING_PROVIDER=voyage
ANTHROPIC_API_KEY=...
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-20250514
VOYAGE_API_KEY=...
VOYAGE_EMBEDDING_MODEL=voyage-3.5
```

## 9. How To Refactor `config.py`

Below is the kind of config expansion I would recommend.

```python
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    generation_provider: str = "ollama"
    embedding_provider: str = "ollama"

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model_primary: str = "gpt-oss:latest"
    ollama_model_fallbacks: str = "gemma4:latest,qwen3.6:latest"
    ollama_embedding_model_primary: str = "embeddinggemma:latest"
    ollama_embedding_model_fallbacks: str = "qwen3-embedding:latest,nomic-embed-text:latest"

    openai_api_key: str = ""
    openai_chat_model: str = "gpt-5"
    openai_embedding_model: str = "text-embedding-3-large"

    anthropic_api_key: str = ""
    anthropic_chat_model: str = "claude-sonnet-4-20250514"

    voyage_api_key: str = ""
    voyage_embedding_model: str = "voyage-3.5"

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def ollama_priority_models(self) -> List[str]:
        return [
            self.ollama_model_primary,
            *[item.strip() for item in self.ollama_model_fallbacks.split(",") if item.strip()],
        ]

    @property
    def ollama_embedding_priority_models(self) -> List[str]:
        return [
            self.ollama_embedding_model_primary,
            *[item.strip() for item in self.ollama_embedding_model_fallbacks.split(",") if item.strip()],
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

## 10. Provider Interface Design

The cleanest future implementation is to define a common interface.

Example:

```python
from typing import AsyncGenerator, Optional, Protocol


class GenerationProvider(Protocol):
    async def generate_response(self, prompt: str, system: str) -> tuple[str, Optional[str]]:
        ...

    async def generate_response_stream(self, prompt: str, system: str) -> AsyncGenerator[str, None]:
        ...


class EmbeddingProvider(Protocol):
    async def generate_embeddings(self, inputs: list[str]) -> tuple[list[list[float]], Optional[str]]:
        ...
```

Why this helps:

- routes call one common API
- swapping providers becomes configuration, not rewrites
- testing becomes easier

## 11. OpenAI Generation Service Example

For OpenAI generation, I would create:

- `backend/app/services/openai_service.py`

Example:

```python
from __future__ import annotations

from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI

from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)


async def generate_response(prompt: str, system: str) -> tuple[str, Optional[str]]:
    response = await client.responses.create(
        model=settings.openai_chat_model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )

    return response.output_text, settings.openai_chat_model


async def generate_response_stream(prompt: str, system: str) -> AsyncGenerator[str, None]:
    stream = await client.responses.create(
        model=settings.openai_chat_model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        stream=True,
    )

    async for event in stream:
        if event.type == "response.output_text.delta":
            yield event.delta
```

### Why This Matches The Current App

This mirrors your current Ollama service:

- one non-streaming function
- one streaming function
- model name returned for logging and UI

That keeps integration changes small.

## 12. OpenAI Embeddings Service Example

OpenAI embeddings would usually live in the same file or a separate embeddings file.

Example:

```python
from openai import AsyncOpenAI

from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)


async def generate_embeddings(inputs: list[str]) -> tuple[list[list[float]], str]:
    response = await client.embeddings.create(
        model=settings.openai_embedding_model,
        input=inputs,
    )
    embeddings = [item.embedding for item in response.data]
    return embeddings, settings.openai_embedding_model
```

This would plug directly into your existing `rag_service.py` pattern.

## 13. Anthropic Generation Service Example

For Claude generation, I would create:

- `backend/app/services/anthropic_service.py`

Example:

```python
from __future__ import annotations

from typing import AsyncGenerator, Optional

from anthropic import AsyncAnthropic

from app.config import get_settings

settings = get_settings()
client = AsyncAnthropic(api_key=settings.anthropic_api_key)


async def generate_response(prompt: str, system: str) -> tuple[str, Optional[str]]:
    message = await client.messages.create(
        model=settings.anthropic_chat_model,
        system=system,
        max_tokens=1200,
        messages=[
            {"role": "user", "content": prompt},
        ],
    )

    text_parts = [
        block.text
        for block in message.content
        if getattr(block, "type", None) == "text"
    ]
    return "".join(text_parts), settings.anthropic_chat_model


async def generate_response_stream(prompt: str, system: str) -> AsyncGenerator[str, None]:
    async with client.messages.stream(
        model=settings.anthropic_chat_model,
        system=system,
        max_tokens=1200,
        messages=[
            {"role": "user", "content": prompt},
        ],
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

## 14. Claude Embeddings Strategy

Because Anthropic does not provide its own embedding model, you should explicitly choose one of these strategies.

### Strategy 1. Claude + Ollama Embeddings

Best when:

- you already have a working local embedding setup
- you only want to change generation

Pros:

- minimal refactor
- cheapest migration
- keeps existing Chroma indexing logic

Cons:

- mixed local and cloud architecture

### Strategy 2. Claude + OpenAI Embeddings

Best when:

- you want managed cloud embeddings
- you already use OpenAI elsewhere

Pros:

- simple cloud embeddings
- solid developer experience

Cons:

- two external AI vendors

### Strategy 3. Claude + Voyage Embeddings

Best when:

- you want the provider path Anthropic recommends in their official embeddings guide

Pros:

- purpose-built embeddings provider
- good retrieval quality

Cons:

- another vendor to manage

## 15. Voyage Embeddings Example

If you choose Claude plus Voyage embeddings:

```python
import httpx

from app.config import get_settings

settings = get_settings()


async def generate_embeddings(inputs: list[str]) -> tuple[list[list[float]], str]:
    headers = {
        "Authorization": f"Bearer {settings.voyage_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": inputs,
        "model": settings.voyage_embedding_model,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.voyageai.com/v1/embeddings",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    embeddings = [item["embedding"] for item in data["data"]]
    return embeddings, settings.voyage_embedding_model
```

## 16. Provider Router Example

You do not want every route deciding:

- if provider is OpenAI do this
- if provider is Anthropic do that
- if provider is Ollama do something else

That would get messy fast.

Instead, centralize provider selection in one service.

Example:

```python
from app.config import get_settings
from app.services import anthropic_service, ollama_service, openai_service, voyage_service

settings = get_settings()


async def generate_response(prompt: str, system: str):
    if settings.generation_provider == "openai":
        return await openai_service.generate_response(prompt, system)
    if settings.generation_provider == "anthropic":
        return await anthropic_service.generate_response(prompt, system)
    return await ollama_service.generate_response(prompt, system)


async def generate_response_stream(prompt: str, system: str):
    if settings.generation_provider == "openai":
        async for chunk in openai_service.generate_response_stream(prompt, system):
            yield chunk
        return
    if settings.generation_provider == "anthropic":
        async for chunk in anthropic_service.generate_response_stream(prompt, system):
            yield chunk
        return
    async for chunk in ollama_service.generate_response_stream(prompt, system):
        yield chunk


async def generate_embeddings(inputs: list[str]):
    if settings.embedding_provider == "openai":
        return await openai_service.generate_embeddings(inputs)
    if settings.embedding_provider == "voyage":
        return await voyage_service.generate_embeddings(inputs)
    return await ollama_service.generate_embeddings(inputs)
```

This is the single most valuable refactor if you want long-term flexibility.

## 17. How `rag_service.py` Should Change

The good news is:

- almost not at all

Right now `rag_service.py` depends on Ollama-specific embeddings:

```python
from app.services.ollama_service import choose_best_embedding_model, generate_embeddings
```

In a provider-based design, you would change that dependency to:

```python
from app.services.llm_provider import generate_embeddings
```

Then `rag_service.py` becomes embedding-provider agnostic.

That is exactly what you want.

## 18. How `helpdesk.py` Should Change

Today `helpdesk.py` imports from `ollama_service.py`.

Future version:

```python
from app.services.llm_provider import generate_response, generate_response_stream
```

This makes helpdesk independent of whether you are using:

- local Ollama
- OpenAI
- Claude

## 19. Example Refactor Of Your Existing Helpdesk Usage

Current pattern:

```python
answer, source_model = await generate_response(prompt=prompt, system=system)
```

That can stay exactly the same if the provider router exposes the same function signature.

That is ideal because:

- routes do not need large rewrites
- the migration becomes low-risk

## 20. Dependency Changes You Would Need

### For OpenAI

Add:

```txt
openai>=1.0.0
```

### For Anthropic

Add:

```txt
anthropic>=0.34.0
```

### For Voyage

If you use raw HTTP calls, `httpx` is already enough.

If you use the Voyage SDK, add its package instead.

## 21. Example `requirements.txt` Expansion

```txt
fastapi==0.115.9
uvicorn[standard]==0.35.0
sqlalchemy==2.0.43
pyodbc==5.2.0
pydantic-settings==2.10.1
python-jose[cryptography]==3.5.0
passlib[bcrypt]==1.7.4
bcrypt<4.1
httpx==0.28.1
chromadb==1.0.12
openai>=1.0.0
anthropic>=0.34.0
```

## 22. Example OpenAI-Based Helpdesk Flow

```text
User asks question
  -> backend loads recent conversation
  -> backend retrieves Chroma documents
  -> backend builds prompt
  -> OpenAI Responses API generates answer
  -> answer returned to frontend
```

## 23. Example Claude-Based Helpdesk Flow

```text
User asks question
  -> backend loads recent conversation
  -> backend retrieves Chroma documents using Ollama/OpenAI/Voyage embeddings
  -> backend builds prompt
  -> Claude Messages API generates answer
  -> answer returned to frontend
```

## 24. Streaming Differences

Each provider streams differently.

### Ollama

- you currently parse line-delimited JSON

### OpenAI

- official SDK emits event objects

### Anthropic

- official SDK exposes streaming helpers such as `text_stream`

Because of this, your provider service should normalize streaming into:

- plain text chunks yielded one by one

Then the route can keep using the same SSE response logic.

## 25. Error Handling Strategy

Cloud providers fail differently than local Ollama.

You should expect:

- invalid API key
- rate limiting
- model not found
- insufficient quota
- upstream timeout
- temporary network failure

Recommended pattern:

```python
class LLMProviderError(RuntimeError):
    pass
```

Then provider services should raise normalized errors instead of leaking raw SDK exceptions straight into routes.

Example:

```python
try:
    response = await client.responses.create(...)
except Exception as exc:
    raise LLMProviderError(f"OpenAI request failed: {exc}") from exc
```

## 26. Cost Awareness

When moving from Ollama to hosted models, token cost matters.

Main cost drivers:

- prompt size
- retrieved context size
- conversation history size
- model choice
- embedding volume

Ways to reduce cost:

- limit number of retrieved documents
- keep RAG documents concise
- trim conversation history
- batch embeddings
- use smaller models where acceptable

## 27. Security Considerations

When using OpenAI or Anthropic:

- do not hardcode API keys in code
- store keys in environment variables
- avoid logging full user prompts if they contain sensitive data
- understand whether data is leaving your environment
- review data handling requirements for business or compliance needs

This matters more for hosted providers than local Ollama because the prompts are sent to external APIs.

## 28. Recommended Migration Order

If you want the safest path, do it in this order:

### Phase 1. Provider Abstraction

Refactor current code so routes depend on:

- `llm_provider.generate_response`
- `llm_provider.generate_response_stream`
- `llm_provider.generate_embeddings`

Do not change providers yet.

Just make Ollama the first implementation of a common interface.

### Phase 2. Add OpenAI

Add OpenAI provider behind config.

Test:

- non-streaming helpdesk
- streaming helpdesk
- embeddings
- reindex

### Phase 3. Add Claude

Add Anthropic provider for generation.

Keep embeddings on Ollama at first.

That makes debugging easier because only one subsystem changes.

### Phase 4. Optional Cloud Embeddings

If desired, move embeddings from Ollama to:

- OpenAI embeddings
- Voyage embeddings

## 29. Best Practical Recommendation For This Project

If your goal is minimum risk:

### Best OpenAI Path

- OpenAI for generation
- keep Ollama embeddings initially

Why:

- easiest migration
- keeps existing Chroma pipeline stable
- only one major change at a time

### Best Claude Path

- Claude for generation
- keep Ollama embeddings initially

Why:

- Anthropic does not provide native embeddings
- this avoids adding two new cloud services at once

Then later, if needed, move embeddings to OpenAI or Voyage.

## 30. Example Full Provider-Agnostic Service Contract

This is the shape I would aim for long term.

```python
from typing import AsyncGenerator, Optional


async def generate_response(prompt: str, system: str) -> tuple[str, Optional[str]]:
    ...


async def generate_response_stream(prompt: str, system: str) -> AsyncGenerator[str, None]:
    ...


async def generate_embeddings(inputs: list[str]) -> tuple[list[list[float]], Optional[str]]:
    ...
```

Everything else in the app should depend on this contract, not on vendor-specific SDKs.

## 31. Example OpenAI Prompt Call For This App

Here is an example shaped like your helpdesk route.

```python
system = (
    "You are a helpdesk chatbot for an inventory management platform. "
    "Be concise, operationally useful, and safe."
)

prompt = f"""
Current user role: {current_user.role.value}
Conversation history:
{history}

Retrieved knowledge base context:
{rag_context}

User question:
{payload.message}
"""

answer, source_model = await generate_response(prompt=prompt, system=system)
```

The route does not need to know whether `generate_response()` goes to:

- OpenAI
- Claude
- Ollama

That is the whole point of the abstraction.

## 32. Example Future File Layout

```text
backend/app/services/
  anthropic_service.py
  llm_provider.py
  ollama_service.py
  openai_service.py
  rag_service.py
  voyage_service.py
```

### What Each Would Do

- `ollama_service.py`
  Local generation and embeddings

- `openai_service.py`
  OpenAI generation and embeddings

- `anthropic_service.py`
  Claude generation

- `voyage_service.py`
  Voyage embeddings if needed

- `llm_provider.py`
  Select active provider by config

- `rag_service.py`
  Build, store, query vector documents

## 33. Testing Strategy

When adding OpenAI or Claude, test at three levels.

### Unit-Level

- provider function returns text
- provider function raises normalized errors
- embeddings come back in expected list shape

### Integration-Level

- reindex works
- helpdesk returns answer
- streaming route streams chunks

### RAG Behavior

- retrieval still returns useful sources
- response grounding remains good
- source model is correctly reported

## 34. Future-Proof Advice

Do not bake model names into routes.

Do not assume:

- OpenAI model names stay constant forever
- Anthropic model names stay constant forever
- one vendor provides every capability

Instead:

- keep model names in config
- keep provider selection in config
- keep route logic vendor-neutral

## 35. Summary

If you move this project to ChatGPT or Claude, the best design is not to rewrite the app around those APIs directly.

The best design is:

- keep RAG and Chroma separate
- abstract generation and embeddings behind provider services
- use OpenAI Responses API for OpenAI generation
- use Anthropic Messages API for Claude generation
- remember that Claude does not provide native embeddings, so use Ollama, OpenAI, or Voyage for that part

That gives you a flexible system where the business logic stays stable even when the model vendor changes.

## 36. Official References

OpenAI official docs used for this guide:

- Responses API: https://platform.openai.com/docs/api-reference/responses/list?lang=python
- Responses migration guide: https://platform.openai.com/docs/guides/responses-vs-chat-completions
- Streaming responses: https://platform.openai.com/docs/guides/streaming-responses
- Embeddings API: https://platform.openai.com/docs/api-reference/embeddings/create?lang=python

Anthropic official docs used for this guide:

- Messages examples: https://docs.anthropic.com/en/api/messages-examples
- Messages API: https://docs.anthropic.com/en/api/messages
- Models overview: https://docs.anthropic.com/en/docs/models-overview
- Embeddings guide: https://docs.anthropic.com/en/docs/build-with-claude/embeddings
