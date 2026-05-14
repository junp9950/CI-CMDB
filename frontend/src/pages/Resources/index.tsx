import React, { useEffect, useState } from "react";
import api from "../../api/client";
import { Resource } from "../../types";
import { toKST } from "../../utils/time";

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = () => {
    const params: any = {};
    if (search) params.search = search;
    if (typeFilter) params.resource_type = typeFilter;
    api.get<Resource[]>("/resources", { params }).then((r) => setResources(r.data));
  };

  useEffect(() => {
    api.get<Resource[]>("/resources").then((r) => setResources(r.data));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const types = Array.from(new Set(resources.map((r) => r.type)));

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>CIDB — 리소스 목록</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 / 리소스 그룹 검색"
          style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, width: 240, fontSize: 14 }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14 }}
        >
          <option value="">전체 유형</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={load}
          style={{ padding: "8px 16px", background: "#3182ce", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          검색
        </button>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f7fafc", borderBottom: "1px solid #e2e8f0" }}>
              {["이름", "유형", "리소스 그룹", "위치", "Public IP", "NSG", "수집 시각"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#4a5568" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "10px 16px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "10px 16px", color: "#718096" }}>{r.type}</td>
                <td style={{ padding: "10px 16px" }}>{r.resource_group}</td>
                <td style={{ padding: "10px 16px" }}>{r.location}</td>
                <td style={{ padding: "10px 16px" }}>{r.has_public_ip ? "✅" : "—"}</td>
                <td style={{ padding: "10px 16px" }}>{r.has_nsg ? "✅" : "—"}</td>
                <td style={{ padding: "10px 16px", color: "#718096" }}>{toKST(r.collected_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {resources.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#a0aec0" }}>리소스가 없습니다. 동기화를 먼저 실행하세요.</div>
        )}
      </div>
    </div>
  );
}
