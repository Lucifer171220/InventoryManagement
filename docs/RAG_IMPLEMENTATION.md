# RAG Implementation Guide

This document explains, from the ground up, how Retrieval-Augmented Generation (RAG) works in this project, why ChromaDB is used, how Ollama embeddings fit in, and how the current implementation is wired together.

If you are new to RAG, start with these sections in order:

1. What RAG Is
2. Why We Need Embeddings
3. What ChromaDB Does
4. How This Project Implements RAG
5. End-to-End Request Flow

## 1. What RAG Is

RAG stands for Retrieval-Augmented Generation.

It means:

- `Retrieval`: first find relevant knowledge from your own data
- `Augmented`: attach that knowledge to the model prompt
- `Generation`: let the model answer using that retrieved context

Without RAG, an LLM answers from:

- its training data
- whatever you manually put into the prompt

With RAG, an LLM answers from:

- its training data
- the current user question
- relevant data retrieved from your own system at runtime

In this project, your own system data is inventory data stored in SQL Server.

## 2. Why We Need RAG In This App

Your app already had:

- a database with inventory, suppliers, warehouses, and related data
- an Ollama chat integration for answering questions

But before this RAG implementation, the app was not doing true retrieval.

It only did limited prompt injection:

- if the user passed a specific `sku`, the backend fetched that one item
- then the backend pasted that item into the prompt

That is useful, but it is not full RAG.

Problems with the old approach:

- it only worked well if the caller already knew the exact SKU
- it could not search semantically across multiple products
- it could not automatically discover the most relevant items from natural language
- the model had no retrieval memory outside the exact item that was manually fetched

RAG fixes that by letting the app search for relevant inventory records using embeddings.

## 3. Core Idea Behind Embeddings

An embedding is a numeric vector representation of text.

Instead of storing only plain text like:

```text
SKU: ABC-123
Name: Waterproof Travel Bag
Category: luggage
Description: Durable waterproof bag for weekend travel
```

we also convert that text into a vector such as:

```text
[0.012, -0.382, 0.117, ...]
```

That vector captures meaning.

The important property is this:

- similar texts produce similar vectors
- unrelated texts produce less similar vectors

So when a user asks:

```text
show me waterproof travel products
```

we do not need an exact SQL `LIKE '%waterproof travel%'`.

Instead:

1. convert the question into an embedding
2. compare that embedding with stored document embeddings
3. retrieve the closest matches

That is semantic search.

## 4. Why ChromaDB Is Used

ChromaDB is a vector database.

A vector database stores:

- document IDs
- document text
- metadata
- embeddings

and supports fast similarity search.

In this project, Chroma is the retrieval engine.

We still keep SQL Server as the source of truth for transactional data.

That means:

- SQL Server stores the real inventory data
- Chroma stores searchable vector copies of inventory documents

This is a common production pattern.

### What Chroma Stores Here

For each inventory item, Chroma stores:

- `id`
- `document`
- `metadata`
- `embedding`

Example conceptually:

```json
{
  "id": "inventory-item-12",
  "document": "SKU: BAG-001\nName: Waterproof Travel Bag\nCategory: luggage\nDescription: Durable waterproof bag...",
  "metadata": {
    "source_type": "inventory_item",
    "item_id": 12,
    "sku": "BAG-001",
    "name": "Waterproof Travel Bag",
    "category": "luggage"
  },
  "embedding": [ ... vector numbers ... ]
}
```

### Why Not Store Embeddings Directly In SQL Server

You can do that, but Chroma gives us a simpler first implementation because it already handles:

- vector persistence
- collection management
- similarity search
- document plus metadata storage

That let us add RAG quickly without redesigning the main database.

## 5. Why We Use a Separate Ollama Embedding Model

Chat models and embedding models are different tools.

A chat model is optimized for:

- answering questions
- following instructions
- generating text

An embedding model is optimized for:

- turning text into semantic vectors
- making similarity search accurate

That is why the code now separates:

- chat models for answering
- embedding models for retrieval

### Current Embedding Model Choice

The app now prefers:

- `embeddinggemma:latest`

Fallbacks are configured in case you later install more options:

- `qwen3-embedding:latest`
- `nomic-embed-text:latest`
- `mxbai-embed-large:latest`
- `all-minilm:latest`

These settings live in:

- [app/config.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/config.py:1)

## 6. Files Added Or Changed For RAG

### Main New File

- [app/services/rag_service.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/services/rag_service.py:1)

This is the heart of the RAG implementation.

It is responsible for:

- creating and opening the Chroma collection
- converting inventory rows into text documents
- generating embeddings through Ollama
- indexing documents into Chroma
- retrieving relevant context for user questions
- deleting vector documents when inventory items are deactivated

