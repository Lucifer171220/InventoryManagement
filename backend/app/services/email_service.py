import smtplib
from email.message import EmailMessage
from typing import Optional

from app.config import get_settings

settings = get_settings()


def send_email(
    subject: str,
    recipient: str,
    body: str,
    html_body: Optional[str] = None,
) -> None:
    """Send a simple email via the configured SMTP server.

    The SMTP configuration is defined in ``app.config`` (host, port, user, password).
    If ``smtp_user`` is empty, the connection is made without authentication.
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user or f"no-reply@{settings.app_name.replace(' ', '').lower()}.local"
    msg["To"] = recipient
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    # Establish connection
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_user:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
