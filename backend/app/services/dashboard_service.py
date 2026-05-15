from sqlalchemy.orm import Session
from app.repositories.resource_repo import ResourceRepository
from app.repositories.change_event_repo import ChangeEventRepository
from app.services.activity_log_service import get_last_synced_at


class DashboardService:
    def __init__(self, db: Session):
        self.resource_repo = ResourceRepository(db)
        self.change_repo = ChangeEventRepository(db)

    def get_stats(self) -> dict:
        return {
            "total_resources": self.resource_repo.count(),
            "resources_by_type": self.resource_repo.count_by_type(),
            "total_changes": self.change_repo.count(),
            "changes_by_risk": self.change_repo.count_by_risk(),
            "last_synced_at": get_last_synced_at(),
            "recent_changes": [
                {
                    "id": e.id,
                    "resource_name": e.resource_name,
                    "resource_type": e.resource_type,
                    "operation": e.operation,
                    "risk_level": e.risk_level,
                    "changed_at": e.changed_at.isoformat() if e.changed_at else None,
                }
                for e in self.change_repo.recent(10)
            ],
        }
