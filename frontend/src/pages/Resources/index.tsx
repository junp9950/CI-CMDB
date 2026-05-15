import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import api from "../../api/client";
import { Resource } from "../../types";
import { toKST } from "../../utils/time";

function shortType(type: string) {
  return type.split("/").pop() ?? type;
}

function getRelated(selected: Resource, all: Resource[]) {
  const props = selected.properties || {};
  const rtype = selected.type;
  const rg = selected.resource_group.toLowerCase();
  const related: { label: string; items: Resource[] }[] = [];

  if (rtype === "microsoft.compute/virtualmachines") {
    const nicIds: string[] = (props.networkProfile?.networkInterfaces || []).map((n: any) =>
      (n.id || "").toLowerCase()
    );
    const diskIds: string[] = [
      props.storageProfile?.osDisk?.managedDisk?.id,
      ...(props.storageProfile?.dataDisks || []).map((d: any) => d.managedDisk?.id),
    ]
      .filter(Boolean)
      .map((id: string) => id.toLowerCase());

    const nics = all.filter((r) => nicIds.includes(r.id.toLowerCase()));
    const disks = all.filter((r) => diskIds.includes(r.id.toLowerCase()));

    const nsgIds = nics.flatMap((nic) => {
      const nsgId = nic.properties?.networkSecurityGroup?.id;
      return nsgId ? [nsgId.toLowerCase()] : [];
    });
    const pipIds = nics.flatMap((nic) =>
      (nic.properties?.ipConfigurations || [])
        .map((cfg: any) => cfg.properties?.publicIPAddress?.id?.toLowerCase())
        .filter(Boolean)
    );

    const nsgs = all.filter((r) => nsgIds.includes(r.id.toLowerCase()));
    const pips = all.filter((r) => pipIds.includes(r.id.toLowerCase()));

    if (nics.length) related.push({ label: "네트워크 인터페이스 (NIC)", items: nics });
    if (nsgs.length) related.push({ label: "네트워크 보안 그룹 (NSG)", items: nsgs });
    if (pips.length) related.push({ label: "Public IP", items: pips });
    if (disks.length) related.push({ label: "디스크", items: disks });
  }

  return related;
}

