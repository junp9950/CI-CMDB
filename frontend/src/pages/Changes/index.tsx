import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import api from "../../api/client";
import { ChangeEvent } from "../../types";
import RiskBadge from "../../components/RiskBadge";
import { toKST } from "../../utils/time";

interface EventGroup {
  key: string;           // correlationId 또는 단독 이벤트 id
  main: ChangeEvent;     // 대표 이벤트
  children: ChangeEvent[]; // 연관 이벤트 (대표 제외)
}

function buildGroups(events: ChangeEvent[]): EventGroup[] {
  const corrMap = new Map<string, ChangeEvent[]>();
  const singles: ChangeEvent[] = [];

  for (const e of events) {
    if (e.correlation_id) {
      const arr = corrMap.get(e.correlation_id) ?? [];
      arr.push(e);
      corrMap.set(e.correlation_id, arr);
    } else {
      singles.push(e);
    }
  }

  const groups: EventGroup[] = [];

  for (const [corrId, group] of Array.from(corrMap.entries())) {
    if (group.length === 1) {
      singles.push(group[0]);
      continue;
    }
    // 대표 이벤트: Delete > Create > Update 우선순위, 같으면 리소스 이름 짧은 것
    const priority = (op: string) => op === "Delete" ? 0 : op === "Create" ? 1 : 2;
    const sorted = [...group].sort((a, b) =>
      priority(a.operation) - priority(b.operation) ||
      a.resource_name.length - b.resource_name.length
    );
    const [main, ...children] = sorted;
    groups.push({ key: corrId, main, children });
  }

  for (const e of singles) {
    groups.push({ key: e.id, main: e, children: [] });
  }

  // 최신순 정렬
  groups.sort((a, b) => {
    const ta = new Date(a.main.changed_at ?? 0).getTime();
    const tb = new Date(b.main.changed_at ?? 0).getTime();
    return tb - ta;
  });

  return groups;
}

