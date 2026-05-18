import React, { useEffect, useState, useMemo } from "react";
import api from "../../api/client";
import { Resource } from "../../types";

// ── NSG rule types ──────────────────────────────────────────────
interface NsgRule {
  name: string;
  priority: number;
  direction: "Inbound" | "Outbound";
  access: "Allow" | "Deny";
  protocol: string; // Tcp / Udp / *
  sourceAddressPrefix: string;
  sourcePortRange: string;
  destinationAddressPrefix: string;
  destinationPortRange: string;
}

interface HopResult {
  layer: string;
  resource: string;
  direction: "Inbound" | "Outbound";
  result: "Allow" | "Deny" | "NoNSG";
  matchedRule?: NsgRule;
  note?: string;
}

interface AnalysisResult {
  reachable: boolean;
  hops: HopResult[];
  summary: string;
  fix?: string;
}

// ── helpers ─────────────────────────────────────────────────────
function ipToNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bits] = cidr.split("/");
  const mask = bits === "0" ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipToNum(ip) & mask) === (ipToNum(base) & mask);
}

const SERVICE_TAG_MAP: Record<string, string[]> = {
  Internet: [],          // any non-RFC1918
  VirtualNetwork: [],    // treat as match-all for same-vnet
  AzureLoadBalancer: ["168.63.129.16"],
  "*": [],
};

const RFC1918 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

function isPrivateIp(ip: string) {
  return RFC1918.some((c) => inCidr(ip, c));
}

function matchAddress(prefix: string, ip: string): boolean {
  if (!prefix || prefix === "*") return true;
  const p = prefix.toLowerCase();
  if (p === "internet") return !isPrivateIp(ip);
  if (p === "virtualnetwork") return true; // simplified: assume same-vnet
  if (p === "azureloadbalancer") return ip === "168.63.129.16";
  if (p === "any") return true;
  if (prefix.includes("/")) return inCidr(ip, prefix);
  return ip === prefix;
}

function matchPort(range: string, port: number): boolean {
  if (!range || range === "*") return true;
  if (range.includes("-")) {
    const [lo, hi] = range.split("-").map(Number);
    return port >= lo && port <= hi;
  }
  return parseInt(range, 10) === port;
}

function matchProtocol(ruleProto: string, proto: string): boolean {
  if (ruleProto === "*") return true;
  return ruleProto.toLowerCase() === proto.toLowerCase();
}

function evaluateNsg(
  rules: NsgRule[],
  direction: "Inbound" | "Outbound",
  srcIp: string,
  dstIp: string,
  port: number,
  proto: string
): { access: "Allow" | "Deny"; rule: NsgRule } | null {
  const filtered = rules
    .filter((r) => r.direction === direction)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of filtered) {
    const srcMatch = matchAddress(rule.sourceAddressPrefix, srcIp);
    const dstMatch = matchAddress(rule.destinationAddressPrefix, dstIp);
    const portMatch = matchPort(rule.destinationPortRange, port);
    const protoMatch = matchProtocol(rule.protocol, proto);
    if (srcMatch && dstMatch && portMatch && protoMatch) {
      return { access: rule.access as "Allow" | "Deny", rule };
    }
  }
  return null;
}

function getNsgRules(nsg: Resource): NsgRule[] {
  const props = nsg.properties || {};
  const rules: any[] = [
    ...(props.securityRules || []),
    ...(props.defaultSecurityRules || []),
  ];
  return rules.map((r) => {
    const p = r.properties || r;
    return {
      name: r.name || p.name || "",
      priority: p.priority ?? 0,
      direction: p.direction ?? "Inbound",
      access: p.access ?? "Allow",
      protocol: p.protocol ?? "*",
      sourceAddressPrefix: p.sourceAddressPrefix ?? "*",
      sourcePortRange: p.sourcePortRange ?? "*",
      destinationAddressPrefix: p.destinationAddressPrefix ?? "*",
      destinationPortRange: p.destinationPortRange ?? "*",
    };
  });
}

// ── UDR helpers ─────────────────────────────────────────────────
interface Route {
  name: string;
  addressPrefix: string;
  nextHopType: string;
  nextHopIpAddress?: string;
}

function cidrBits(cidr: string): number {
  return cidr.includes("/") ? parseInt(cidr.split("/")[1], 10) : 32;
}

