import uuid
from datetime import datetime, timezone
from app.collectors.base import BaseCollector


MOCK_RESOURCES = [
    {
        "id": "aaaa-vm-001",
        "subscription_id": "sub-mock-0001",
        "resource_group": "rg-prod",
        "name": "vm-web-01",
        "type": "microsoft.compute/virtualmachines",
        "location": "koreacentral",
        "sku": {"name": "Standard_D2s_v3"},
        "tags": {"env": "prod", "owner": "team-a"},
        "has_public_ip": True,
        "has_private_endpoint": False,
        "has_nsg": True,
    },
    {
        "id": "aaaa-vm-002",
        "subscription_id": "sub-mock-0001",
        "resource_group": "rg-prod",
        "name": "vm-db-01",
        "type": "microsoft.compute/virtualmachines",
        "location": "koreacentral",
        "sku": {"name": "Standard_E4s_v3"},
        "tags": {"env": "prod", "owner": "team-b"},
        "has_public_ip": False,
        "has_private_endpoint": True,
        "has_nsg": True,
    },
    {
        "id": "aaaa-nsg-001",
        "subscription_id": "sub-mock-0001",
        "resource_group": "rg-prod",
        "name": "nsg-web",
        "type": "microsoft.network/networksecuritygroups",
        "location": "koreacentral",
        "sku": None,
        "tags": {"env": "prod"},
        "has_public_ip": False,
        "has_private_endpoint": False,
        "has_nsg": False,
    },
    {
        "id": "aaaa-storage-001",
        "subscription_id": "sub-mock-0001",
        "resource_group": "rg-dev",
        "name": "stdevblob001",
        "type": "microsoft.storage/storageaccounts",
        "location": "koreacentral",
        "sku": {"name": "Standard_LRS"},
        "tags": {"env": "dev"},
        "has_public_ip": True,
        "has_private_endpoint": False,
        "has_nsg": False,
    },
    {
        "id": "aaaa-vnet-001",
        "subscription_id": "sub-mock-0001",
        "resource_group": "rg-network",
        "name": "vnet-prod",
        "type": "microsoft.network/virtualnetworks",
        "location": "koreacentral",
        "sku": None,
        "tags": {"env": "prod"},
        "has_public_ip": False,
        "has_private_endpoint": False,
        "has_nsg": False,
    },
]


class MockCollector(BaseCollector):
    def collect(self) -> list[dict]:
        now = datetime.now(timezone.utc)
        return [{**r, "collected_at": now} for r in MOCK_RESOURCES]
