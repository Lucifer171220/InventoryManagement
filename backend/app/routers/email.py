from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.services.email_service import send_email

router = APIRouter(prefix="/email", tags=["email"])

class EmailRequest(BaseModel):
    subject: str
    recipient: EmailStr
    body: str
    html_body: str | None = None

@router.post("/send")
async def send_email_endpoint(req: EmailRequest):
    try:
        send_email(req.subject, req.recipient, req.body, req.html_body)
        return {"status": "sent"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
