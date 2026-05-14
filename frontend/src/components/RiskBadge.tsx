import React from "react";
import { RISK_COLOR } from "./Layout";

export default function RiskBadge({ level }: { level: string }) {
  return (
    <span
      style={{
        background: RISK_COLOR[level] || "#718096",
        color: "#fff",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {level}
    </span>
  );
}