function bestRoute(routes: Route[], dstIp: string): Route | null {
  // longest prefix match
  const matched = routes.filter((r) => {
    try { return inCidr(dstIp, r.addressPrefix); } catch { return false; }
  });
  if (!matched.length) return null;
  return matched.reduce((a, b) => cidrBits(a.addressPrefix) >= cidrBits(b.addressPrefix) ? a : b);
}

function getRouteTable(subnetId: string, all: Resource[]): { rt: Resource; routes: Route[] } | null {
  // subnet ID 로 VNet 찾고, subnet 속성에서 routeTable.id 조회
  const vnet = all.find((r) =>
    r.type === "microsoft.network/virtualnetworks" &&
    (r.properties?.subnets || []).some((s: any) => s.id?.toLowerCase() === subnetId.toLowerCase())
  );
  if (!vnet) return null;
  const subnet = (vnet.properties?.subnets || []).find(
    (s: any) => s.id?.toLowerCase() === subnetId.toLowerCase()
  );
  const rtId = subnet?.properties?.routeTable?.id;
  if (!rtId) return null;
  const rt = all.find((r) => r.id.toLowerCase() === rtId.toLowerCase());
  if (!rt) return null;
  const routes: Route[] = (rt.properties?.routes || []).map((r: any) => {
    const p = r.properties || r;
    return { name: r.name || "", addressPrefix: p.addressPrefix || "0.0.0.0/0", nextHopType: p.nextHopType || "", nextHopIpAddress: p.nextHopIpAddress };
  });
  return { rt, routes };
}

function getVmSubnetId(vm: Resource, all: Resource[]): string | null {
  const nicIds = (vm.properties?.networkProfile?.networkInterfaces || []).map((n: any) => n.id?.toLowerCase());
  const nic = all.find((r) => nicIds.includes(r.id.toLowerCase()));
  return nic?.properties?.ipConfigurations?.[0]?.properties?.subnet?.id ?? null;
}

// ── Firewall helpers ─────────────────────────────────────────────

function evalFwRuleCollections(
  collections: any[],
  srcIp: string,
  dstIp: string,
  port: number,
  proto: string,
  isPolicy: boolean
): { access: "Allow" | "Deny"; collectionName: string; ruleName: string } | null {
  // priority 순 정렬 (낮을수록 먼저 평가)
  const sorted = [...collections].sort(
    (a, b) => (a.properties?.priority ?? a.priority ?? 0) - (b.properties?.priority ?? b.priority ?? 0)
  );
  for (const col of sorted) {
    const cp = col.properties || col;
    const action: string = cp.action?.type ?? "Deny";
    const rules: any[] = cp.rules || [];
    for (const rule of rules) {
      // Policy 규칙은 ruleType 필터 (NetworkRule만), Classic은 없음
      if (isPolicy && rule.ruleType && rule.ruleType !== "NetworkRule") continue;

      const srcMatch = (rule.sourceAddresses || ["*"]).some((s: string) => matchAddress(s, srcIp));
      const dstMatch = (rule.destinationAddresses || ["*"]).some((d: string) => matchAddress(d, dstIp));
      const portMatch = (rule.destinationPorts || ["*"]).some((p: string) => matchPort(p, port));
      // Policy는 ipProtocols, Classic은 protocols
      const protocols: string[] = isPolicy
        ? (rule.ipProtocols || ["Any"])
        : (rule.protocols || ["Any"]);
      const protoMatch = protocols.some((p: string) => p === "Any" || matchProtocol(p, proto));

      if (srcMatch && dstMatch && portMatch && protoMatch) {
        return { access: action as "Allow" | "Deny", collectionName: col.name || "", ruleName: rule.name || "" };
      }
    }
  }
  return null;
}

