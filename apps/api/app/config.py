"""Centralised, environment-driven application settings (Pydantic Settings).

Nothing in the application imports os.environ directly — every configurable
value flows through this module so behaviour is identical across local
`uvicorn`, Docker Compose, and (later) a production deployment.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    debug: bool = True

    database_url: str = "postgresql+psycopg://rcgm:rcgm_dev_password_change_me@localhost:5434/rcgm"

    secret_key: str = "change_me_dev_only_insecure_secret_key"
    session_cookie_name: str = "rcgm_session"
    session_ttl_minutes: int = 480
    session_absolute_ttl_hours: int = 24

    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 300

    cors_allowed_origins: str = "http://localhost:3000"

    upload_storage_dir: str = "./storage/uploads"
    max_upload_size_mb: int = 10

    seed_tenant_code: str = "JDL"
    seed_tenant_name: str = "Jims Diamond Lounge"
    seed_demo_password_suffix: str = "123"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