### Updated Files

- [app/services/ollama_service.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/services/ollama_service.py:1)
- [app/routers/helpdesk.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/routers/helpdesk.py:1)
- [app/routers/inventory.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/routers/inventory.py:1)
- [app/config.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/config.py:1)
- [app/schemas.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/schemas.py:1)
- [requirements.txt](E:/2026-04-23-i-have-to-create-a-regarding/backend/requirements.txt:1)
- [backend/.env.example](E:/2026-04-23-i-have-to-create-a-regarding/backend/.env.example:1)

## 7. High-Level Architecture

The architecture is:

```text
SQL Server
  -> source of truth for inventory data

InventoryItem rows
  -> converted into RAG documents

Ollama embedding model
  -> converts documents and questions into vectors

ChromaDB
  -> stores vectors and supports nearest-neighbor retrieval

Helpdesk route
  -> retrieves relevant docs from Chroma
  -> injects them into the LLM prompt
  -> Ollama chat model generates final answer
```

## 8. How Inventory Data Becomes RAG Data

The system does not embed raw database rows directly.

Instead, it builds a readable text document for each inventory item.

That logic is in:

- `build_inventory_document()` in [app/services/rag_service.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/services/rag_service.py:1)

### What Goes Into A Document

For each inventory item, the document includes:

- SKU
- name
- category
- subcategory
- brand
- description
- quantity
- reorder level
- reorder quantity
- supplier name
- warehouse stock summary

Example:

```text
SKU: BAG-001
Name: Waterproof Travel Bag
Category: luggage
Subcategory: weekend-bags
Brand: SkyTrip
Description: Durable waterproof bag for short trips
Quantity: 12
Reorder level: 20
Reorder quantity: 50
Supplier: Travel Goods Ltd
Warehouse stock: Main=8, South=4
```

This is important because embeddings work on text, not directly on database columns.

## 9. Metadata Stored Alongside Documents

Each document also gets metadata.

Metadata is structured data attached to the document that helps filtering and traceability.

Example metadata:

```json
{
  "source_type": "inventory_item",
  "item_id": 12,
  "sku": "BAG-001",
  "name": "Waterproof Travel Bag",
  "category": "luggage",
  "brand": "SkyTrip",
  "supplier": "Travel Goods Ltd",
  "quantity": 12,
  "reorder_level": 20,
  "is_active": true
}
```

Why metadata matters:

- you can filter by `sku`
- you can return useful source references
- you can later filter by category, supplier, or active status

## 10. Chroma Collection In This Project

The project creates a persistent Chroma collection named:

- `inventory_items`

The collection is stored on disk under:

- `backend/chroma`

The values come from config:

- `CHROMA_PERSIST_DIRECTORY`
- `CHROMA_INVENTORY_COLLECTION`

This means Chroma data survives app restarts.

It is not in-memory only.

## 11. End-to-End Indexing Flow

There are two ways indexing happens in this project.

### A. Full Reindex

Used when:

- first setting up the system
- rebuilding all vector data
- fixing drift between SQL data and Chroma

The route is:

- `POST /api/helpdesk/rag/reindex`

What it does:

1. fetch all active inventory items from SQL Server
2. eager-load supplier and warehouse data
3. build a text document for each item
4. generate embeddings in batches
5. upsert them into Chroma

### B. Incremental Sync

Used during normal CRUD operations.

When inventory changes:

- create item -> upsert into Chroma
- update item -> upsert into Chroma
- soft delete item -> remove from Chroma

This logic is wired into:

- [app/routers/inventory.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/routers/inventory.py:1)

That means you usually do not need to run a full reindex after every small change.

## 12. Why `upsert` Is Used

Chroma supports `upsert`.

`upsert` means:

- insert the document if it does not exist
- update it if it already exists

This is better than manually checking:

- does this item exist in Chroma?
- if yes, delete it
- then insert again

With `upsert`, the synchronization logic stays simple.

## 13. How Retrieval Works At Runtime

The main retrieval function is:

- `retrieve_inventory_context()` in [app/services/rag_service.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/services/rag_service.py:1)

When a helpdesk question arrives:

1. the question text is embedded using the Ollama embedding model
2. Chroma searches for the nearest inventory vectors
3. top matching documents are returned
4. those documents are formatted as prompt context
5. the chat model gets that context and answers

### If The Request Includes A SKU

If the user sends a `sku`, retrieval can be filtered using Chroma metadata:

- `where={"sku": sku}`

That narrows the search to that exact item in the vector store.

This gives you:

- exact item focus when the SKU is known
- semantic retrieval when the question is more natural-language or broader