function evaluateFirewall(
  fw: Resource,
  srcIp: string,
  dstIp: string,
  port: number,
  proto: string,
  all: Resource[]
): { access: "Allow" | "Deny"; collectionName: string; ruleName: string } | null {
  const props = fw.properties || {};

  // ── Firewall Policy 방식 ──
  const policyId: string = props.firewallPolicy?.id || "";
  if (policyId) {
    // policy → rulecollectiongroups 찾기
    const rcgs = all.filter((r) =>
      r.type === "microsoft.network/firewallpolicies/rulecollectiongroups" &&
      r.id.toLowerCase().startsWith(policyId.toLowerCase() + "/")
    );
    // rcg priority 순 정렬 후, 각 rcg 내 ruleCollections 평가
    const sortedRcgs = [...rcgs].sort(
      (a, b) => (a.properties?.priority ?? 0) - (b.properties?.priority ?? 0)
    );
    for (const rcg of sortedRcgs) {
      const ruleCollections: any[] = rcg.properties?.ruleCollections || [];
      // network rule collection만 (type filter)
      const netCols = ruleCollections.filter(
        (c: any) => !c.ruleCollectionType || c.ruleCollectionType === "FirewallPolicyFilterRuleCollection"
      );
      const result = evalFwRuleCollections(netCols, srcIp, dstIp, port, proto, true);
      if (result) return result;
    }
    return null;
  }

  // ── Classic 인라인 방식 ──
  const collections: any[] = props.networkRuleCollections || [];
  return evalFwRuleCollections(
    collections.map((c: any) => ({ ...c, properties: c.properties || c })),
    srcIp, dstIp, port, proto, false
  );
}

