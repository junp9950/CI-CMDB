from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/cidb.db"
    collector_mode: str = "mock"

    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""
    azure_subscription_id: str = ""

    admin_password: str = "admin1234"
    secret_key: str = "cidb-cmdb-secret-key-change-me"

    resource_sync_interval_minutes: int = 30
    activity_log_sync_interval_minutes: int = 15

    class Config:
        env_file = ".env"


settings = Settings()
