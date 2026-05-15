from typing import Optional

MEDIUM_TYPES = {
    "networksecuritygroups",
    "virtualnetworks",
    "subnets",
    "routetables",
    "publicipaddresses",
    "privateendpoints",
    "virtualnetworkgateways",
    "applicationgateways",
    "loadbalancers",
    "firewalls",
    "bastionhosts",
    "virtualmachines",
    "virtualmachinescalesets",
    "roleassignments",
    "vaults",           # Key Vault
    "storageaccounts",
    "databaseaccounts",
    "servers",
}

LOW_TYPES = {
    "schedules",        # auto-shutdown
}


def _resource_type_tail(state_dict: dict) -> str:
    t = (state_dict or {}).get("type", "") or ""
    return t.lower().split("/")[-1]


def analyze(operation: str, before: Optional[dict], after: Optional[dict], diff: Optional[dict], resource_type: str = "") -> tuple[str, str]:
    rt = resource_type.lower().split("/")[-1] if resource_type else _resource_type_tail(after or before or {})

    if operation == "Delete":
        return "High", "리소스 삭제"

    if rt in MEDIUM_TYPES:
        return "Medium", f"{rt} 변경"

    if rt in LOW_TYPES or "tags" in (diff or {}):
        return "Low", "태그 또는 스케줄 변경"

    return "None", ""
