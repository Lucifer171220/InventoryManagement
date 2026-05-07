from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    app_name: str = "AI Inventory Manager"
    api_prefix: str = "/api"
    database_url: str = (
        "mssql+pyodbc://@localhost\\SQLEXPRESS02/inventory_ai"
        "?driver=ODBC+Driver+18+for+SQL+Server&trusted_connection=yes&TrustServerCertificate=yes"
    )
    jwt_secret_key: str = "replace-this-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    cors_origins: str = "http://localhost:5173"
    smtp_host: str = "localhost"
    smtp_port: int = 25
    smtp_user: str = ""
    smtp_password: str = ""
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model_primary: str = "gpt-oss:latest"
    ollama_model_fallbacks: str = "gemma4:latest, qwen3.6:latest"
    ollama_embedding_model_primary: str = "embeddinggemma:latest"
    ollama_embedding_model_fallbacks: str = "qwen3-embedding:latest, nomic-embed-text:latest, mxbai-embed-large:latest, all-minilm:latest"
    comfyui_base_url: str = "http://127.0.0.1:8188"
    comfyui_workflow_path: str = str(BACKEND_DIR / "workflows" / "product_image_workflow_api.json")
    comfyui_timeout_seconds: int = 180
    openrouteservice_api_key: str = ""
    seed_default_users: bool = True
    chroma_persist_directory: str = str(BACKEND_DIR / "chroma")
    chroma_inventory_collection: str = "inventory_items"

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

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