function VmBasicInfo({ props }: { props: any }) {
  if (!props) return null;
  const size = props.hardwareProfile?.vmSize;
  const os = props.storageProfile?.osDisk?.osType;
  const image = props.storageProfile?.imageReference;
  const imageStr = image ? `${image.publisher || ""} ${image.offer || ""} ${image.sku || ""}`.trim() : null;

  return (
    <div style={{ marginBottom: 16 }}>
      {size && <InfoRow label="VM 크기" value={size} />}
      {os && <InfoRow label="OS 종류" value={os} />}
      {imageStr && <InfoRow label="이미지" value={imageStr} />}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [publicIpFilter, setPublicIpFilter] = useState("");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [panelWidth, setPanelWidth] = useState(380);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    api.get<Resource[]>("/resources").then((r) => setResources(r.data));
  }, []);

  const types = useMemo(() => Array.from(new Set(resources.map((r) => r.type))).sort(), [resources]);
  const locations = useMemo(() => Array.from(new Set(resources.map((r) => r.location))).sort(), [resources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.resource_group.toLowerCase().includes(q)) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (locationFilter && r.location !== locationFilter) return false;
      if (publicIpFilter === "yes" && !r.has_public_ip) return false;
      if (publicIpFilter === "no" && r.has_public_ip) return false;
      return true;
    });
  }, [resources, search, typeFilter, locationFilter, publicIpFilter]);

  const hasFilter = search || typeFilter || locationFilter || publicIpFilter;
  const resetAll = () => { setSearch(""); setTypeFilter(""); setLocationFilter(""); setPublicIpFilter(""); };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setPanelWidth(Math.min(700, Math.max(280, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14 };
  const selectStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14 };

  const related = selected ? getRelated(selected, resources) : [];

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>CIDB — 리소스 목록</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 / 리소스 그룹" style={{ ...inputStyle, width: 180 }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="">전체 유형</option>
          {types.map((t) => <option key={t} value={t}>{t.split("/").pop()}</option>)}
        </select>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={selectStyle}>
          <option value="">전체 위치</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={publicIpFilter} onChange={(e) => setPublicIpFilter(e.target.value)} style={selectStyle}>
          <option value="">Public IP 전체</option>
          <option value="yes">있음</option>
          <option value="no">없음</option>
        </select>
        {hasFilter && (
          <button onClick={resetAll} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 13, color: "#718096" }}>
            전체 초기화
          </button>
        )}
        <span style={{ fontSize: 13, color: "#a0aec0", marginLeft: 4 }}>{filtered.length}개</span>
      </div>

      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: selected ? panelWidth + 16 : 0, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 220px)" }}>
          <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 13 }}>
            <colgroup>
              <col /><col style={{ width: 150 }} /><col style={{ width: 160 }} /><col style={{ width: 100 }} /><col style={{ width: 140 }} /><col style={{ width: 160 }} />
            </colgroup>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ background: "#f7fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["이름", "유형", "리소스 그룹", "위치", "Public IP", "수집 시각"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#4a5568", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer", background: selected?.id === r.id ? "#ebf8ff" : "transparent" }}
                >
                  <td style={{ padding: "10px 16px", fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: "10px 16px", color: "#718096", fontSize: 12 }} title={r.type}>{shortType(r.type)}</td>
                  <td style={{ padding: "10px 16px" }}>{r.resource_group}</td>
                  <td style={{ padding: "10px 16px" }}>{r.location}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, color: r.public_ip_address ? "#2b6cb0" : "#cbd5e0" }}>
                    {r.public_ip_address || "—"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#718096", whiteSpace: "nowrap" }}>{toKST(r.collected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "#a0aec0" }}>
              {resources.length > 0 ? "검색 결과가 없습니다." : "리소스가 없습니다. 동기화를 먼저 실행하세요."}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: panelWidth, background: "#fff", boxShadow: "-4px 0 16px rgba(0,0,0,0.12)", overflowY: "auto", zIndex: 99 }}>
            <div onMouseDown={onMouseDown} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", background: "linear-gradient(to right, #e2e8f0, #cbd5e0)", zIndex: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#a0aec0")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "linear-gradient(to right, #e2e8f0, #cbd5e0)")}
            />
            <div style={{ padding: 20, paddingLeft: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{selected.name}</h3>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#718096" }}>✕</button>
              </div>

              <InfoRow label="유형" value={selected.type} />
              <InfoRow label="리소스 그룹" value={selected.resource_group} />
              <InfoRow label="위치" value={selected.location} />
              {selected.public_ip_address && <InfoRow label="Public IP" value={selected.public_ip_address} />}
              <InfoRow label="수집 시각" value={toKST(selected.collected_at)} />

              {selected.type === "microsoft.compute/virtualmachines" && (
                <VmBasicInfo props={selected.properties} />
              )}

              {related.length > 0 && (
                <>
                  <div style={{ borderTop: "1px solid #e2e8f0", margin: "16px 0" }} />
                  <div style={{ fontSize: 12, color: "#718096", marginBottom: 12, fontWeight: 600 }}>연결된 리소스</div>
                  {related.map((group) => (
                    <div key={group.label} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 6 }}>{group.label}</div>
                      {group.items.map((r) => (
                        <div key={r.id} style={{ background: "#f7fafc", borderRadius: 6, padding: "8px 10px", marginBottom: 6, fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: "#2d3748" }}>{r.name}</div>
                          {r.public_ip_address && (
                            <div style={{ color: "#2b6cb0", fontFamily: "monospace", marginTop: 2 }}>{r.public_ip_address}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}

              {related.length === 0 && selected.type !== "microsoft.compute/virtualmachines" && selected.properties && (
                <>
                  <div style={{ borderTop: "1px solid #e2e8f0", margin: "16px 0" }} />
                  <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 6 }}>속성</div>
                  <pre style={{ fontSize: 11, color: "#4a5568", background: "#f7fafc", borderRadius: 6, padding: 10, overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(selected.properties, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
