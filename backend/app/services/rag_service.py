from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.models import InventoryItem, WarehouseInventory
from app.services.ollama_service import choose_best_embedding_model, generate_embeddings

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
except ImportError:  # pragma: no cover - handled at runtime
    chromadb = None
    ChromaSettings = None


settings = get_settings()
EMBEDDING_BATCH_SIZE = 32
logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)


class RAGServiceError(RuntimeError):
    pass


def _require_chromadb():
    if chromadb is None:
        raise RAGServiceError(
            "ChromaDB is not installed. Add the backend dependencies and restart the API."
        )
    return chromadb


def _persist_directory() -> str:
    path = Path(settings.chroma_persist_directory)
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def get_inventory_collection():
    _require_chromadb()
    client = chromadb.PersistentClient(
        path=_persist_directory(),
        settings=ChromaSettings(anonymized_telemetry=False),
    )
    return client.get_or_create_collection(
        name=settings.chroma_inventory_collection,
        metadata={"hnsw:space": "cosine"},
    )


def _warehouse_summary(item: InventoryItem) -> str:
    if not item.warehouse_inventory:
        return "No warehouse allocation recorded."
    parts = [
        f"{stock.warehouse.name if stock.warehouse else 'Unknown'}={stock.quantity}"
        for stock in item.warehouse_inventory
    ]
    return ", ".join(parts)


def build_inventory_document(item: InventoryItem) -> tuple[str, str, dict[str, Any]]:
    supplier_name = item.supplier.name if item.supplier else "Not assigned"
    content = "\n".join(
        [
            f"SKU: {item.sku}",
            f"Name: {item.name}",
            f"Category: {item.category}",
            f"Subcategory: {item.subcategory or ''}",
            f"Brand: {item.brand or ''}",
            f"Description: {item.description or ''}",
            f"Quantity: {item.quantity}",
            f"Reorder level: {item.reorder_level}",
            f"Reorder quantity: {item.reorder_quantity}",
            f"Supplier: {supplier_name}",
            f"Warehouse stock: {_warehouse_summary(item)}",
        ]
    )
    metadata = {
        "source_type": "inventory_item",
        "item_id": item.id,
        "sku": item.sku,
        "name": item.name,
        "category": item.category,
        "brand": item.brand or "",
        "supplier": supplier_name,
        "quantity": item.quantity,
        "reorder_level": item.reorder_level,
        "is_active": item.is_active,
    }
    return f"inventory-item-{item.id}", content, metadata


async def _embed_batches(documents: list[str]) -> tuple[list[list[float]], Optional[str]]:
    all_embeddings: list[list[float]] = []
    embedding_model: Optional[str] = None

    for start in range(0, len(documents), EMBEDDING_BATCH_SIZE):
        batch = documents[start:start + EMBEDDING_BATCH_SIZE]
        embeddings, model = await generate_embeddings(batch)
        if not embeddings:
            return [], model
        embedding_model = model
        all_embeddings.extend(embeddings)

    return all_embeddings, embedding_model


def _load_inventory_item(db: Session, item_id: int) -> Optional[InventoryItem]:
    return (
        db.query(InventoryItem)
        .options(
            joinedload(InventoryItem.supplier),
            joinedload(InventoryItem.warehouse_inventory).joinedload(WarehouseInventory.warehouse),
        )
        .filter(InventoryItem.id == item_id)
        .first()
    )


async def reindex_inventory_items(db: Session) -> dict[str, Any]:
    collection = get_inventory_collection()
    items = (
        db.query(InventoryItem)
        .options(
            joinedload(InventoryItem.supplier),
            joinedload(InventoryItem.warehouse_inventory).joinedload(WarehouseInventory.warehouse),
        )
        .filter(InventoryItem.is_active == True)
        .all()
    )

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []

    for item in items:
        doc_id, document, metadata = build_inventory_document(item)
        ids.append(doc_id)
        documents.append(document)
        metadatas.append(metadata)

    if not documents:
        return {
            "collection": settings.chroma_inventory_collection,
            "embedding_model": choose_best_embedding_model(),
            "indexed": 0,
        }

    embeddings, embedding_model = await _embed_batches(documents)
    if not embeddings:
        raise RAGServiceError(
            "No Ollama embedding model is available. Pull an embedding model such as "
            f"{settings.ollama_embedding_model_primary} and try again."
        )

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )
    return {
        "collection": settings.chroma_inventory_collection,
        "embedding_model": embedding_model,
        "indexed": len(ids),
    }


async def upsert_inventory_item_by_id(db: Session, item_id: int) -> dict[str, Any]:
    item = _load_inventory_item(db, item_id)
    if not item or not item.is_active:
        await delete_inventory_item_by_id(item_id)
        return {"item_id": item_id, "indexed": False, "deleted": True}

    collection = get_inventory_collection()
    doc_id, document, metadata = build_inventory_document(item)
    embeddings, embedding_model = await _embed_batches([document])
    if not embeddings:
        raise RAGServiceError(
            "No Ollama embedding model is available. Pull an embedding model such as "
            f"{settings.ollama_embedding_model_primary} and try again."
        )

    collection.upsert(
        ids=[doc_id],
        documents=[document],
        metadatas=[metadata],
        embeddings=embeddings,
    )
    return {
        "item_id": item.id,
        "sku": item.sku,
        "embedding_model": embedding_model,
        "indexed": True,
    }


async def delete_inventory_item_by_id(item_id: int) -> None:
    collection = get_inventory_collection()
    collection.delete(ids=[f"inventory-item-{item_id}"])


async def retrieve_inventory_context(
    question: str,
    sku: Optional[str] = None,
    limit: int = 4,
) -> tuple[str, list[dict[str, Any]], Optional[str]]:
    collection = get_inventory_collection()
    embeddings, embedding_model = await generate_embeddings([question])
    if not embeddings:
        return "", [], None
    if collection.count() == 0:
        return "", [], embedding_model

    query_kwargs: dict[str, Any] = {
        "query_embeddings": embeddings,
        "n_results": limit,
        "include": ["documents", "metadatas", "distances"],
    }
    if sku:
        query_kwargs["where"] = {"sku": sku}

    results = collection.query(**query_kwargs)
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    sources: list[dict[str, Any]] = []
    context_blocks: list[str] = []
    for index, document in enumerate(documents):
        metadata = metadatas[index] if index < len(metadatas) else {}
        distance = distances[index] if index < len(distances) else None
        sources.append(
            {
                "sku": metadata.get("sku"),
                "name": metadata.get("name"),
                "category": metadata.get("category"),
                "distance": distance,
            }
        )
        context_blocks.append(
            f"Source {index + 1}:\n{document}"
        )

    return "\n\n".join(context_blocks), sources, embedding_model


def get_rag_status() -> dict[str, Any]:
    collection = get_inventory_collection()
    return {
        "collection": settings.chroma_inventory_collection,
        "persist_directory": _persist_directory(),
        "document_count": collection.count(),
        "embedding_model": choose_best_embedding_model(),
    }
