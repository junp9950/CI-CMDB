from datetime import datetime, timezone, timedelta
from azure.identity import ClientSecretCredential
from azure.mgmt.monitor import MonitorManagementClient
from app.core.config import settings

OPERATION_MAP = {
    "write": "Update",
    "delete": "Delete",
    "action": "Update",
}

SKIP_PROVIDERS = {
    "microsoft.resources",
    "microsoft.insights",
    "microsoft.security",
    "microsoft.advisor",
    "microsoft.support",        # 지원 티켓, 인프라 변경 아님
}

# provider는 통과하지만 특정 리소스 타입은 제외
SKIP_RESOURCE_TYPES = {
    "microsoft.compute/locations",
    "microsoft.network/locations",
    "microsoft.web/locations",
}

# Azure 내부 자동 동작 action — 사용자 설정 변경 아님
SKIP_OPERATIONS = {
    "microsoft.network/firewallpolicies/updatereferences/action",
    "microsoft.network/azurefirewalls/updatereferences/action",
    "microsoft.network/virtualnetworks/updatereferences/action",
    "microsoft.network/networksecuritygroups/updatereferences/action",
    "microsoft.network/routetables/updatereferences/action",
    "microsoft.compute/virtualmachines/updatereferences/action",
}

# Azure operation name → Korean description
OPERATION_DESCRIPTIONS: dict[str, str] = {
    # Compute - VM
    "microsoft.compute/virtualmachines/deallocate/action": "VM 중지 (할당 해제)",
    "microsoft.compute/virtualmachines/start/action": "VM 시작",
    "microsoft.compute/virtualmachines/restart/action": "VM 재시작",
    "microsoft.compute/virtualmachines/poweroff/action": "VM 전원 끄기",
    "microsoft.compute/virtualmachines/redeploy/action": "VM 재배포",
    "microsoft.compute/virtualmachines/reapply/action": "VM 구성 재적용",
    "microsoft.compute/virtualmachines/write": "VM 생성/수정",
    "microsoft.compute/virtualmachines/delete": "VM 삭제",
    "microsoft.compute/virtualmachines/capture/action": "VM 캡처",
    "microsoft.compute/virtualmachines/generalize/action": "VM 일반화",
    "microsoft.compute/virtualmachines/runcommand/action": "VM 명령 실행",
    "microsoft.compute/virtualmachines/extensions/write": "VM 확장 설치/수정",
    "microsoft.compute/virtualmachines/extensions/delete": "VM 확장 삭제",
    # Compute - Disk / Snapshot
    "microsoft.compute/disks/write": "디스크 생성/수정",
    "microsoft.compute/disks/delete": "디스크 삭제",
    "microsoft.compute/snapshots/write": "스냅샷 생성/수정",
    "microsoft.compute/snapshots/delete": "스냅샷 삭제",
    # Compute - VMSS
    "microsoft.compute/virtualmachinescalesets/write": "VMSS 생성/수정",
    "microsoft.compute/virtualmachinescalesets/delete": "VMSS 삭제",
    "microsoft.compute/virtualmachinescalesets/start/action": "VMSS 시작",
    "microsoft.compute/virtualmachinescalesets/deallocate/action": "VMSS 중지",
    # Network
    "microsoft.network/networksecuritygroups/write": "NSG 생성/수정",
    "microsoft.network/networksecuritygroups/delete": "NSG 삭제",
    "microsoft.network/networksecuritygroups/securityrules/write": "NSG 규칙 생성/수정",
    "microsoft.network/networksecuritygroups/securityrules/delete": "NSG 규칙 삭제",
    "microsoft.network/virtualnetworks/write": "VNet 생성/수정",
    "microsoft.network/virtualnetworks/delete": "VNet 삭제",
    "microsoft.network/virtualnetworks/subnets/write": "서브넷 생성/수정",
    "microsoft.network/virtualnetworks/subnets/delete": "서브넷 삭제",
    "microsoft.network/publicipaddresses/write": "공용 IP 생성/수정",
    "microsoft.network/publicipaddresses/delete": "공용 IP 삭제",
    "microsoft.network/networkinterfaces/write": "네트워크 인터페이스 생성/수정",
    "microsoft.network/networkinterfaces/delete": "네트워크 인터페이스 삭제",
    "microsoft.network/loadbalancers/write": "로드 밸런서 생성/수정",
    "microsoft.network/loadbalancers/delete": "로드 밸런서 삭제",
    "microsoft.network/applicationgateways/write": "Application Gateway 생성/수정",
    "microsoft.network/applicationgateways/delete": "Application Gateway 삭제",
    "microsoft.network/applicationgateways/start/action": "Application Gateway 시작",
    "microsoft.network/applicationgateways/stop/action": "Application Gateway 중지",
    "microsoft.network/azurefirewalls/write": "Azure Firewall 생성/수정",
    "microsoft.network/azurefirewalls/delete": "Azure Firewall 삭제",
    "microsoft.network/routetables/write": "라우팅 테이블 생성/수정",
    "microsoft.network/routetables/delete": "라우팅 테이블 삭제",
    "microsoft.network/virtualnetworkgateways/write": "VNet 게이트웨이 생성/수정",
    "microsoft.network/virtualnetworkgateways/delete": "VNet 게이트웨이 삭제",
    # Storage
    "microsoft.storage/storageaccounts/write": "스토리지 계정 생성/수정",
    "microsoft.storage/storageaccounts/delete": "스토리지 계정 삭제",
    "microsoft.storage/storageaccounts/listkeys/action": "스토리지 키 조회",
    "microsoft.storage/storageaccounts/regeneratekey/action": "스토리지 키 재생성",
    "microsoft.storage/storageaccounts/blobservices/write": "Blob 서비스 설정 변경",
    # KeyVault
    "microsoft.keyvault/vaults/write": "Key Vault 생성/수정",
    "microsoft.keyvault/vaults/delete": "Key Vault 삭제",
    "microsoft.keyvault/vaults/accesspolicies/write": "Key Vault 접근 정책 변경",
    "microsoft.keyvault/vaults/secrets/write": "Key Vault 비밀 생성/수정",
    "microsoft.keyvault/vaults/secrets/delete": "Key Vault 비밀 삭제",
    "microsoft.keyvault/vaults/keys/write": "Key Vault 키 생성/수정",
    "microsoft.keyvault/vaults/keys/delete": "Key Vault 키 삭제",
    # SQL / Database
    "microsoft.sql/servers/write": "SQL 서버 생성/수정",
    "microsoft.sql/servers/delete": "SQL 서버 삭제",
    "microsoft.sql/servers/databases/write": "SQL 데이터베이스 생성/수정",
    "microsoft.sql/servers/databases/delete": "SQL 데이터베이스 삭제",
    "microsoft.sql/servers/firewallrules/write": "SQL 방화벽 규칙 생성/수정",
    "microsoft.sql/servers/firewallrules/delete": "SQL 방화벽 규칙 삭제",
    "microsoft.dbformysql/servers/write": "MySQL 서버 생성/수정",
    "microsoft.dbformysql/servers/delete": "MySQL 서버 삭제",
    "microsoft.dbforpostgresql/servers/write": "PostgreSQL 서버 생성/수정",
    "microsoft.dbforpostgresql/servers/delete": "PostgreSQL 서버 삭제",
    # App Service / Functions
    "microsoft.web/sites/write": "App Service 생성/수정",
    "microsoft.web/sites/delete": "App Service 삭제",
    "microsoft.web/sites/start/action": "App Service 시작",
    "microsoft.web/sites/stop/action": "App Service 중지",
    "microsoft.web/sites/restart/action": "App Service 재시작",
    "microsoft.web/sites/publishxml/action": "게시 프로필 조회",
    "microsoft.web/serverfarms/write": "App Service Plan 생성/수정",
    "microsoft.web/serverfarms/delete": "App Service Plan 삭제",
    # Container / AKS
    "microsoft.containerservice/managedclusters/write": "AKS 클러스터 생성/수정",
    "microsoft.containerservice/managedclusters/delete": "AKS 클러스터 삭제",
    "microsoft.containerservice/managedclusters/start/action": "AKS 클러스터 시작",
    "microsoft.containerservice/managedclusters/stop/action": "AKS 클러스터 중지",
    "microsoft.containerservice/managedclusters/agentpools/write": "AKS 노드풀 생성/수정",
    "microsoft.containerservice/managedclusters/agentpools/delete": "AKS 노드풀 삭제",
    "microsoft.containerregistry/registries/write": "컨테이너 레지스트리 생성/수정",
    "microsoft.containerregistry/registries/delete": "컨테이너 레지스트리 삭제",
    # Authorization / RBAC
    "microsoft.authorization/roleassignments/write": "역할 할당 추가",
    "microsoft.authorization/roleassignments/delete": "역할 할당 제거",
    "microsoft.authorization/roledefinitions/write": "역할 정의 생성/수정",
    "microsoft.authorization/roledefinitions/delete": "역할 정의 삭제",
    "microsoft.authorization/policyassignments/write": "정책 할당 생성/수정",
    "microsoft.authorization/policyassignments/delete": "정책 할당 제거",
    # Monitor / Alerts
    "microsoft.insights/alertrules/write": "경고 규칙 생성/수정",
    "microsoft.insights/alertrules/delete": "경고 규칙 삭제",
    "microsoft.insights/metricalerts/write": "메트릭 경고 생성/수정",
    "microsoft.insights/metricalerts/delete": "메트릭 경고 삭제",
    "microsoft.insights/activitylogalerts/write": "활동 로그 경고 생성/수정",
    "microsoft.insights/activitylogalerts/delete": "활동 로그 경고 삭제",
    # Resource Groups
    "microsoft.resources/subscriptions/resourcegroups/write": "리소스 그룹 생성/수정",
    "microsoft.resources/subscriptions/resourcegroups/delete": "리소스 그룹 삭제",
    # Tags
    "microsoft.resources/tags/write": "태그 생성/수정",
    "microsoft.resources/tags/delete": "태그 삭제",
    # Policy (Azure Policy effect actions) — policyassignments 및 policies 경로 모두 처리
    "microsoft.authorization/policyassignments/auditifnotexists/action": "정책 감사 (AuditIfNotExists)",
    "microsoft.authorization/policyassignments/deployifnotexists/action": "정책 자동 배포 (DeployIfNotExists)",
    "microsoft.authorization/policyassignments/modify/action": "정책 수정 (Modify)",
    "microsoft.authorization/policyassignments/deny/action": "정책 거부 (Deny)",
    "microsoft.authorization/policyassignments/audit/action": "정책 감사 (Audit)",
    "microsoft.authorization/policies/auditifnotexists/action": "정책 감사 (AuditIfNotExists)",
    "microsoft.authorization/policies/deployifnotexists/action": "정책 자동 배포 (DeployIfNotExists)",
    "microsoft.authorization/policies/modify/action": "정책 수정 (Modify)",
    "microsoft.authorization/policies/deny/action": "정책 거부 (Deny)",
    "microsoft.authorization/policies/audit/action": "정책 감사 (Audit)",
    "microsoft.authorization/policydefinitions/write": "정책 정의 생성/수정",
    "microsoft.authorization/policydefinitions/delete": "정책 정의 삭제",
    "microsoft.authorization/policysetdefinitions/write": "정책 이니셔티브 생성/수정",
    "microsoft.authorization/policysetdefinitions/delete": "정책 이니셔티브 삭제",
    "microsoft.authorization/policyexemptions/write": "정책 예외 생성/수정",
    "microsoft.authorization/policyexemptions/delete": "정책 예외 삭제",
}


