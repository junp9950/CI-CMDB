import React, { useState } from "react";

interface Props {
  onLogin: (password: string) => Promise<boolean>;
  onClose: () => void;
}

export default function AdminLoginModal({ onLogin, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await onLogin(password);
    if (!ok) setError("비밀번호가 틀렸습니다");
    else onClose();
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 32, width: 320, boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>Admin 로그인</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#718096" }}>이 기능은 관리자 전용입니다.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, boxSizing: "border-box", marginBottom: 8 }}
          />
          {error && <p style={{ color: "#e53e3e", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="submit"
              disabled={loading || !password}
              style={{ flex: 1, padding: "10px", background: "#805ad5", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
            >
              {loading ? "확인 중..." : "로그인"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: "10px", background: "#e2e8f0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
