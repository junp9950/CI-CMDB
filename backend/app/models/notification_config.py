from sqlalchemy import Column, String, Boolean
from app.core.database import Base


class NotificationConfig(Base):
    __tablename__ = "notification_configs"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    webhook_type = Column(String, nullable=False)  # teams / slack
    webhook_url = Column(String, nullable=False)
    min_risk_level = Column(String, default="Low")  # High / Medium / Low
    enabled = Column(Boolean, default=True)
