from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.models.change_event import ChangeEvent


class ChangeEventRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(
        self,
        resource_id: Optional[str] = None,
        operation: Optional[str] = None,
        risk_level: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ):
        q = self.db.query(ChangeEvent)
        if resource_id:
            q = q.filter(ChangeEvent.resource_id == resource_id)
        if operation:
            q = q.filter(ChangeEvent.operation == operation)
        if risk_level:
            q = q.filter(ChangeEvent.risk_level == risk_level)
        if date_from:
            q = q.filter(ChangeEvent.changed_at >= date_from)
        if date_to:
            q = q.filter(ChangeEvent.changed_at <= date_to)
        return q.order_by(ChangeEvent.changed_at.desc()).all()

    def get_by_id(self, event_id: str) -> Optional[ChangeEvent]:
        return self.db.query(ChangeEvent).filter(ChangeEvent.id == event_id).first()

    def create(self, data: dict) -> ChangeEvent:
        event = ChangeEvent(**data)
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def mark_notified(self, event_id: str):
        event = self.get_by_id(event_id)
        if event:
            event.notification_sent = True
            self.db.commit()

    def latest_synced_at(self):
        from sqlalchemy import func
        return self.db.query(func.max(ChangeEvent.changed_at)).scalar()

    def count(self) -> int:
        return self.db.query(ChangeEvent).count()

    def count_by_risk(self) -> dict:
        from sqlalchemy import func
        rows = self.db.query(ChangeEvent.risk_level, func.count(ChangeEvent.id)).group_by(ChangeEvent.risk_level).all()
        return {r[0]: r[1] for r in rows}

    def recent(self, limit: int = 10):
        from sqlalchemy import case
        priority = case((ChangeEvent.changed_by == "sync", 1), else_=0)
        return (
            self.db.query(ChangeEvent)
            .order_by(priority, ChangeEvent.changed_at.desc())
            .limit(limit)
            .all()
        )