def _humanize(segment: str) -> str:
    """camelCase 또는 소문자 붙여쓰기 → 읽기 좋은 형태로 변환."""
    import re
    # camelCase 분리
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", segment)
    # 모두 소문자면 단어 그대로 유지, 아니면 타이틀케이스
    return spaced if spaced == spaced.lower() else spaced.title()


def _describe_operation(op_name: str) -> str:
    """Return a human-readable Korean description for an Azure operation name."""
    key = op_name.lower()
    if key in OPERATION_DESCRIPTIONS:
        return OPERATION_DESCRIPTIONS[key]
    # Fallback: derive from path segments
    parts = op_name.split("/")  # 원본 케이스 유지로 humanize 활용
    last = parts[-1].lower() if parts else ""
    second_last = _humanize(parts[-2]) if len(parts) >= 2 else ""
    third_last = _humanize(parts[-3]) if len(parts) >= 3 else ""
    resource_label = f"{third_last} > {second_last}" if third_last else second_last
    if last == "write":
        return f"{resource_label} 생성/수정" if resource_label else "리소스 생성/수정"
    if last == "delete":
        return f"{resource_label} 삭제" if resource_label else "리소스 삭제"
    if last == "action":
        action_name = _humanize(parts[-2]) if len(parts) >= 2 else "작업"
        resource_name = _humanize(parts[-3]) if len(parts) >= 3 else ""
        return f"{resource_name} > {action_name} 실행" if resource_name else f"{action_name} 실행"
    return op_name