// ── main analysis ────────────────────────────────────────────────
function analyze(
  srcVm: Resource | null,
  srcIp: string,
  dstVm: Resource | null,
  dstIp: string,
  port: number,
  proto: string,
  all: Resource[]
): AnalysisResult {
  const hops: HopResult[] = [];
  const byId = (id: string) => all.find((r) => r.id.toLowerCase() === id.toLowerCase());

  function getVmNsgs(vm: Resource): { nsg: Resource; nic: Resource }[] {
    const props = vm.properties || {};
    const nicIds: string[] = (props.networkProfile?.networkInterfaces || []).map((n: any) =>
      (n.id || "").toLowerCase()
    );
    const nics = all.filter((r) => nicIds.includes(r.id.toLowerCase()));
    const result: { nsg: Resource; nic: Resource }[] = [];
    for (const nic of nics) {
      const nsgId = nic.properties?.networkSecurityGroup?.id;
      if (nsgId) {
        const nsg = byId(nsgId);
        if (nsg) result.push({ nsg, nic });
      }
    }
    return result;
  }

  // ── source outbound NSG check ──
  if (srcVm) {
    const srcNsgs = getVmNsgs(srcVm);
    if (srcNsgs.length === 0) {
      hops.push({
        layer: "NSG (송신측)",
        resource: `${srcVm.name} — NSG 없음`,
        direction: "Outbound",
        result: "NoNSG",
        note: "NSG가 연결되지 않아 기본 Azure 정책 적용",
      });
    } else {
      for (const { nsg, nic } of srcNsgs) {
        const rules = getNsgRules(nsg);
        const match = evaluateNsg(rules, "Outbound", srcIp, dstIp, port, proto);
        hops.push({
          layer: "NSG (송신측)",
          resource: `${nsg.name} (NIC: ${nic.name})`,
          direction: "Outbound",
          result: match ? match.access : "Allow",
          matchedRule: match?.rule,
          note: match ? undefined : "매칭 규칙 없음 — 기본 허용",
        });
        if (match?.access === "Deny") break;
      }
    }
  }

  // ── UDR (Route Table) check ──
  if (srcVm) {
    const subnetId = getVmSubnetId(srcVm, all);
    if (subnetId) {
      const rtInfo = getRouteTable(subnetId, all);
      if (rtInfo) {
        const { rt, routes } = rtInfo;
        const route = bestRoute(routes, dstIp);
        if (route) {
          const hopType = route.nextHopType;
          const blocked = hopType === "None";
          hops.push({
            layer: "UDR (경로 테이블)",
            resource: rt.name,
            direction: "Outbound",
            result: blocked ? "Deny" : "Allow",
            note: `경로: ${route.addressPrefix} → ${hopType}${route.nextHopIpAddress ? ` (${route.nextHopIpAddress})` : ""}`,
          });

          // ── Azure Firewall check (UDR이 VirtualAppliance로 라우팅 시) ──
          if (!blocked && hopType === "VirtualAppliance" && route.nextHopIpAddress) {
            const fw = all.find((r) => r.type === "microsoft.network/azurefirewalls");
            if (fw) {
              const fwMatch = evaluateFirewall(fw, srcIp, dstIp, port, proto, all);
              hops.push({
                layer: "Azure Firewall",
                resource: fw.name,
                direction: "Outbound",
                result: fwMatch ? fwMatch.access : "Allow",
                note: fwMatch
                  ? `규칙: ${fwMatch.collectionName} / ${fwMatch.ruleName}`
                  : "매칭 규칙 없음 — 기본 거부 (Firewall 기본 정책)",
              });
            } else {
              hops.push({
                layer: "Azure Firewall",
                resource: `NVA (${route.nextHopIpAddress})`,
                direction: "Outbound",
                result: "Allow",
                note: "Azure Firewall 리소스 없음 — NVA 또는 다른 어플라이언스 경유 (규칙 미확인)",
              });
            }
          }
        } else {
          hops.push({
            layer: "UDR (경로 테이블)",
            resource: rt.name,
            direction: "Outbound",
            result: "Allow",
            note: "매칭 경로 없음 — 시스템 기본 경로 사용",
          });
        }
      }
    }
  }

  // ── destination inbound NSG check ──
  if (dstVm) {
    const dstNsgs = getVmNsgs(dstVm);
    if (dstNsgs.length === 0) {
      hops.push({
        layer: "NSG (수신측)",
        resource: `${dstVm.name} — NSG 없음`,
        direction: "Inbound",
        result: "NoNSG",
        note: "NSG가 연결되지 않아 기본 Azure 정책 적용",
      });
    } else {
      for (const { nsg, nic } of dstNsgs) {
        const rules = getNsgRules(nsg);
        const match = evaluateNsg(rules, "Inbound", srcIp, dstIp, port, proto);
        hops.push({
          layer: "NSG (수신측)",
          resource: `${nsg.name} (NIC: ${nic.name})`,
          direction: "Inbound",
          result: match ? match.access : "Allow",
          matchedRule: match?.rule,
          note: match ? undefined : "매칭 규칙 없음 — 기본 허용",
        });
        if (match?.access === "Deny") break;
      }
    }
  }

  const blocked = hops.find((h) => h.result === "Deny");
  const reachable = !blocked;

  let summary = reachable
    ? `✅ ${srcIp} → ${dstIp}:${port} 트래픽은 허용됩니다.`
    : `❌ ${srcIp} → ${dstIp}:${port} 트래픽이 차단됩니다.`;

  let fix: string | undefined;
  if (blocked && blocked.layer === "Azure Firewall") {
    const note = blocked.note || "";
    fix = `Azure Firewall "${blocked.resource}"에서 차단 중입니다.\n` +
      (note ? `차단 규칙: ${note}\n` : "") +
      `→ 아래 중 하나를 선택하세요:\n` +
      `   1) 차단 규칙 컬렉션을 삭제하거나 해당 규칙을 제거\n` +
      `   2) 우선순위가 더 높은(숫자 작은) Allow 컬렉션을 추가\n` +
      `      예) 우선순위: 100, 액션: Allow, 프로토콜: ${proto.toUpperCase()}, 소스: <web서브넷>, 대상: <app서브넷>:${port}`;
  } else if (blocked && blocked.layer === "UDR (경로 테이블)") {
    fix = `Route Table "${blocked.resource}"에 nextHopType: None 경로가 있어 트래픽이 차단됩니다.\n` +
      `→ 해당 경로의 nextHopType을 VnetLocal 또는 VirtualAppliance로 변경하세요.`;
  } else if (blocked && blocked.matchedRule) {
    const r = blocked.matchedRule;
    fix = `NSG "${blocked.resource.split(" (")[0]}"의 규칙 "${r.name}" (우선순위 ${r.priority}, ${r.access})이 차단 중입니다.\n` +
      `→ 해당 규칙을 삭제하거나, 우선순위가 더 높은(숫자 작은) Allow 규칙을 추가하세요.\n` +
      `   예) 우선순위: ${r.priority - 10}, 방향: ${r.direction}, 허용 프로토콜: ${proto.toUpperCase()}, 대상 포트: ${port}`;
  } else if (blocked) {
    fix = `"${blocked.layer}"에서 차단됩니다.\n방향: ${blocked.direction}, 프로토콜: ${proto.toUpperCase()}, 대상 포트: ${port}`;
  }

  return { reachable, hops, summary, fix };
}