export default function Changes() {
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [search, setSearch] = useState("");
  const [changedBySearch, setChangedBySearch] = useState("");
  const [typeSearch, setTypeSearch] = useState("");
  const [opFilter, setOpFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<ChangeEvent | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [panelWidth, setPanelWidth] = useState(420);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const params: any = {};
    if (opFilter) params.operation = opFilter;
    if (riskFilter) params.risk_level = riskFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.get<ChangeEvent[]>("/changes", { params }).then((r) => setEvents(r.data));
  }, [opFilter, riskFilter, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const by = changedBySearch.trim().toLowerCase();
    const tp = typeSearch.trim().toLowerCase();
    return events.filter((e) => {
      if (q && !e.resource_name.toLowerCase().includes(q)) return false;
      if (by && !(e.changed_by ?? "").toLowerCase().includes(by)) return false;
      if (tp && !e.resource_type.toLowerCase().includes(tp)) return false;
      return true;
    });
  }, [events, search, changedBySearch, typeSearch]);

  const groups = useMemo(() => buildGroups(filtered), [filtered]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

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
      const next = Math.min(800, Math.max(280, startWidth.current + delta));
      setPanelWidth(next);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const selectStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14 };
  const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14 };

  const totalCount = groups.reduce((s, g) => s + 1 + g.children.length, 0);

  const exportCSV = () => {
    const rows = [["리소스 이름", "유형", "작업", "변경자", "위험도", "일시 (KST)"]];
    for (const g of groups) {
      const all = [g.main, ...g.children];
      for (const e of all) {
        rows.push([
          e.resource_name,
          e.resource_type,
          e.operation,
          e.changed_by ?? "-",
          e.risk_level,
          toKST(e.changed_at),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `변경이력_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>CMDB — 변경 이력</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="리소스 이름" style={{ ...inputStyle, width: 160 }} />
          <input value={typeSearch} onChange={(e) => setTypeSearch(e.target.value)} placeholder="유형" style={{ ...inputStyle, width: 140 }} />
          <input value={changedBySearch} onChange={(e) => setChangedBySearch(e.target.value)} placeholder="변경자" style={{ ...inputStyle, width: 140 }} />
          <select value={opFilter} onChange={(e) => setOpFilter(e.target.value)} style={selectStyle}>
            <option value="">전체 작업</option>
            <option value="Create">Create</option>
            <option value="Update">Update</option>
            <option value="Delete">Delete</option>
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={selectStyle}>
            <option value="">전체 위험도</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="None">None</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: "#a0aec0", fontSize: 14 }}>~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          {(search || typeSearch || changedBySearch || dateFrom || dateTo || opFilter || riskFilter) && (
            <button
              onClick={() => { setSearch(""); setTypeSearch(""); setChangedBySearch(""); setDateFrom(""); setDateTo(""); setOpFilter(""); setRiskFilter(""); }}
              style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 13, color: "#718096" }}
            >
              전체 초기화
            </button>
          )}
          <span style={{ fontSize: 13, color: "#a0aec0", marginLeft: 4 }}>{totalCount}건 ({groups.length}그룹)</span>
          <button
            onClick={exportCSV}
            style={{ marginLeft: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, color: "#4a5568" }}
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: selected ? panelWidth + 16 : 0, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 220px)" }}>
          <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13 }}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f7fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ width: 40 }} />
                {["리소스 이름", "유형", "작업", "변경자", "위험도", "일시 (KST)"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#4a5568", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g.key}>
                  {/* 대표 행 */}
                  <tr
                    onClick={() => setSelected(g.main)}
                    style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer", background: selected?.id === g.main.id ? "#ebf8ff" : "transparent" }}
                  >
                    <td style={{ padding: "10px 8px 10px 16px", width: 24 }}>
                      {g.children.length > 0 && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); toggleExpand(g.key); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: "#718096", lineHeight: 1 }}
                        >
                          {expanded.has(g.key) ? "▼" : "▶"}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                      {g.main.resource_name}
                      {g.children.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "#fff", background: "#718096", borderRadius: 10, padding: "1px 6px" }}>
                          +{g.children.length}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#718096", fontSize: 12 }} title={g.main.resource_type}>{shortType(g.main.resource_type)}</td>
                    <td style={{ padding: "10px 16px" }}>{g.main.operation}</td>
                    <td style={{ padding: "10px 16px", color: "#718096", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.main.changed_by ?? "-"}>{shortUser(g.main.changed_by)}</td>
                    <td style={{ padding: "10px 16px" }}><RiskBadge level={g.main.risk_level} /></td>
                    <td style={{ padding: "10px 16px", color: "#718096", whiteSpace: "nowrap" }}>{toKST(g.main.changed_at)}</td>
                  </tr>

                  {/* 연관 이벤트 (확장 시) */}
                  {expanded.has(g.key) && g.children.map((child) => (
                    <tr
                      key={child.id}
                      onClick={() => setSelected(child)}
                      style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer", background: selected?.id === child.id ? "#ebf8ff" : "#f7fafc" }}
                    >
                      <td style={{ padding: "8px 8px 8px 16px" }} />
                      <td style={{ padding: "8px 16px", color: "#4a5568" }}>
                        <span style={{ marginRight: 6, color: "#cbd5e0" }}>└</span>
                        {child.resource_name}
                      </td>
                      <td style={{ padding: "8px 16px", color: "#718096", fontSize: 12 }} title={child.resource_type}>{shortType(child.resource_type)}</td>
                      <td style={{ padding: "8px 16px", color: "#718096" }}>{child.operation}</td>
                      <td style={{ padding: "8px 16px", color: "#718096", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={child.changed_by ?? "-"}>{shortUser(child.changed_by)}</td>
                      <td style={{ padding: "8px 16px" }}><RiskBadge level={child.risk_level} /></td>
                      <td style={{ padding: "8px 16px", color: "#718096", whiteSpace: "nowrap" }}>{toKST(child.changed_at)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {groups.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "#a0aec0" }}>
              {events.length > 0 ? "검색 결과가 없습니다." : "변경 이력이 없습니다."}
            </div>
          )}
        </div>

        {/* 상세 패널 */}
        {selected && (
          <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: panelWidth, background: "#fff", boxShadow: "-4px 0 16px rgba(0,0,0,0.12)", overflowY: "auto", zIndex: 99 }}>
            <div
              onMouseDown={onMouseDown}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", background: "linear-gradient(to right, #e2e8f0, #cbd5e0)", zIndex: 1, transition: "background 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#a0aec0")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "linear-gradient(to right, #e2e8f0, #cbd5e0)")}
            />
            <div style={{ padding: 20, paddingLeft: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>상세 정보</h3>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#718096" }}>✕</button>
              </div>
              <Field label="리소스 이름" value={selected.resource_name} />
              <Field label="유형" value={selected.resource_type} />
              <Field label="작업" value={selected.operation} />
              <Field label="변경자" value={selected.changed_by ?? "-"} />
              <Field label="일시 (KST)" value={toKST(selected.changed_at)} />
              <Field label="위험도" value={<RiskBadge level={selected.risk_level} />} />
              {selected.risk_reason && <Field label="위험 사유" value={selected.risk_reason} />}
              {selected.diff && (
                <>
                  <div style={{ fontSize: 12, color: "#718096", marginTop: 16, marginBottom: 4 }}>변경 사항</div>
                  {selected.diff.description && (
                    <div style={{ background: "#ebf8ff", border: "1px solid #bee3f8", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#2b6cb0" }}>
                      {selected.diff.description}
                    </div>
                  )}
                  {selected.diff.operation_detail && (
                    <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 8, wordBreak: "break-all" }}>
                      {selected.diff.operation_detail}
                    </div>
                  )}
                  {selected.diff.state_changes && selected.diff.state_changes.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: "#718096", marginTop: 12, marginBottom: 6 }}>설정 변경 내역</div>
                      {selected.diff.state_changes.map((change: any, i: number) => (
                        <div key={i} style={{ marginBottom: 8, background: "#f7fafc", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: "#4a5568", marginBottom: 4 }}>{change.field}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 10, color: "#a0aec0", marginBottom: 2 }}>이전</div>
                              <div style={{ background: "#fed7d7", borderRadius: 4, padding: "3px 6px", color: "#c53030", wordBreak: "break-all" }}>
                                {JSON.stringify(change.before) ?? "-"}
                              </div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 10, color: "#a0aec0", marginBottom: 2 }}>이후</div>
                              <div style={{ background: "#c6f6d5", borderRadius: 4, padding: "3px 6px", color: "#276749", wordBreak: "break-all" }}>
                                {JSON.stringify(change.after) ?? "-"}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function shortType(type: string) {
  return type.split("/").pop() ?? type;
}

function shortUser(user: string | null | undefined) {
  if (!user) return "-";
  return user.includes("@") ? user.split("@")[0] : user;
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#a0aec0", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}
