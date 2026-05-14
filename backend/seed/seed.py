import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine, SessionLocal, Base
from app.models import resource, change_event, notification_config
from app.services.resource_service import ResourceService
import uuid

Base.metadata.create_all(bind=engine)

db = SessionLocal()

print("리소스 sync (mock) 실행 중...")
svc = ResourceService(db)
result = svc.sync()
print(f"  created={result['created']}, updated={result['updated']}, total={result['total']}")

from app.repositories.notification_config_repo import NotificationConfigRepository
repo = NotificationConfigRepository(db)
if not repo.get_all():
    repo.create({
        "id": str(uuid.uuid4()),
        "name": "Teams 알림 (샘플)",
        "webhook_type": "teams",
        "webhook_url": "https://example.com/teams-webhook",
        "min_risk_level": "Medium",
        "enabled": False,
    })
    print("  알림 설정 샘플 생성 완료")

db.close()
print("Seed 완료!")
