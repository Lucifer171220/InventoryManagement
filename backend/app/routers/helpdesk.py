from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json

from app.database import get_db
from app.deps import get_current_user, require_role
from app.models import HelpdeskConversation, HelpdeskMessage, InventoryItem, User
from app.schemas import ChatMessageRequest, ChatMessageResponse
from app.services.ollama_service import generate_response_stream, choose_best_model, generate_response
from app.services.rag_service import (
    RAGServiceError,
    get_rag_status,
    reindex_inventory_items,
    retrieve_inventory_context,
)


router = APIRouter(prefix="/helpdesk", tags=["helpdesk"])


@router.get("/rag/status")
def rag_status(
    _: User = Depends(require_role("manager", "moderator")),
):
    try:
        return get_rag_status()
    except RAGServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/rag/reindex")
async def rag_reindex(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("manager", "moderator")),
):
    try:
        return await reindex_inventory_items(db)
    except RAGServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/chat", response_model=ChatMessageResponse)
async def helpdesk_chat(
    payload: ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Non-streaming chat endpoint (for backward compatibility)"""
    conversation = None
    if payload.conversation_id:
        conversation = (
            db.query(HelpdeskConversation)
            .filter(
                HelpdeskConversation.id == payload.conversation_id,
                HelpdeskConversation.user_id == current_user.id,
            )
            .first()
        )
    if not conversation:
        conversation = HelpdeskConversation(user_id=current_user.id, title="Inventory Helpdesk")
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    item_context = ""
    if payload.sku:
        item = db.query(InventoryItem).filter(InventoryItem.sku == payload.sku).first()
        if item:
            item_context = f"""
Relevant item:
- SKU: {item.sku}
- Name: {item.name}
- Quantity: {item.quantity}
- Reorder level: {item.reorder_level}
- Description: {item.description}
- Category: {item.category}
"""

    rag_context = ""
    retrieved_sources = []
    try:
        rag_context, retrieved_sources, _ = await retrieve_inventory_context(
            question=payload.message,
            sku=payload.sku,
        )
    except RAGServiceError:
        rag_context = ""

    recent_messages = (
        db.query(HelpdeskMessage)
        .filter(HelpdeskMessage.conversation_id == conversation.id)
        .order_by(HelpdeskMessage.created_at.desc())
        .limit(6)
        .all()
    )
    history_lines = []
    for message in reversed(recent_messages):
        history_lines.append(f"{message.role}: {message.content}")

    prompt = f"""
Current user role: {current_user.role.value}
Conversation history:
{chr(10).join(history_lines) if history_lines else "No prior messages."}

{item_context}

Retrieved knowledge base context:
{rag_context or "No retrieved context available."}

User question:
{payload.message}

Provide a helpful helpdesk answer. When the user asks about an item or SKU, summarize the relevant inventory facts first. Prefer retrieved inventory facts over guesses.
"""
    system = (
        "You are a helpdesk chatbot for an inventory management platform. "
        "Be concise, operationally useful, and safe. Mention when a manager or moderator is required."
    )

    # Use non-streaming for the regular endpoint
    answer, source_model = await generate_response(prompt=prompt, system=system)

    db.add(HelpdeskMessage(conversation_id=conversation.id, role="user", content=payload.message))
    db.add(HelpdeskMessage(conversation_id=conversation.id, role="assistant", content=answer))
    db.commit()

    return ChatMessageResponse(
        conversation_id=conversation.id,
        answer=answer,
        source_model=source_model,
        retrieved_sources=retrieved_sources,
    )


@router.post("/chat/stream")
async def helpdesk_chat_stream(
    payload: ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Streaming chat endpoint - streams AI response in real-time"""
    conversation = None
    if payload.conversation_id:
        conversation = (
            db.query(HelpdeskConversation)
            .filter(
                HelpdeskConversation.id == payload.conversation_id,
                HelpdeskConversation.user_id == current_user.id,
            )
            .first()
        )

    if not conversation:
        conversation = HelpdeskConversation(user_id=current_user.id, title="Inventory Helpdesk")
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    item_context = ""
    if payload.sku:
        item = db.query(InventoryItem).filter(InventoryItem.sku == payload.sku).first()
        if item:
            item_context = f"""
Relevant item:
- SKU: {item.sku}
- Name: {item.name}
- Quantity: {item.quantity}
- Reorder level: {item.reorder_level}
- Description: {item.description}
- Category: {item.category}
"""

    rag_context = ""
    retrieved_sources = []
    try:
        rag_context, retrieved_sources, _ = await retrieve_inventory_context(
            question=payload.message,
            sku=payload.sku,
        )
    except RAGServiceError:
        rag_context = ""

    recent_messages = (
        db.query(HelpdeskMessage)
        .filter(HelpdeskMessage.conversation_id == conversation.id)
        .order_by(HelpdeskMessage.created_at.desc())
        .limit(6)
        .all()
    )
    history_lines = []
    for message in reversed(recent_messages):
        history_lines.append(f"{message.role}: {message.content}")

    prompt = f"""
Current user role: {current_user.role.value}
Conversation history:
{chr(10).join(history_lines) if history_lines else "No prior messages."}

{item_context}

Retrieved knowledge base context:
{rag_context or "No retrieved context available."}

User question:
{payload.message}

Provide a helpful helpdesk answer. When the user asks about an item or SKU, summarize the relevant inventory facts first. Prefer retrieved inventory facts over guesses.
"""
    system = (
        "You are a helpdesk chatbot for an inventory management platform. "
        "Be concise, operationally useful, and safe. Mention when a manager or moderator is required."
    )

    source_model = choose_best_model()

    async def event_generator():
        full_answer = ""
        async for chunk in generate_response_stream(prompt=prompt, system=system):
            # Skip the model info appended at the end
            if chunk.startswith("\n[model:"):
                continue
            full_answer += chunk
            # Send SSE formatted data
            yield f"data: {json.dumps({'chunk': chunk, 'conversation_id': conversation.id})}\n\n"

        # Save messages after stream completes
        db.add(HelpdeskMessage(conversation_id=conversation.id, role="user", content=payload.message))
        db.add(HelpdeskMessage(conversation_id=conversation.id, role="assistant", content=full_answer))
        db.commit()

        # Send final event with full response
        yield f"data: {json.dumps({'done': True, 'conversation_id': conversation.id, 'source_model': source_model, 'retrieved_sources': retrieved_sources})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Conversation-Id": str(conversation.id),
        }
    )
