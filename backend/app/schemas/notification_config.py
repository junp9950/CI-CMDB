from pydantic import BaseModel
from typing import Optional


class NotificationConfigCreate(BaseModel):
    name: str
    webhook_type: str
    webhook_url: str
    min_risk_level: str = "Low"
    enabled: bool = True


class NotificationConfigOut(NotificationConfigCreate):
    id: str

    class Config:
        from_attributes = True
