from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class ChangeEventCreate(BaseModel):
    id: str
    correlation_id: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: str
    resource_type: str
    operation: str
    changed_by: Optional[str] = None
    changed_at: Optional[datetime] = None
    before_state: Optional[Any] = None
    after_state: Optional[Any] = None
    diff: Optional[Any] = None
    risk_level: str = "None"
    risk_reason: Optional[str] = None


class ChangeEventOut(ChangeEventCreate):
    notification_sent: bool

    class Config:
        from_attributes = True
