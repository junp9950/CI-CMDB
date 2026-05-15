from datetime import datetime, timezone
from app.collectors.base import BaseCollector
from app.core.config import settings


def _get_public_ip(rtype: str, props: dict) -> str | None:
    """리소스 자체 속성에서 Public IP 주소 문자열 반환."""
    if not props:
        return None
    if rtype == "microsoft.network/publicipaddresses":
        return props.get("ipAddress") or None
    return None


def _has_nsg(rtype: str, props: dict) -> bool:
    if not props:
        return False
    if rtype == "microsoft.network/networksecuritygroups":
        return True
    if rtype == "microsoft.network/networkinterfaces":
        return bool(props.get("networkSecurityGroup"))
    if rtype == "microsoft.network/virtualnetworks":
        for subnet in props.get("subnets", []):
            if subnet.get("properties", {}).get("networkSecurityGroup"):
                return True
    return False


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

        # 일반 리소스 수집 (properties 포함)
        query = """
        Resources
        | project id, subscriptionId, resourceGroup, name, type, location, sku, tags, properties
        | limit 1000
        """
        request = QueryRequest(
            subscriptions=[settings.azure_subscription_id],
            query=query,
        )
        response = client.resources(request)
        now = datetime.now(timezone.utc)

        # VM별 NIC 정보 조회 (VM의 Public IP / NSG 판단용)
        vm_nic_info = self._fetch_vm_nic_info(client)

        results = []
        for row in response.data:
            rtype = row["type"].lower()
            props = row.get("properties") or {}
            rid = row["id"]

            if rtype == "microsoft.compute/virtualmachines":
                nic_data = vm_nic_info.get(rid.lower(), {})
                has_pip = nic_data.get("has_public_ip", False)
                has_nsg = nic_data.get("has_nsg", False)
                pip_addr = nic_data.get("public_ip_address")
            else:
                pip_addr = _get_public_ip(rtype, props)
                has_pip = bool(pip_addr)
                has_nsg = _has_nsg(rtype, props)

            results.append({
                "id": rid,
                "subscription_id": row["subscriptionId"],
                "resource_group": row["resourceGroup"],
                "name": row["name"],
                "type": rtype,
                "location": row["location"],
                "sku": row.get("sku"),
                "tags": row.get("tags") or {},
                "has_public_ip": has_pip,
                "public_ip_address": pip_addr,
                "has_private_endpoint": False,
                "has_nsg": has_nsg,
                "properties": props,
                "collected_at": now,
            })
        return results

    def _fetch_vm_nic_info(self, client) -> dict:
        """VM ID → {has_public_ip, has_nsg} 매핑 반환"""
        from azure.mgmt.resourcegraph.models import QueryRequest
        try:
            query = """
            Resources
            | where type == 'microsoft.network/networkinterfaces'
            | extend vmId = tolower(tostring(properties.virtualMachine.id))
            | where isnotempty(vmId)
            | extend hasNsg = isnotnull(properties.networkSecurityGroup.id)
            | mvexpand ipCfg = properties.ipConfigurations
            | extend pipId = tolower(tostring(ipCfg.properties.publicIPAddress.id))
            | extend hasPip = isnotnull(ipCfg.properties.publicIPAddress.id)
            | summarize has_public_ip = max(tobool(hasPip)), has_nsg = max(tobool(hasNsg)), pip_id = max(pipId) by vmId
            """
            request = QueryRequest(
                subscriptions=[settings.azure_subscription_id],
                query=query,
            )
            response = client.resources(request)
            vm_map = {
                row["vmId"]: {
                    "has_public_ip": bool(row.get("has_public_ip")),
                    "has_nsg": bool(row.get("has_nsg")),
                    "pip_id": row.get("pip_id") or "",
                }
                for row in response.data
            }

            # Public IP 리소스에서 실제 IP 주소 조회
            pip_query = """
            Resources
            | where type == 'microsoft.network/publicipaddresses'
            | project id = tolower(id), ipAddress = tostring(properties.ipAddress)
            """
            pip_req = QueryRequest(subscriptions=[settings.azure_subscription_id], query=pip_query)
            pip_resp = client.resources(pip_req)
            pip_map = {row["id"]: row["ipAddress"] for row in pip_resp.data if row.get("ipAddress")}

            for vm_id, info in vm_map.items():
                if info["pip_id"] and info["pip_id"] in pip_map:
                    info["public_ip_address"] = pip_map[info["pip_id"]]
                else:
                    info["public_ip_address"] = None

            return vm_map
        except Exception:
            return {}


def get_collector(mode: str) -> BaseCollector:
    if mode == "azure":
        return AzureResourceGraphCollector()
    from app.collectors.mock import MockCollector
    return MockCollector()