def _parse_operation(operation_name: str, status_code: str = "") -> str:
    parts = operation_name.lower().split("/")
    last = parts[-1] if parts else ""
    if last == "delete":
        return "Delete"
    if last == "write":
        # Azure statusCode가 Created(201)이면 신규 생성
        return "Create" if status_code.lower() in ("created",) else "Update"
    return "Update"


def _resource_type_from_id(resource_id: str) -> str:
    parts = resource_id.split("/")
    try:
        providers_idx = [i for i, p in enumerate(parts) if p.lower() == "providers"]
        if providers_idx:
            idx = providers_idx[-1]
            return f"{parts[idx+1]}/{parts[idx+2]}".lower()
    except (IndexError, AttributeError):
        pass
    return ""


def fetch_activity_logs(hours: int = 24) -> list[dict]:
    credential = ClientSecretCredential(
        tenant_id=settings.azure_tenant_id,
        client_id=settings.azure_client_id,
        client_secret=settings.azure_client_secret,
    )
    client = MonitorManagementClient(credential, settings.azure_subscription_id)

    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    filter_str = f"eventTimestamp ge '{since.strftime('%Y-%m-%dT%H:%M:%SZ')}'"

    results = []
    for event in client.activity_logs.list(filter=filter_str, select=None):
        status = (event.status.value if event.status else "").lower()
        if status in ("started", "failed", ""):
            continue

        op_name = event.operation_name.value if event.operation_name else ""
        provider = op_name.split("/")[0].lower() if op_name else ""
        if provider in SKIP_PROVIDERS:
            continue

        # 특정 리소스 타입 제외
        resource_id_tmp = event.resource_id or ""
        resource_type_tmp = _resource_type_from_id(resource_id_tmp)
        if resource_type_tmp in SKIP_RESOURCE_TYPES:
            continue
        if resource_type_tmp.endswith("/locations") or resource_type_tmp == "locations":
            continue

        # 리소스를 변경하지 않는 Policy 감사 작업 제외
        op_lower = op_name.lower()
        if "/audit/action" in op_lower or "/auditifnotexists/action" in op_lower:
            continue

        # Azure 내부 참조 동기화 action 제외 (사용자 변경 아님)
        if op_lower in SKIP_OPERATIONS:
            continue
        # updatereferences 패턴 전체 제외 (리소스 종류 무관)
        if "/updatereferences/" in op_lower:
            continue

        # caller가 없는 Azure 내부 시스템 이벤트 제외
        caller = event.caller or ""
        if not caller:
            continue
        if caller.lower() == "microsoft.advisor":
            continue

        # 조회(read), 공급자 등록(register), 서비스 공지(ServiceHealth) 제외
        if op_lower.endswith("/read"):
            continue
        if op_lower.endswith("/register/action"):
            continue
        if op_name.split("/")[0].lower() == "microsoft.servicehealth":
            continue

        # Azure 고유 이벤트 ID를 PK로 사용해 중복 방지
        azure_event_id = str(event.event_data_id) if event.event_data_id else None
        if not azure_event_id:
            continue

        resource_id = event.resource_id or ""
        resource_type = _resource_type_from_id(resource_id)
        resource_name = resource_id.split("/")[-1] if resource_id else ""
        status_code = ""
        try:
            status_code = event.properties.get("statusCode", "") if event.properties else ""
        except Exception:
            pass

        # Accepted는 비동기 중간 상태 — 완료 이벤트(Created/OK)와 중복되므로 제외
        if status_code.lower() == "accepted":
            continue

        operation = _parse_operation(op_name, status_code)

        caller = event.caller or "unknown"
        changed_at = event.event_timestamp
        if changed_at and changed_at.tzinfo is None:
            changed_at = changed_at.replace(tzinfo=timezone.utc)

        correlation_id = str(event.correlation_id) if event.correlation_id else None

        results.append({
            "id": azure_event_id,
            "correlation_id": correlation_id,
            "resource_id": resource_id if resource_id else None,
            "resource_name": resource_name,
            "resource_type": resource_type,
            "operation": operation,
            "changed_by": caller,
            "changed_at": changed_at,
            "before_state": None,
            "after_state": None,
            "diff": {
                "operation_detail": op_name,
                "description": _describe_operation(op_name),
            },
        })

    # 같은 (correlation_id, resource_id) 내 중복 제거: Delete > Create > Update 우선순위
    # resource_id는 대소문자 차이가 있을 수 있으므로 소문자로 정규화
    OP_PRIORITY = {"Delete": 0, "Create": 1, "Update": 2}
    deduped: dict[tuple, dict] = {}
    for item in results:
        rid = (item.get("resource_id") or item["id"]).lower()
        key = (item.get("correlation_id"), rid)
        existing = deduped.get(key)
        if existing is None or OP_PRIORITY[item["operation"]] < OP_PRIORITY[existing["operation"]]:
            deduped[key] = item

    final = list(deduped.values())

    # 같은 correlation 그룹에 VM Create가 있으면 디스크도 Create로 보정
    # (Azure OS 디스크는 statusCode가 OK로 오기 때문)
    from collections import defaultdict as _dd
    corr_has_vm_create: set[str] = set()
    for item in final:
        if item.get("correlation_id") and item["operation"] == "Create" \
                and item.get("resource_type", "").startswith("microsoft.compute/virtualmachines"):
            corr_has_vm_create.add(item["correlation_id"])

    for item in final:
        if item.get("correlation_id") in corr_has_vm_create \
                and item["operation"] == "Update" \
                and item.get("resource_type", "") == "microsoft.compute/disks":
            item["operation"] = "Create"

    return final
