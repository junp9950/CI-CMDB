from sqlalchemy.orm import Session
from typing import Optional
from app.models.notification_config import NotificationConfig


class NotificationConfigRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> list[NotificationConfig]:
        return self.db.query(NotificationConfig).all()

    def get_by_id(self, config_id: str) -> Optional[NotificationConfig]:
        return self.db.query(NotificationConfig).filter(NotificationConfig.id == config_id).first()

    def create(self, data: dict) -> NotificationConfig:
        config = NotificationConfig(**data)
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def update(self, config_id: str, data: dict) -> Optional[NotificationConfig]:
        config = self.get_by_id(config_id)
        if not config:
            return None
        for key, value in data.items():
            setattr(config, key, value)
        self.db.commit()
        self.db.refresh(config)
        return config

    def delete(self, config_id: str):
        config = self.get_by_id(config_id)
        if config:
            self.db.delete(config)
            self.db.commit()

    def get_enabled(self) -> list[NotificationConfig]:
        return self.db.query(NotificationConfig).filter(NotificationConfig.enabled == True).all()
