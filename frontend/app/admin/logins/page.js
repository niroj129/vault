"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

export default function AdminLogins() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  useEffect(() => { if (token) apiFetch("/auth/logins/", { token }).then(setLogs).catch(() => {}); }, [token]);

  return (
    <div>
      <p className="muted small" style={{ marginBottom: "1rem" }}>Recent login activity (security log).</p>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr><th>User</th><th>Role</th><th>IP</th><th>Device</th><th>When</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}><td><b>{l.user}</b></td><td><span className={`badge ${l.role === "admin" ? "gold" : ""}`}>{l.role}</span></td>
                <td>{l.ip || "—"}</td><td className="muted small">{(l.user_agent || "").slice(0, 40)}</td>
                <td className="muted small">{(l.at || "").slice(0, 16).replace("T", " ")}</td></tr>
            ))}
            {!logs.length && <tr><td colSpan="5" className="muted center" style={{ padding: "1.5rem" }}>No logins recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
