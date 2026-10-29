"""
Centralized Configuration Engine for ClinixVault Edge Inference & Gateway Services.
Supports environment variables, dotenv files, and runtime parameter overrides.
"""

import os
from typing import Optional
from pydantic import BaseModel, Field


class ServiceSettings(BaseModel):
    ENVIRONMENT: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "production"))
    LOG_LEVEL: str = Field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    # Service Bindings
    GATEWAY_HOST: str = Field(default_factory=lambda: os.getenv("GATEWAY_HOST", "0.0.0.0"))
    GATEWAY_PORT: int = Field(default_factory=lambda: int(os.getenv("GATEWAY_PORT", "8000")))

    VLM_HOST: str = Field(default_factory=lambda: os.getenv("VLM_HOST", "0.0.0.0"))
    VLM_PORT: int = Field(default_factory=lambda: int(os.getenv("VLM_PORT", "8001")))
    VLM_URL: str = Field(default_factory=lambda: os.getenv("VLM_URL", "http://localhost:8001"))

    LLM_HOST: str = Field(default_factory=lambda: os.getenv("LLM_HOST", "0.0.0.0"))
    LLM_PORT: int = Field(default_factory=lambda: int(os.getenv("LLM_PORT", "8002")))
    LLM_URL: str = Field(default_factory=lambda: os.getenv("LLM_URL", "http://localhost:8002"))

    AUDIO_HOST: str = Field(default_factory=lambda: os.getenv("AUDIO_HOST", "0.0.0.0"))
    AUDIO_PORT: int = Field(default_factory=lambda: int(os.getenv("AUDIO_PORT", "8003")))
    AUDIO_URL: str = Field(default_factory=lambda: os.getenv("AUDIO_URL", "http://localhost:8003"))

    DOCUMENT_HOST: str = Field(default_factory=lambda: os.getenv("DOCUMENT_HOST", "0.0.0.0"))
    DOCUMENT_PORT: int = Field(default_factory=lambda: int(os.getenv("DOCUMENT_PORT", "8004")))
    DOCUMENT_URL: str = Field(default_factory=lambda: os.getenv("DOCUMENT_URL", "http://localhost:8004"))

    # Database & Storage
    DATABASE_URL: str = Field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/clinixvault"
        )
    )
    SQL_DEBUG: bool = Field(default_factory=lambda: os.getenv("SQL_DEBUG", "false").lower() == "true")
    POOL_SIZE: int = Field(default_factory=lambda: int(os.getenv("POOL_SIZE", "10")))
    MAX_OVERFLOW: int = Field(default_factory=lambda: int(os.getenv("MAX_OVERFLOW", "20")))

    # Model Weights & Checkpoints Directory (Self-Contained Hospital Deployment)
    CHECKPOINTS_DIR: str = Field(
        default_factory=lambda: os.getenv(
            "CLINIX_CHECKPOINTS_DIR",
            os.getenv("CHECKPOINTS_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../checkpoints"))),
        )
    )
    VLM_MODEL_PATH: str = Field(default_factory=lambda: os.getenv("VLM_MODEL_PATH", "clinixvault-qwen2vl-qlora"))
    VLM_QUANTIZATION: str = Field(default_factory=lambda: os.getenv("VLM_QUANTIZATION", "int4"))
    SUMMARIZER_MODEL_PATH: str = Field(default_factory=lambda: os.getenv("SUMMARIZER_MODEL_PATH", "clinixvault-qwen2.5-summarizer"))
    SUMMARIZER_EDGE_URL: str = Field(default_factory=lambda: os.getenv("SUMMARIZER_EDGE_URL", ""))
    OLLAMA_URL: str = Field(default_factory=lambda: os.getenv("OLLAMA_URL", "http://127.0.0.1:11434"))
    LLM_MODEL_PATH: str = Field(default_factory=lambda: os.getenv("LLM_MODEL_PATH", "models/mistral-7b-instruct-v0.2.Q4_K_M.gguf"))
    LLM_N_CTX: int = Field(default_factory=lambda: int(os.getenv("LLM_N_CTX", "4096")))
    LLM_N_THREADS: int = Field(default_factory=lambda: int(os.getenv("LLM_N_THREADS", "4")))
    LLM_N_GPU_LAYERS: int = Field(default_factory=lambda: int(os.getenv("LLM_N_GPU_LAYERS", "-1")))

    WHISPER_MODEL_SIZE: str = Field(default_factory=lambda: os.getenv("WHISPER_MODEL_SIZE", "large-v3-turbo"))
    WHISPER_DEVICE: str = Field(default_factory=lambda: os.getenv("WHISPER_DEVICE", "auto"))
    WHISPER_COMPUTE_TYPE: str = Field(default_factory=lambda: os.getenv("WHISPER_COMPUTE_TYPE", "float16"))

    # Security & JWT
    JWT_SECRET_KEY: str = Field(
        default_factory=lambda: os.getenv("JWT_SECRET_KEY", "clinixvault-air-gapped-secret-key-32byte-min")
    )
    JWT_ALGORITHM: str = Field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    JWT_EXPIRATION_MINUTES: int = Field(default_factory=lambda: int(os.getenv("JWT_EXPIRATION_MINUTES", "480")))
    RATE_LIMIT_PER_MINUTE: int = Field(default_factory=lambda: int(os.getenv("RATE_LIMIT_PER_MINUTE", "120")))

    # Audit & Provenance
    ENABLE_CRYPTO_PROVENANCE: bool = Field(default_factory=lambda: os.getenv("ENABLE_CRYPTO_PROVENANCE", "true").lower() == "true")
    AUDIT_STORAGE_PATH: str = Field(default_factory=lambda: os.getenv("AUDIT_STORAGE_PATH", "./vault_audit_records"))


settings = ServiceSettings()
