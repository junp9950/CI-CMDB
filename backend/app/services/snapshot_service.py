from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.resource_snapshot import ResourceSnapshot
from app.core.config import settings
from azure.identity import ClientSecretCredential
from azure.mgmt.resource import ResourceManagementClient
import json


def _fetch_resource_state(resource_id: str) -> dict | None:
    try:
        credential = ClientSecretCredential(
            tenant_id=settings.azure_tenant_id,
            client_id=settings.azure_client_id,
            client_secret=settings.azure_client_secret,
        )
        client = ResourceManagementClient(credential, settings.azure_subscription_id)
        # resource_id에서 api-version 없이 조회 — 대부분의 리소스에 호환되는 버전 사용
        resource = client.resources.get_by_id(resource_id, api_version="2021-04-01")
        props = resource.properties or {}
        return json.loads(json.dumps(props, default=str))
    except Exception:
        return None


def _diff(before: dict, after: dict, path: str = "") -> list[dict]:
    """두 dict를 재귀적으로 비교해 변경된 필드 목록 반환."""
    changes = []
    all_keys = set(before) | set(after)
    for k in sorted(all_keys):
        full_key = f"{path}.{k}" if path else k
        b_val = before.get(k)
        a_val = after.get(k)
        if isinstance(b_val, dict) and isinstance(a_val, dict):
            changes.extend(_diff(b_val, a_val, full_key))
        elif b_val != a_val:
            changes.append({"field": full_key, "before": b_val, "after": a_val})
    return changes


class SnapshotService:
    def __init__(self, db: Session):
        self.db = db

    def get_latest(self, resource_id: str) -> dict | None:
        snap = (
            self.db.query(ResourceSnapshot)
            .filter(ResourceSnapshot.resource_id == resource_id.lower())
            .order_by(ResourceSnapshot.captured_at.desc())
            .first()
        )
        return snap.snapshot if snap else None

    def save(self, resource_id: str, snapshot: dict):
        now = datetime.now(timezone.utc)
        snap = ResourceSnapshot(
            id=f"{resource_id.lower()}_{now.isoformat()}",
            resource_id=resource_id.lower(),
            snapshot=snapshot,
            captured_at=now,
        )
        self.db.add(snap)
        self.db.commit()

    def capture_and_diff(self, resource_id: str) -> list[dict]:
        """현재 상태를 가져와 직전 스냅샷과 비교. 변경 목록 반환 후 새 스냅샷 저장."""
        current = _fetch_resource_state(resource_id)
        if current is None:
            return []

        previous = self.get_latest(resource_id)
        changes = _diff(previous, current) if previous else []

        self.save(resource_id, current)
        return changes
