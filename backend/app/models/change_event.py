from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base


class ChangeEvent(Base):
    __tablename__ = "change_events"

    id = Column(String, primary_key=True)
    correlation_id = Column(String, nullable=True, index=True)
    resource_id = Column(String, ForeignKey("resources.id"), nullable=True)
    resource_name = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    operation = Column(String, nullable=False)  # Create / Update / Delete
    changed_by = Column(String, nullable=True)
    changed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    diff = Column(JSON, nullable=True)
    risk_level = Column(String, default="None")  # High / Medium / Low / None
    risk_reason = Column(String, nullable=True)
    notification_sent = Column(Boolean, default=False)

    resource = relationship("Resource", back_populates="change_events")
