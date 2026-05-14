from typing import Optional


RISK_RULES = [
    {
        "id": "nsg_inbound_deny_added",
        "level": "High",
        "description": "NSG inbound deny 규칙 추가",
        "match": lambda op, before, after, diff: (
            op == "Update"
            and "microsoft.network/networksecuritygroups" in str(after.get("type", "")).lower()
            and any("deny" in str(v).lower() for v in (diff or {}).values())
        ),
    },
    {
        "id": "nsg_allow_deleted",
        "level": "High",
        "description": "NSG allow 규칙 삭제",
        "match": lambda op, before, after, diff: (
            op == "Delete"
            and "microsoft.network/networksecuritygroups" in str((before or {}).get("type", "")).lower()
        ),
    },
    {
        "id": "private_endpoint_deleted",
        "level": "High",
        "description": "Private Endpoint 삭제",
        "match": lambda op, before, after, diff: (
            op == "Delete"
            and "privateendpoint" in str((before or {}).get("type", "")).lower()
        ),
    },
    {
        "id": "udr_changed",
        "level": "High",
        "description": "UDR(Route Table) 변경",
        "match": lambda op, before, after, diff: (
            "routetable" in str((after or before or {}).get("type", "")).lower()
        ),
    },
    {
        "id": "public_ip_created",
        "level": "Medium",
        "description": "Public IP 생성",
        "match": lambda op, before, after, diff: (
            op == "Create"
            and "publicipaddress" in str((after or {}).get("type", "")).lower()
        ),
    },
    {
        "id": "has_public_ip_enabled",
        "level": "Medium",
        "description": "리소스에 Public IP 활성화",
        "match": lambda op, before, after, diff: (
            op == "Update"
            and (after or {}).get("has_public_ip") is True
            and not (before or {}).get("has_public_ip", False)
        ),
    },
    {
        "id": "vm_size_changed",
        "level": "Medium",
        "description": "VM Size 변경",
        "match": lambda op, before, after, diff: (
            op == "Update"
            and "virtualmachine" in str((after or {}).get("type", "")).lower()
            and "sku" in (diff or {})
        ),
    },
    {
        "id": "tag_changed",
        "level": "Low",
        "description": "Tag 변경",
        "match": lambda op, before, after, diff: (
            "tags" in (diff or {})
        ),
    },
]

RISK_ORDER = {"High": 0, "Medium": 1, "Low": 2, "None": 3}


def analyze(operation: str, before: Optional[dict], after: Optional[dict], diff: Optional[dict]) -> tuple[str, str]:
    triggered = []
    for rule in RISK_RULES:
        try:
            if rule["match"](operation, before, after, diff):
                triggered.append(rule)
        except Exception:
            pass

    if not triggered:
        return "None", ""

    triggered.sort(key=lambda r: RISK_ORDER.get(r["level"], 9))
    top = triggered[0]
    reasons = ", ".join(r["description"] for r in triggered)
    return top["level"], reasons
