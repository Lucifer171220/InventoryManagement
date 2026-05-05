from contextlib import asynccontextmanager
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import User, UserRole
from app.routers import (
    agents,
    audit,
    auth,
    bulk_operations,
    chart,
    customers,
    dashboard,
    email,
    helpdesk,
    inventory,
    notifications,
    purchase_orders,
    reports,
    sales,
    suppliers,
    users,
    warehouses,
)
from app.security import get_password_hash

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

settings = get_settings()


def seed_users() -> None:
    if not settings.seed_default_users:
        return
    defaults = [
        ("manager@inventory.local", "Platform Manager", UserRole.MANAGER),
        ("moderator@inventory.local", "Operations Moderator", UserRole.MODERATOR),
        ("user@inventory.local", "Inventory User", UserRole.USER),
    ]
    db = SessionLocal()
    try:
        for email, full_name, role in defaults:
            exists = db.query(User).filter(User.email == email).first()
            if exists:
                continue
            db.add(
                User(
                    email=email,
                    full_name=full_name,
                    hashed_password=get_password_hash("ChangeMe123!"),
                    role=role,
                )
            )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_users()
    yield


from fastapi.staticfiles import StaticFiles

app = FastAPI(title=settings.app_name, lifespan=lifespan)
# Serve static files (e.g., generated chart images)
import os
app.mount("/api/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# Custom middleware to handle CORS headers on all responses (including errors and redirects)
# This middleware must be added BEFORE the CORSMiddleware
@app.middleware("http")
async def add_cors_headers(request, call_next):
    origin = request.headers.get("origin", "")
    # Check if the origin is in allowed origins
    allowed_origin = None
    for allowed in settings.allowed_origins:
        if origin == allowed or allowed == "*":
            allowed_origin = origin if allowed != "*" else "*"
            break
    
    # Handle preflight OPTIONS request
    if request.method == "OPTIONS":
        from starlette.responses import Response
        response = Response(status_code=200)
        if allowed_origin:
            response.headers["Access-Control-Allow-Origin"] = allowed_origin
        else:
            response.headers["Access-Control-Allow-Origin"] = settings.allowed_origins[0] if settings.allowed_origins else "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    
    try:
        response = await call_next(request)
    except Exception as exc:
        # Even if an exception occurs, we need to return a response with CORS headers
        from starlette.responses import JSONResponse
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error"},
        )
    
    # Add CORS headers to all responses
    if allowed_origin:
        response.headers["Access-Control-Allow-Origin"] = allowed_origin
    else:
        response.headers["Access-Control-Allow-Origin"] = settings.allowed_origins[0] if settings.allowed_origins else "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(users.router, prefix=settings.api_prefix)
app.include_router(inventory.router, prefix=settings.api_prefix)
app.include_router(helpdesk.router, prefix=settings.api_prefix)
app.include_router(email.router, prefix=settings.api_prefix)
app.include_router(chart.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
app.include_router(customers.router, prefix=settings.api_prefix)
app.include_router(suppliers.router, prefix=settings.api_prefix)
app.include_router(purchase_orders.router, prefix=settings.api_prefix)
app.include_router(warehouses.router, prefix=settings.api_prefix)
app.include_router(reports.router, prefix=settings.api_prefix)
app.include_router(notifications.router, prefix=settings.api_prefix)
app.include_router(bulk_operations.router, prefix=settings.api_prefix)
app.include_router(sales.router, prefix=settings.api_prefix)
app.include_router(audit.router, prefix=settings.api_prefix)


# Global exception handler to catch all unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions and return proper error response"""
    error_detail = str(exc)
    error_type = type(exc).__name__
    
    logger.error(f"Unhandled exception: {error_type}: {error_detail}")
    logger.error(traceback.format_exc())
    
    # Return a sanitized error message
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {error_type}", "message": "An internal error occurred"},
    )


# SQLAlchemy specific exception handler
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle SQLAlchemy database errors"""
    error_detail = str(exc)
    logger.error(f"Database error: {error_detail}")
    logger.error(traceback.format_exc())
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Database error", "message": "A database error occurred. Please try again."},
    )


@app.get("/")
def root():
    return {"message": "AI Inventory Manager API is running"}


@app.get("/health")
def health_check():
    """Health check endpoint to verify database connectivity"""
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )


@app.get(f"{settings.api_prefix}/health")
def api_health_check():
    return health_check()
