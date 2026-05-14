import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.repositories.change_event_repo import ChangeEventRepository
from app.engines import risk_engine


class ChangeService:
    def __init__(self, db: Session):
        self.change_repo = ChangeEventRepository(db)

    def get_all(self, resource_id=None, operation=None, risk_level=None, date_from=None, date_to=None):
        return self.change_repo.get_all(resource_id, operation, risk_level, date_from, date_to)

    def get_by_id(self, event_id: str):
        return self.change_repo.get_by_id(event_id)

    def ingest_activity_log(self, payload: dict):
        before = payload.get("before_state")
        after = payload.get("after_state")
        operation = payload.get("operation", "Update")
        diff = payload.get("diff")

        if not diff and before and after:
            diff = {k: after[k] for k in after if before.get(k) != after.get(k)}

        risk_level, risk_reason = risk_engine.analyze(operation, before, after, diff)

        event = self.change_repo.create({
            "id": str(uuid.uuid4()),
            "resource_id": payload.get("resource_id"),
            "resource_name": payload.get("resource_name", ""),
            "resource_type": payload.get("resource_type", ""),
            "operation": operation,
            "changed_by": payload.get("changed_by"),
            "changed_at": payload.get("changed_at") or datetime.now(timezone.utc),
            "before_state": before,
            "after_state": after,
            "diff": diff,
            "risk_level": risk_level,
            "risk_reason": risk_reason,
            "notification_sent": False,
        })
        return event
