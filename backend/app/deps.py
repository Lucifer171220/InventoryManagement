from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models import User, UserRole
from app.schemas import TokenData
from app.security import decode_access_token

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Get current user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token:
        logger.warning("No token provided in request")
        raise credentials_exception
    
    try:
        payload = decode_access_token(token)
        if payload is None:
            logger.warning("Invalid token payload")
            raise credentials_exception
        token_data = TokenData(sub=payload.get("sub"), role=payload.get("role"))
    except (JWTError, ValueError) as e:
        logger.warning(f"JWT decode error: {e}")
        raise credentials_exception
    
    user = db.query(User).filter(User.email == token_data.sub).first()
    if not user:
        logger.warning(f"User not found: {token_data.sub}")
        raise credentials_exception
    
    if not user.is_active:
        logger.warning(f"Inactive user attempted access: {token_data.sub}")
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_roles(*roles: UserRole):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user

    return dependency


def require_role(*roles: str):
    """Alternative role checker that accepts string role names"""
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user

    return dependency