## 14. How Helpdesk Uses RAG

The helpdesk route now does two context-building steps.

### Step 1. Structured Item Context

If `payload.sku` is present:

- query SQL Server for that item
- build a small factual item summary

### Step 2. Retrieved RAG Context

Regardless of whether `sku` exists:

- embed the user question
- retrieve relevant inventory documents from Chroma
- append those sources to the prompt

So the prompt now contains:

- role information
- recent conversation history
- direct SQL item context if SKU was provided
- Chroma-retrieved semantic context
- the user’s question

This makes the answer more accurate and more grounded in your data.

## 15. Why We Keep SQL Server And Chroma Together

This project is using a hybrid architecture.

### SQL Server Is Best For

- source of truth
- exact rows
- transactions
- updates
- reporting
- strict filtering

### Chroma Is Best For

- semantic search
- nearest-neighbor vector retrieval
- natural language matching

They are complementary, not competing systems.

## 16. Batching And Why It Matters

Embeddings are generated in batches in:

- `_embed_batches()`

Why batching is useful:

- fewer HTTP calls to Ollama
- better throughput
- easier indexing of many rows

Current batch size:

- `32`

This is a practical default for a local setup.

If you later index thousands of rows, batching becomes more important.

## 17. RAG Endpoints Added

### `GET /api/helpdesk/rag/status`

Purpose:

- verify that Chroma is available
- see collection name
- see persistence directory
- see current document count
- see active embedding model

Example response:

```json
{
  "collection": "inventory_items",
  "persist_directory": "E:\\...\\backend\\chroma",
  "document_count": 3,
  "embedding_model": "embeddinggemma:latest"
}
```

### `POST /api/helpdesk/rag/reindex`

Purpose:

- rebuild the vector index from current SQL data

Example response:

```json
{
  "collection": "inventory_items",
  "embedding_model": "embeddinggemma:latest",
  "indexed": 3
}
```

## 18. Response Schema Changes

The helpdesk response now includes:

- `source_model`
- `retrieved_sources`

This is useful because the frontend can show:

- which chat model answered
- which inventory sources were retrieved

That makes the system more explainable.

## 19. What `retrieved_sources` Contains

Each source entry contains summary metadata such as:

- `sku`
- `name`
- `category`
- `distance`

`distance` comes from vector similarity search.

General idea:

- lower distance usually means closer semantic match
- higher distance usually means weaker match

This lets you inspect what the retriever thought was relevant.

## 20. How Chroma Search Works Conceptually

When Chroma receives a query embedding, it tries to find vectors that are closest in vector space.

The project configures the collection with:

- cosine similarity space

That is done using collection metadata:

```python
metadata={"hnsw:space": "cosine"}
```

Cosine similarity is commonly used for text embeddings because it compares direction of vectors rather than only raw magnitude.

## 21. Why PersistentClient Is Used

Chroma supports a persistent local database mode.

We use:

- `chromadb.PersistentClient(...)`

This means:

- vectors are written to disk
- the app can stop and restart without losing the index

Without persistence, the RAG index would disappear on every restart.

## 22. What Happens If The Embedding Model Is Missing

If no Ollama embedding model is installed:

- the app cannot generate embeddings
- indexing will fail
- retrieval returns no semantic context

The code handles this by:

- checking available Ollama models
- selecting the best embedding model from configured priorities
- raising a clear `RAGServiceError` if no embedding model is available

That is better than silently pretending RAG is working.

## 23. Why `embeddinggemma:latest` Was Installed

This environment now has:

- `embeddinggemma:latest`

That means:

- document indexing works
- question embedding works
- Chroma retrieval works

This is the minimum required runtime condition for the RAG system.

## 24. What Was Reindexed

A full reindex was run against your current inventory data.

At the time of writing:

- collection document count: `3`

That means three active inventory documents were pushed into Chroma.

## 25. A Real Example Query Flow

Suppose the user asks:

```text
Which waterproof bags are low on stock?
```

### Step A. User Question

The question reaches `/api/helpdesk/chat`.

### Step B. Embedding Generation

The system sends the question text to Ollama’s embedding endpoint:

- `/api/embed`

### Step C. Chroma Query

Chroma compares the question embedding to stored inventory document embeddings.

It may retrieve documents like:

- Waterproof Travel Bag
- Weatherproof Laptop Backpack
- Outdoor Dry Pack

### Step D. Prompt Augmentation

The retrieved documents are added to the prompt as context.

### Step E. Final Generation

The chat model answers using:

- the user question
- conversation history
- retrieved inventory context

The response is better than a plain LLM guess because it is grounded in actual inventory data.

## 26. Why This Is Better Than Only SQL Search

