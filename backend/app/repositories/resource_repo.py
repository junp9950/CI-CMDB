from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.models.resource import Resource


class ResourceRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, resource_type: Optional[str] = None, location: Optional[str] = None, search: Optional[str] = None):
        q = self.db.query(Resource)
        if resource_type:
            q = q.filter(Resource.type == resource_type)
        if location:
            q = q.filter(Resource.location == location)
        if search:
            q = q.filter(or_(Resource.name.contains(search), Resource.resource_group.contains(search)))
        return q.order_by(Resource.collected_at.desc()).all()

    def get_by_id(self, resource_id: str) -> Optional[Resource]:
        return self.db.query(Resource).filter(Resource.id == resource_id).first()

    def upsert(self, data: dict) -> Resource:
        existing = self.get_by_id(data["id"])
        if existing:
            for key, value in data.items():
                setattr(existing, key, value)
            self.db.commit()
            self.db.refresh(existing)
            return existing
        resource = Resource(**data)
        self.db.add(resource)
        self.db.commit()
        self.db.refresh(resource)
        return resource

    def delete(self, resource_id: str):
        resource = self.get_by_id(resource_id)
        if resource:
            self.db.delete(resource)
            self.db.commit()

    def count(self) -> int:
        return self.db.query(Resource).count()

    def count_by_type(self) -> dict:
        from sqlalchemy import func
        rows = self.db.query(Resource.type, func.count(Resource.id)).group_by(Resource.type).all()
        return {r[0]: r[1] for r in rows}
