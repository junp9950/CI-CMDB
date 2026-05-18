import React, { useEffect, useState } from "react";
import api from "../../api/client";
import { DashboardStats } from "../../types";
import RiskBadge from "../../components/RiskBadge";
import AdminLoginModal from "../../components/AdminLoginModal";
import { toKST } from "../../utils/time";
import { useAdmin } from "../../hooks/useAdmin";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingLog, setSyncingLog] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | "resource" | "activity">(null);
  const { isAdmin, login, logout } = useAdmin();

  const load = () => api.get<DashboardStats>("/dashboard").then((r) => setStats(r.data));
  useEffect(() => { load(); }, []);

  const requireAdmin = (action: "resource" | "activity") => {
    if (!isAdmin) {
      setPendingAction(action);
      setShowLogin(true);
    } else {
      action === "resource" ? handleSync() : handleActivityLogSync();
    }
  };

  const handleLoginSuccess = async (password: string) => {
    const ok = await login(password);
    if (ok && pendingAction) {
      pendingAction === "resource" ? handleSync() : handleActivityLogSync();
      setPendingAction(null);
    }
    return ok;
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/resources/sync");
      await load();
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) { logout(); setShowLogin(true); setPendingAction("resource"); }
    }
    setSyncing(false);
  };

  const handleActivityLogSync = async () => {
    setSyncingLog(true);
    try {
      const r = await api.post("/activity-log/sync?hours=720");
      setLastSync(`${r.data.imported}건 가져옴`);
      await load();
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) { logout(); setShowLogin(true); setPendingAction("activity"); }
      else setLastSync("오류 발생");
    }
    setSyncingLog(false);
  };

  if (!stats) return <p>로딩 중...</p>;

  return (
    <div>
      {showLogin && (
        <AdminLoginModal
          onLogin={handleLoginSuccess}
          onClose={() => { setShowLogin(false); setPendingAction(null); }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>대시보드</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 6, gap: 2 }}>
            {stats.last_synced_at && <span style={{ fontSize: 11, color: "#a0aec0" }}>마지막 동기화: {toKST(stats.last_synced_at)}</span>}
            {lastSync && <span style={{ fontSize: 12, color: "#718096" }}>{lastSync}</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: isAdmin ? "#68d391" : "#fc8181" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isAdmin ? "#68d391" : "#fc8181", display: "inline-block" }} />
              {isAdmin ? "Admin 로그인 중" : "비로그인"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => requireAdmin("activity")}
              disabled={syncingLog}
              style={{ background: "#805ad5", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 6, cursor: syncingLog ? "not-allowed" : "pointer", fontSize: 14, opacity: syncingLog ? 0.7 : 1 }}
            >
              {syncingLog ? "가져오는 중..." : "변경 이력 동기화"}
            </button>
            <span style={{ fontSize: 11, color: "#a0aec0" }}>Azure Activity Log 수집</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => requireAdmin("resource")}
              disabled={syncing}
              style={{ background: "#3182ce", color: "#fff", border: "none", padding: "8px 20px", borderRadius: 6, cursor: syncing ? "not-allowed" : "pointer", fontSize: 14, opacity: syncing ? 0.7 : 1 }}
            >
              {syncing ? "동기화 중..." : "리소스 동기화"}
            </button>
            <span style={{ fontSize: 11, color: "#a0aec0" }}>현재 리소스 목록 수집</span>
          </div>

          {isAdmin && (
            <button
              onClick={logout}
              style={{ background: "none", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#718096" }}
            >
              Admin 로그아웃
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <StatCard label="총 리소스" value={stats.total_resources} color="#3182ce" />
        <StatCard label="총 변경 이벤트" value={stats.total_changes} color="#805ad5" />
        <StatCard label="High Risk" value={stats.changes_by_risk["High"] ?? 0} color="#e53e3e" />
        <StatCard label="Medium Risk" value={stats.changes_by_risk["Medium"] ?? 0} color="#dd6b20" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <Card title="리소스 유형별">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {Object.entries(stats.resources_by_type).map(([type, count]) => (
                <tr key={type} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "8px 0", fontSize: 13, color: "#4a5568" }}>{type}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="최근 변경 이력">
          {stats.recent_changes.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{e.resource_name}</div>
                <div style={{ fontSize: 12, color: "#718096" }}>{e.operation} · {toKST(e.changed_at)}</div>
              </div>
              <RiskBadge level={e.risk_level} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderTop: `4px solid ${color}` }}>
      <div style={{ fontSize: 13, color: "#718096", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>{title}</h3>
      {children}
    </div>
  );
}
