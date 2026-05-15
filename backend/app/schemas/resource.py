from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class ResourceBase(BaseModel):
    subscription_id: str
    resource_group: str
    name: str
    type: str
    location: str
    sku: Optional[Any] = None
    tags: Optional[dict] = {}
    has_public_ip: bool = False
    public_ip_address: Optional[str] = None
    has_private_endpoint: bool = False
    has_nsg: bool = False
    properties: Optional[Any] = None


class ResourceCreate(ResourceBase):
    id: str


class ResourceOut(ResourceBase):
    id: str
    collected_at: datetime

    class Config:
        from_attributes = True
