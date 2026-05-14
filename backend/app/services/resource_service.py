from datetime import datetime, date
from sqlalchemy.orm import Session
from app.repositories.resource_repo import ResourceRepository
from app.collectors.azure_rg import get_collector
from app.core.config import settings


def _jsonify(obj):
    if isinstance(obj, dict):
        return {k: _jsonify(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_jsonify(v) for v in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj


class ResourceService:
    def __init__(self, db: Session):
        self.db = db
        self.resource_repo = ResourceRepository(db)

    def get_all(self, resource_type=None, location=None, search=None):
        return self.resource_repo.get_all(resource_type, location, search)

    def get_by_id(self, resource_id: str):
        return self.resource_repo.get_by_id(resource_id)

    def sync(self) -> dict:
        collector = get_collector(settings.collector_mode)
        collected = collector.collect()
        created = updated = 0

        for data in collected:
            existing = self.resource_repo.get_by_id(data["id"])
            if existing:
                before = {
                    "type": existing.type,
                    "sku": existing.sku,
                    "tags": existing.tags,
                    "has_public_ip": existing.has_public_ip,
                }
                after = {
                    "type": data["type"],
                    "sku": data.get("sku"),
                    "tags": data.get("tags"),
                    "has_public_ip": data.get("has_public_ip", False),
                }
                diff = {k: after[k] for k in after if before.get(k) != after[k]}
                if diff:
                    updated += 1
            else:
                created += 1

            self.resource_repo.upsert(data)

        return {"created": created, "updated": updated, "total": len(collected)}
