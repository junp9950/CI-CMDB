import React, { useEffect, useState } from "react";
import api from "../../api/client";
import { NotificationConfig } from "../../types";

const EMPTY_FORM = { name: "", webhook_type: "teams", webhook_url: "", min_risk_level: "Medium", enabled: true };

export default function Settings() {
  const [configs, setConfigs] = useState<NotificationConfig[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = () => api.get<NotificationConfig[]>("/notifications").then((r) => setConfigs(r.data));
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await api.put(`/notifications/${editId}`, form);
    } else {
      await api.post("/notifications", form);
    }
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    load();
  };

  const handleEdit = (cfg: NotificationConfig) => {
    setEditId(cfg.id);
    setForm({ name: cfg.name, webhook_type: cfg.webhook_type, webhook_url: cfg.webhook_url, min_risk_level: cfg.min_risk_level, enabled: cfg.enabled });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("삭제하시겠습니까?")) {
      await api.delete(`/notifications/${id}`);
      load();
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await api.post("/notifications/test", { config_id: id });
      alert(JSON.stringify(r.data.results, null, 2));
    } catch (e: any) {
      alert("오류: " + e.message);
    }
    setTesting(null);
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>알림 설정</h2>

      <div style={{ background: "#fff", borderRadius: 8, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: 32 }}>
        <h3 style={{ margin: "0 0 16px" }}>{editId ? "Webhook 수정" : "Webhook 추가"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label>
            <div style={labelStyle}>이름</div>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <div style={labelStyle}>유형</div>
            <select value={form.webhook_type} onChange={(e) => setForm({ ...form, webhook_type: e.target.value })} style={inputStyle}>
              <option value="teams">Teams</option>
              <option value="slack">Slack</option>
            </select>
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <div style={labelStyle}>Webhook URL</div>
            <input required value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
          </label>
          <label>
            <div style={labelStyle}>최소 위험도</div>
            <select value={form.min_risk_level} onChange={(e) => setForm({ ...form, min_risk_level: e.target.value })} style={inputStyle}>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            <span style={{ fontSize: 14 }}>활성화</span>
          </label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <button type="submit" style={{ padding: "8px 20px", background: "#3182ce", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
              {editId ? "수정" : "추가"}
            </button>
            {editId && (
              <button type="button" onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM }); }} style={{ padding: "8px 20px", background: "#e2e8f0", border: "none", borderRadius: 6, cursor: "pointer" }}>
                취소
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f7fafc", borderBottom: "1px solid #e2e8f0" }}>
              {["이름", "유형", "최소 위험도", "활성화", ""].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#4a5568" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg) => (
              <tr key={cfg.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "10px 16px", fontWeight: 600 }}>{cfg.name}</td>
                <td style={{ padding: "10px 16px" }}>{cfg.webhook_type}</td>
                <td style={{ padding: "10px 16px" }}>{cfg.min_risk_level}</td>
                <td style={{ padding: "10px 16px" }}>{cfg.enabled ? "✅" : "—"}</td>
                <td style={{ padding: "10px 16px", display: "flex", gap: 8 }}>
                  <button onClick={() => handleTest(cfg.id)} disabled={testing === cfg.id} style={btnStyle("#38a169")}>
                    {testing === cfg.id ? "..." : "테스트"}
                  </button>
                  <button onClick={() => handleEdit(cfg)} style={btnStyle("#3182ce")}>수정</button>
                  <button onClick={() => handleDelete(cfg.id)} style={btnStyle("#e53e3e")}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configs.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#a0aec0" }}>등록된 알림 설정이 없습니다.</div>}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#718096", marginBottom: 4 };
const btnStyle = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12 });
