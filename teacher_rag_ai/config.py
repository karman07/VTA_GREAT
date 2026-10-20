"""
config.py — Application settings loaded from .env
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Local paths ────────────────────────────────────────────────────────
    uploads_root: str = "../backend/uploads"
    qdrant_path: str = "./qdrant_data"

    # ── Service ────────────────────────────────────────────────────────────
    rag_host: str = "0.0.0.0"
    rag_port: int = 8000

    # ── PDF processing ─────────────────────────────────────────────────────
    pdf_max_pages: int = 20
    pdf_max_images_per_page: int = 10
    pdf_min_image_area: int = 40000
    pdf_vision_concurrency: int = 4

    # ── Gemini (OpenAI-compatible endpoint) ────────────────────────────────
    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    llm_model_name: str = "gemini-2.5-flash-lite"
    vision_model_name: str = "gemini-2.5-flash-lite"
    rerank_model_name: str = ""          # defaults to llm_model_name
    embed_model_name: str = "gemini-embedding-001"
    embed_dim: int = 768

    # ── Retrieval ──────────────────────────────────────────────────────────
    retrieve_k: int = 20                 # candidates from dense search
    final_k: int = 6                     # passages kept after reranking

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
