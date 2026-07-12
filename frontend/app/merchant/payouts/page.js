"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getJSONSafe } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

const money = (c) => `$${(Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateCls = (s) => (s === 2 ? "ok" : [3, 4, 6].includes(s) ? "warn" : "");

// which wayParam fields each payout method needs
const PARAMS = {
  ecashapp: [["cashtag", "CashApp $cashtag"]],
  paypal: [["email", "PayPal email"]],
  venmo: [["email", "Venmo email"]],
  zelle: [["zelleSign", "Zelle email or phone"]],
  chime: [["chimeSign", "Chime account"]],
  card: [["cardNumber", "Card number"], ["cardExpiry", "Expiry MM/YY"]],
  ach: [["accountNumber", "Account number"], ["routingNumber", "Routing number"]],
};

export default function Payouts() {
  const { token } = useAuth();
  const [ways, setWays] = useState([]);
  const [way, setWay] = useState("");
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    apiFetch("/transfer-orders/", { token }).then(setOrders).catch(() => {});
  }, [token]);
  useEffect(() => {
    load();
    getJSONSafe("/settings/", {}).then((s) => {
      const w = (s.pay_transfer_waycodes || "").split(",").map((x) => x.trim()).filter(Boolean);
      setWays(w); setWay(w[0] || "");
    });
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    const f = new FormData(e.target);
    const way_param = {};
    (PARAMS[way] || []).forEach(([k]) => { way_param[k] = f.get(k); });
    try {
      const r = await apiFetch("/transfer/create/", { method: "POST", token, body: {
        amount: f.get("amount"), way_code: way, reason: f.get("reason"), way_param,
      } });
      setMsg(r.ok ? "✅ Payout submitted." : `⚠️ ${r.message}`); e.target.reset(); load();
    } catch (err) { setMsg(err.data?.detail || err.message); }
  }

  return (
    <div>
      <div className="grid two">
        <form className="card" style={{ padding: "1.6rem" }} onSubmit={submit}>
          <h3>💸 Send Payout</h3>
          {msg && <div className={`alert ${msg.startsWith("✅") ? "ok" : "err"} small`}>{msg}</div>}
          <div className="form-grid">
            <label>Amount ($)<input name="amount" type="number" step="0.01" required /></label>
            <label>Method
              <select value={way} onChange={(e) => setWay(e.target.value)}>{ways.map((w) => <option key={w} value={w}>{w}</option>)}</select>
            </label>
            {(PARAMS[way] || [["destination", "Destination"]]).map(([k, label]) => (
              <label key={k}>{label}<input name={k} required /></label>
            ))}
            <label>Reason<input name="reason" placeholder="withdrawal / refund" /></label>
          </div>
          <button className="btn btn-primary" style={{ marginTop: ".6rem" }}>Send Payout</button>
        </form>
        <div className="card" style={{ padding: "1.6rem" }}>
          <h3>ℹ️ Payouts</h3>
          <p className="muted small">Send money out to a player via CashApp, Zelle, PayPal, and more. Status updates automatically once the gateway processes it.</p>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "1.4rem" }}><h3 style={{ margin: 0 }}>Payout Orders</h3></div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr><th>Order</th><th>Amount</th><th>Method</th><th>Status</th><th>Reason</th><th>Date</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="muted small">{o.mch_order_no}</td>
                <td>{money(o.amount)}</td>
                <td>{o.way_code}</td>
                <td><span className={`badge ${stateCls(o.state)}`}>{o.state_label}</span></td>
                <td className="muted small">{o.reason || "—"}</td>
                <td className="muted small">{(o.created_at || "").slice(0, 10)}</td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan="6" className="muted center" style={{ padding: "1.5rem" }}>No payouts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
