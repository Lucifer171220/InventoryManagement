from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, List
from app.services.chart_service import generate_chart

router = APIRouter(prefix="/chart", tags=["chart"])

class ChartRequest(BaseModel):
    chart_type: Literal["line", "bar", "pie"]
    labels: List[str] = Field(..., description="Label list (at least one)")
    values: List[float] = Field(..., description="Value list (matching labels)")
    title: str | None = None

@router.post("/generate")
async def generate_chart_endpoint(req: ChartRequest):
    if len(req.labels) != len(req.values):
        raise HTTPException(status_code=400, detail="labels and values must be the same length")
    try:
        path = generate_chart(req.chart_type, req.labels, req.values, req.title or "")
        return {"chart_path": path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
