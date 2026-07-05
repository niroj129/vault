"use client";

import { useCallback, useEffect, useState } from "react";
import ExportButton from "../../../components/admin/ExportButton";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Transactions() {
  const { token } = useAuth();
  const [date, setDate] = useState("");
  const [rep, setRep] = useState(null);

  const load = useCallback((d) => {
    const q = d ? `?date=${d}` : "";
    apiFetch(`/reports/shift/${q}`, { token }).then((r) => { setRep(r); setDate(r.date); }).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (!rep) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="toolbar">
        <div>
          <label style={{ margin: 0, display: "flex", gap: ".6em", alignItems: "center" }}>
            <span>📆 Date (Nepal)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto", margin: 0 }} />
            <button className="btn btn-primary sm" onClick={() => load(date)}>View</button>
          </label>
        </div>
        <ExportButton resource="gametxns" label="Export All Transactions" />
      </div>

      <div className="wgrid">
        <div className="wcard gold"><div className="ic">💵</div><div><div className="v">${money(rep.total_loads)}</div><div className="l">Total Loads</div></div></div>
        <div className="wcard"><div className="ic">💸</div><div><div className="v">${money(rep.total_withdraws)}</div><div className="l">Total Withdraws</div></div></div>
        <div className="wcard violet"><div className="ic">📊</div><div><div className="v">${money(rep.net)}</div><div className="l">Net</div></div></div>
        <div className="wcard"><div className="ic">🧾</div><div><div className="v">{rep.count}</div><div className="l">Transactions</div></div></div>
      </div>

      {Object.entries(rep.shifts).map(([label, s]) => (
        <div key={label} className="card" style={{ padding: "1.4rem", marginBottom: "1.2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".5rem" }}>
            <h3 style={{ margin: 0 }}>🕐 {label}</h3>
            <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
              <span className="small">Loads <b className="gold">${money(s.loads)}</b></span>
              <span className="small">Withdraws <b>${money(s.withdraws)}</b></span>
              <span className="small">Net <b style={{ color: s.net >= 0 ? "var(--ok)" : "var(--danger)" }}>${money(s.net)}</b></span>
              <span className="small muted">{s.count} txns</span>
            </div>
          </div>

          {Object.keys(s.by_method).length > 0 && (
            <div style={{ display: "flex", gap: ".5em", flexWrap: "wrap", margin: ".8rem 0" }}>
              {Object.entries(s.by_method).map(([m, v]) => (
                <span key={m} className="badge">{m}: <b className="gold">+${money(v.load)}</b> / −${money(v.withdraw)}</span>
              ))}
            </div>
          )}

          {s.txns.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead><tr><th>Type</th><th>Account</th><th>Amount</th><th>Method</th><th>Operator</th><th>Order</th><th>Time</th></tr></thead>
                <tbody>
                  {s.txns.map((t) => (
                    <tr key={t.id}>
                      <td><span className={`badge ${t.kind === "load" ? "ok" : "off"}`}>{t.kind}</span></td>
                      <td><b>{t.account_name || t.platform_user_id || "—"}</b></td>
                      <td className={t.kind === "load" ? "gold" : ""}>${money(t.amount)}</td>
                      <td>{t.payment_method || "—"}</td>
                      <td className="muted small">{t.operator || "—"}</td>
                      <td className="muted small">{t.order_id || "—"}</td>
                      <td className="muted small">{(t.created_at || "").slice(11, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted small">No transactions in this shift.</p>}
        </div>
      ))}
    </div>
  );
}
