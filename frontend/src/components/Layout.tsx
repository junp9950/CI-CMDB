import React from "react";
import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "대시보드" },
  { to: "/resources", label: "CIDB (리소스)" },
  { to: "/changes", label: "CMDB (변경 이력)" },
  { to: "/settings", label: "알림 설정" },
];

const RISK_COLOR: Record<string, string> = {
  High: "#e53e3e",
  Medium: "#dd6b20",
  Low: "#d69e2e",
  None: "#718096",
};

export { RISK_COLOR };

export default function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <nav style={{ width: 200, background: "#1a202c", color: "#fff", padding: "24px 0" }}>
        <div style={{ padding: "0 20px 24px", fontWeight: 700, fontSize: 16 }}>
          Azure CIDB/CMDB
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              display: "block",
              padding: "10px 20px",
              color: isActive ? "#63b3ed" : "#cbd5e0",
              textDecoration: "none",
              background: isActive ? "#2d3748" : "transparent",
              borderLeft: isActive ? "3px solid #63b3ed" : "3px solid transparent",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 32, background: "#f7fafc", overflowY: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
