from sqlalchemy import Column, String, DateTime, JSON, Index
from datetime import datetime, timezone
from app.core.database import Base


class ResourceSnapshot(Base):
    __tablename__ = "resource_snapshots"

    id = Column(String, primary_key=True)       # resource_id + "_" + timestamp
    resource_id = Column(String, nullable=False)
    snapshot = Column(JSON, nullable=False)
    captured_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_snapshot_resource_captured", "resource_id", "captured_at"),
    )