SQL search is still excellent for exact structured queries.

Examples:

- find SKU `BAG-001`
- show items with `quantity < reorder_level`
- list all items in category `luggage`

But semantic search helps when the user asks fuzzy questions like:

- show durable travel products
- find items similar to waterproof weekend bags
- what stock seems risky for outdoor gear

Those are harder to answer with only exact SQL matching.

## 27. When SQL Is Still Better Than RAG

RAG should not replace all structured querying.

SQL is better when:

- exact numeric filtering matters
- strict aggregations matter
- reports need deterministic results
- financial or operational calculations are required

Best practice is:

- SQL for precise facts
- vector retrieval for semantic discovery
- LLM for explanation and synthesis

This project is already moving in that direction.

## 28. Limitations Of The Current Implementation

The current implementation is good and working, but it is still a first-generation RAG layer.

Current limitations:

- only `InventoryItem` documents are indexed
- supplier notes, purchase order history, and sales context are not yet embedded
- retrieval is limited to a small top-k set
- there is no reranking model
- there is no chunking because each inventory item is already small
- there is no confidence threshold beyond distance inspection

## 29. Good Next Improvements

If you want to make this RAG system stronger, the next steps I recommend are:

1. Index suppliers as separate document types
2. Index purchase-order summaries and sales summaries
3. Add hybrid retrieval: SQL filters plus Chroma search
4. Add source citations in the frontend UI
5. Add scheduled background reindexing
6. Add relevance thresholds to skip weak matches
7. Add tests for indexing and retrieval behavior

## 30. Why We Did Not Chunk Documents Yet

In many RAG systems, large documents are broken into chunks.

Example:

- PDFs
- manuals
- policies
- long articles

That is called chunking.

We did not need chunking yet because each inventory item is already short and naturally self-contained.

One item equals one document is a good first design here.

## 31. How To Explain Chroma In Simple Words

If you want the simplest mental model:

- SQL Server is your official filing cabinet
- Chroma is your semantic lookup index
- Ollama embedding model is the machine that turns text into searchable meaning vectors
- Ollama chat model is the assistant that writes the final answer

So:

- SQL stores facts
- Chroma finds relevant facts
- the LLM explains those facts

## 32. Operational Checklist

For RAG to work correctly, all of these must be true:

1. SQL Server must be reachable
2. Ollama server must be running on `http://127.0.0.1:11434`
3. An embedding model must be installed
4. ChromaDB Python package must be installed
5. The Chroma persist directory must be writable
6. The inventory collection must contain documents

If one of these fails, retrieval quality or indexing will fail.

## 33. Troubleshooting

### Problem: `embedding_model` is `None`

Cause:

- no Ollama embedding model is installed

Fix:

- install `embeddinggemma:latest`

### Problem: document count is `0`

Cause:

- no reindex has run yet
- or there are no active inventory items

Fix:

- call `POST /api/helpdesk/rag/reindex`

### Problem: answers are generic

Cause:

- weak retrieval
- too little inventory data in documents
- no relevant documents found

Fix:

- inspect `retrieved_sources`
- improve document text
- add more metadata and more document types

### Problem: Chroma exists but retrieval still feels weak

Cause:

- vector search is only as good as the document text and embedding quality

Fix:

- enrich documents with better descriptive text
- add more inventory context
- consider hybrid SQL + vector search

## 34. Current Config Values To Know

The RAG-related settings are:

- `OLLAMA_BASE_URL`
- `OLLAMA_EMBEDDING_MODEL_PRIMARY`
- `OLLAMA_EMBEDDING_MODEL_FALLBACKS`
- `CHROMA_PERSIST_DIRECTORY`
- `CHROMA_INVENTORY_COLLECTION`

These are defined in:

- [app/config.py](E:/2026-04-23-i-have-to-create-a-regarding/backend/app/config.py:1)
- [backend/.env.example](E:/2026-04-23-i-have-to-create-a-regarding/backend/.env.example:1)

## 35. What Was Implemented In Plain English

The final implementation does all of this:

- installs and enables ChromaDB
- creates a local persistent vector collection
- converts inventory rows into text documents
- embeds those documents using Ollama embedding models
- stores vectors and metadata in Chroma
- retrieves relevant documents during helpdesk chat
- injects retrieved context into the final LLM prompt
- exposes status and reindex endpoints
- keeps Chroma updated when inventory items are created, updated, or deleted

That is a real RAG implementation.

## 36. Short Summary

If you remember only one thing, remember this:

RAG in this project works because we copy meaningful inventory text into Chroma, embed it with Ollama, retrieve the closest matches for a user question, and feed those matches back into the chat model before it answers.

That is the whole system in one sentence.
