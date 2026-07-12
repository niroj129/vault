"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

const money = (c) => `$${(Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateCls = (s) => (s === 2 ? "ok" : [3, 4, 6, 7].includes(s) ? "warn" : "");

export default function AdminPayOrders() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [tab, setTab] = useState("pay");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    apiFetch("/pay/stats/", { token }).then(setStats).catch(() => {});
    apiFetch("/pay-orders/", { token }).then(setOrders).catch(() => {});
    apiFetch("/transfer-orders/", { token }).then(setPayouts).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function refresh(o) {
    try { await apiFetch("/pay/query/", { method: "POST", token, body: { mch_order_no: o.mch_order_no } }); load(); } catch {}
  }
  async function close(o) {
    if (!confirm("Close this order?")) return;
    try { await apiFetch("/pay/close/", { method: "POST", token, body: { mch_order_no: o.mch_order_no } }); load(); } catch {}
  }

  const rows = (tab === "pay" ? orders : payouts).filter((o) =>
    !q || o.mch_order_no.toLowerCase().includes(q.toLowerCase()) || (o.merchant_name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      {stats && (
        <div className="wgrid">
          <div className="wcard gold"><div className="ic">🏦</div><div><div className="v">{money(stats.platform_revenue)}</div><div className="l">Platform Revenue</div></div></div>
          <div className="wcard violet"><div className="ic">💰</div><div><div className="v">{money(stats.gross)}</div><div className="l">Gross Collected</div></div></div>
          <div className="wcard"><div className="ic">🧾</div><div><div className="v">{stats.paid}/{stats.orders}</div><div className="l">Paid / Orders</div></div></div>
          <div className="wcard"><div className="ic">🏪</div><div><div className="v">{stats.merchants}</div><div className="l">Merchants</div></div></div>
        </div>
      )}

      <div className="toolbar">
        <div className="ledger-toolbar" style={{ margin: 0 }}>
          <button className={tab === "pay" ? "on" : ""} onClick={() => setTab("pay")}>Payments</button>
          <button className={tab === "transfer" ? "on" : ""} onClick={() => setTab("transfer")}>Payouts</button>
        </div>
        <input placeholder="Search order / merchant…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: 0, width: 220 }} />
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr><th>Order</th><th>Merchant</th><th>Amount</th><th>Method</th><th>Status</th>
            {tab === "pay" && <><th>Platform</th><th>Net</th></>}<th></th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="muted small">{o.mch_order_no}</td>
                <td>{o.merchant_name}</td>
                <td>{money(o.amount)}</td>
                <td>{o.way_code}</td>
                <td><span className={`badge ${stateCls(o.state)}`}>{o.state_label}</span></td>
                {tab === "pay" && <><td className="gold">{money(o.platform_amount)}</td><td>{money(o.net_amount)}</td></>}
                <td><div className="row-btns">
                  <button className="ibtn" title="Refresh" onClick={() => refresh(o)}>🔄</button>
                  {tab === "pay" && o.state < 2 && <button className="ibtn danger" title="Close" onClick={() => close(o)}>✕</button>}
                </div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={tab === "pay" ? 8 : 6} className="muted center" style={{ padding: "1.5rem" }}>No orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
