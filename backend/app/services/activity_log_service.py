from sqlalchemy.orm import Session
from app.collectors.activity_log import fetch_activity_logs
from app.repositories.change_event_repo import ChangeEventRepository
from app.services.snapshot_service import SnapshotService
from app.engines import risk_engine


class ActivityLogService:
    def __init__(self, db: Session):
        self.change_repo = ChangeEventRepository(db)
        self.snapshot_svc = SnapshotService(db)

    def sync(self, hours: int = 24) -> dict:
        logs = fetch_activity_logs(hours=hours)
        imported = skipped = 0

        for log in logs:
            if self.change_repo.get_by_id(log["id"]):
                skipped += 1
                continue

            # 리소스 상태 스냅샷 비교로 before/after diff 생성
            resource_id = log.get("resource_id")
            state_changes = []
            if resource_id and log["operation"] in ("Update", "Create"):
                try:
                    state_changes = self.snapshot_svc.capture_and_diff(resource_id)
                except Exception:
                    pass

            diff = {**log["diff"]}
            if state_changes:
                diff["state_changes"] = state_changes

            risk_level, risk_reason = risk_engine.analyze(
                log["operation"],
                log["before_state"],
                log["after_state"],
                diff,
            )
            self.change_repo.create({
                **log,
                "diff": diff,
                "risk_level": risk_level,
                "risk_reason": risk_reason,
                "notification_sent": False,
            })
            imported += 1

        return {"imported": imported, "skipped": skipped, "hours": hours}
