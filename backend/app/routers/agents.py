from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.services.agent_service import (
    approve_agent_action,
    reject_agent_action,
    run_agentic_automation,
    run_conversational_agent_workflow,
)
from app.services.ollama_service import choose_best_model, get_installed_models

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentWorkflowRequest(BaseModel):
    message: str = Field(min_length=3, max_length=1000)


@router.get("/status")
def agent_status(_: User = Depends(get_current_user)):
    model = choose_best_model()
    return {
        "ollama_available": model is not None,
        "selected_model": model,
        "installed_models": get_installed_models(),
        "mode": "ollama-assisted" if model else "rule-based fallback",
    }


@router.post("/automation/run")
async def run_automation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await run_agentic_automation(db=db, user_role=current_user.role.value)


@router.post("/workflow/run")
async def run_workflow(
    payload: AgentWorkflowRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await run_conversational_agent_workflow(db=db, user=current_user, message=payload.message)


@router.post("/actions/{action_id}/approve")
def approve_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return approve_agent_action(db=db, user=current_user, action_id=action_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/actions/{action_id}/reject")
def reject_action(
    action_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return reject_agent_action(db=db, action_id=action_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
