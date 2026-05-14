from sqlalchemy import Column, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base


class Resource(Base):
    __tablename__ = "resources"

    id = Column(String, primary_key=True)
    subscription_id = Column(String, nullable=False)
    resource_group = Column(String, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    location = Column(String, nullable=False)
    sku = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True, default={})
    has_public_ip = Column(Boolean, default=False)
    has_private_endpoint = Column(Boolean, default=False)
    has_nsg = Column(Boolean, default=False)
    collected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    change_events = relationship("ChangeEvent", back_populates="resource")