// ── UI ──────────────────────────────────────────────────────────
export default function NetworkAnalysis() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [srcMode, setSrcMode] = useState<"vm" | "ip">("vm");
  const [dstMode, setDstMode] = useState<"vm" | "ip">("vm");
  const [srcVmId, setSrcVmId] = useState("");
  const [dstVmId, setDstVmId] = useState("");
  const [srcIpInput, setSrcIpInput] = useState("");
  const [dstIpInput, setDstIpInput] = useState("");
  const [port, setPort] = useState("80");
  const [proto, setProto] = useState("Tcp");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    api.get<Resource[]>("/resources").then((r) => setResources(r.data));
  }, []);

  const vms = useMemo(
    () => resources.filter((r) => r.type === "microsoft.compute/virtualmachines"),
    [resources]
  );

  const nsgs = useMemo(
    () => resources.filter((r) => r.type === "microsoft.network/networksecuritygroups"),
    [resources]
  );

  function getVmIp(vm: Resource): string {
    const props = vm.properties || {};
    const nicIds: string[] = (props.networkProfile?.networkInterfaces || []).map((n: any) =>
      (n.id || "").toLowerCase()
    );
    const nic = resources.find((r) => nicIds.includes(r.id.toLowerCase()));
    if (!nic) return vm.public_ip_address || "";
    const ipCfgs = nic.properties?.ipConfigurations || [];
    return ipCfgs[0]?.properties?.privateIPAddress || vm.public_ip_address || "";
  }

  function run() {
    const srcVm = srcMode === "vm" ? vms.find((v) => v.id === srcVmId) || null : null;
    const dstVm = dstMode === "vm" ? vms.find((v) => v.id === dstVmId) || null : null;
    const srcIp = srcMode === "vm" && srcVm ? getVmIp(srcVm) : srcIpInput;
    const dstIp = dstMode === "vm" && dstVm ? getVmIp(dstVm) : dstIpInput;
    const portNum = parseInt(port, 10);
    if (!srcIp || !dstIp || isNaN(portNum)) return;
    setResult(analyze(srcVm, srcIp, dstVm, dstIp, portNum, proto, resources));
  }

  const inputSt: React.CSSProperties = {
    padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, width: "100%",
  };
  const selectSt: React.CSSProperties = { ...inputSt };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>네트워크 경로 분석</h2>
      <p style={{ color: "#718096", fontSize: 13, marginBottom: 24 }}>
        NSG · UDR (Route Table) · Azure Firewall 레이어 기반 트래픽 허용/차단 분석
      </p>

      <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: 24, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
          {/* Source */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>소스 (출발지)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setSrcMode("vm")} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #e2e8f0", background: srcMode === "vm" ? "#ebf8ff" : "#f7fafc", cursor: "pointer", fontWeight: srcMode === "vm" ? 600 : 400 }}>VM 선택</button>
              <button onClick={() => setSrcMode("ip")} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #e2e8f0", background: srcMode === "ip" ? "#ebf8ff" : "#f7fafc", cursor: "pointer", fontWeight: srcMode === "ip" ? 600 : 400 }}>IP 직접 입력</button>
            </div>
            {srcMode === "vm" ? (
              <select value={srcVmId} onChange={(e) => setSrcVmId(e.target.value)} style={selectSt}>
                <option value="">VM 선택</option>
                {vms.map((v) => <option key={v.id} value={v.id}>{v.name} ({getVmIp(v) || "IP 없음"})</option>)}
              </select>
            ) : (
              <input value={srcIpInput} onChange={(e) => setSrcIpInput(e.target.value)} placeholder="예: 10.0.0.4" style={inputSt} />
            )}
          </div>

          {/* Destination */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>목적지 (도착지)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setDstMode("vm")} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #e2e8f0", background: dstMode === "vm" ? "#ebf8ff" : "#f7fafc", cursor: "pointer", fontWeight: dstMode === "vm" ? 600 : 400 }}>VM 선택</button>
              <button onClick={() => setDstMode("ip")} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid #e2e8f0", background: dstMode === "ip" ? "#ebf8ff" : "#f7fafc", cursor: "pointer", fontWeight: dstMode === "ip" ? 600 : 400 }}>IP 직접 입력</button>
            </div>
            {dstMode === "vm" ? (
              <select value={dstVmId} onChange={(e) => setDstVmId(e.target.value)} style={selectSt}>
                <option value="">VM 선택</option>
                {vms.map((v) => <option key={v.id} value={v.id}>{v.name} ({getVmIp(v) || "IP 없음"})</option>)}
              </select>
            ) : (
              <input value={dstIpInput} onChange={(e) => setDstIpInput(e.target.value)} placeholder="예: 10.0.0.5 또는 외부 IP" style={inputSt} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#718096", marginBottom: 4 }}>포트</div>
            <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="80" style={inputSt} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#718096", marginBottom: 4 }}>프로토콜</div>
            <select value={proto} onChange={(e) => setProto(e.target.value)} style={selectSt}>
              <option value="Tcp">TCP</option>
              <option value="Udp">UDP</option>
              <option value="*">모두</option>
            </select>
          </div>
          <button
            onClick={run}
            style={{ padding: "9px 28px", background: "#3182ce", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            분석 실행
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: 24 }}>
          {/* Summary */}
          <div style={{ padding: "14px 18px", borderRadius: 8, background: result.reachable ? "#f0fff4" : "#fff5f5", border: `1px solid ${result.reachable ? "#9ae6b4" : "#feb2b2"}`, marginBottom: 24, fontSize: 15, fontWeight: 600, color: result.reachable ? "#276749" : "#9b2c2c" }}>
            {result.summary}
          </div>

          {/* Hops */}
          <div style={{ marginBottom: result.fix ? 20 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", marginBottom: 12 }}>경로 분석 상세</div>
            {result.hops.map((hop, i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12, padding: "12px 16px", borderRadius: 8, background: hop.result === "Deny" ? "#fff5f5" : hop.result === "NoNSG" ? "#fffff0" : "#f0fff4", border: `1px solid ${hop.result === "Deny" ? "#fed7d7" : hop.result === "NoNSG" ? "#fefcbf" : "#c6f6d5"}` }}>
                <div style={{ fontSize: 20, minWidth: 28 }}>
                  {hop.result === "Allow" ? "✅" : hop.result === "Deny" ? "❌" : "⚠️"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                    {hop.layer} — {hop.resource}
                    <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: hop.direction === "Inbound" ? "#bee3f8" : "#feebc8", color: hop.direction === "Inbound" ? "#2a69ac" : "#7b341e" }}>
                      {hop.direction === "Inbound" ? "수신" : "송신"}
                    </span>
                  </div>
                  {hop.matchedRule && (
                    <div style={{ fontSize: 12, color: "#4a5568", marginTop: 4 }}>
                      규칙: <strong>{hop.matchedRule.name}</strong> · 우선순위 {hop.matchedRule.priority} · {hop.matchedRule.access}
                      <span style={{ color: "#718096", marginLeft: 6 }}>
                        ({hop.matchedRule.sourceAddressPrefix} → {hop.matchedRule.destinationAddressPrefix}:{hop.matchedRule.destinationPortRange} / {hop.matchedRule.protocol})
                      </span>
                    </div>
                  )}
                  {hop.note && <div style={{ fontSize: 12, color: "#718096", marginTop: 2 }}>{hop.note}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Fix guide */}
          {result.fix && (
            <div style={{ background: "#fffaf0", border: "1px solid #f6e05e", borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#744210", marginBottom: 8 }}>수정 가이드</div>
              <pre style={{ fontSize: 12, color: "#4a5568", margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{result.fix}</pre>
            </div>
          )}

          {/* NSG overview */}
          <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", marginBottom: 12 }}>관련 NSG 규칙 전체 보기</div>
            {nsgs.filter((nsg) => result.hops.some((h) => h.resource.startsWith(nsg.name))).map((nsg) => {
              const rules = getNsgRules(nsg).sort((a, b) => a.priority - b.priority);
              return (
                <div key={nsg.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "#2d3748", marginBottom: 6 }}>{nsg.name}</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#f7fafc" }}>
                        {["우선순위", "이름", "방향", "허용/차단", "프로토콜", "출발지", "목적지", "포트"].map((h) => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#718096", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.name} style={{ borderBottom: "1px solid #f0f0f0", background: r.access === "Deny" ? "#fff8f8" : "white" }}>
                          <td style={{ padding: "5px 10px" }}>{r.priority}</td>
                          <td style={{ padding: "5px 10px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</td>
                          <td style={{ padding: "5px 10px" }}>{r.direction === "Inbound" ? "수신" : "송신"}</td>
                          <td style={{ padding: "5px 10px", fontWeight: 600, color: r.access === "Allow" ? "#276749" : "#9b2c2c" }}>{r.access}</td>
                          <td style={{ padding: "5px 10px" }}>{r.protocol}</td>
                          <td style={{ padding: "5px 10px", fontFamily: "monospace" }}>{r.sourceAddressPrefix}</td>
                          <td style={{ padding: "5px 10px", fontFamily: "monospace" }}>{r.destinationAddressPrefix}</td>
                          <td style={{ padding: "5px 10px", fontFamily: "monospace" }}>{r.destinationPortRange}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
