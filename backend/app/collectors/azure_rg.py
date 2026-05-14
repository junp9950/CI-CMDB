from datetime import datetime, timezone
from app.collectors.base import BaseCollector
from app.core.config import settings


class AzureResourceGraphCollector(BaseCollector):
    def collect(self) -> list[dict]:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.resourcegraph import ResourceGraphClient
        from azure.mgmt.resourcegraph.models import QueryRequest

        credential = ClientSecretCredential(
            tenant_id=settings.azure_tenant_id,
            client_id=settings.azure_client_id,
            client_secret=settings.azure_client_secret,
        )
        client = ResourceGraphClient(credential)

        query = """
        Resources
        | project id, subscriptionId, resourceGroup, name, type, location, sku, tags
        | limit 1000
        """
        request = QueryRequest(
            subscriptions=[settings.azure_subscription_id],
            query=query,
        )
        response = client.resources(request)
        now = datetime.now(timezone.utc)
        results = []
        for row in response.data:
            results.append({
                "id": row["id"],
                "subscription_id": row["subscriptionId"],
                "resource_group": row["resourceGroup"],
                "name": row["name"],
                "type": row["type"].lower(),
                "location": row["location"],
                "sku": row.get("sku"),
                "tags": row.get("tags") or {},
                "has_public_ip": False,
                "has_private_endpoint": False,
                "has_nsg": False,
                "collected_at": now,
            })
        return results


def get_collector(mode: str) -> BaseCollector:
    if mode == "azure":
        return AzureResourceGraphCollector()
    from app.collectors.mock import MockCollector
    return MockCollector()
