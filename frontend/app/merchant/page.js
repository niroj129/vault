"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getJSONSafe } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { WidgetSkeleton } from "../../components/Skeleton";

const money = (cents) => `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateCls = (s) => (s === 2 ? "ok" : [3, 4, 6, 7].includes(s) ? "warn" : "");

export default function MerchantDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ways, setWays] = useState([]);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(() => {
    apiFetch("/pay/stats/", { token }).then(setStats).catch(() => {});
    apiFetch("/pay-orders/", { token }).then(setOrders).catch(() => {});
  }, [token]);
  useEffect(() => {
    load();
    getJSONSafe("/settings/", {}).then((s) => setWays((s.pay_enabled_waycodes || "").split(",").map((w) => w.trim()).filter(Boolean)));
  }, [load]);

  async function createLink(e) {
    e.preventDefault();
    setMsg(""); setResult(null);
    const f = new FormData(e.target);
    try {
      const r = await apiFetch("/pay/create/", { method: "POST", token, body: {
        amount: f.get("amount"), way_code: f.get("way_code"),
        client_id: f.get("client_id"), ext_param: f.get("ext_param"),
      } });
      setResult(r); load();
    } catch (err) { setMsg(err.data?.detail || err.message); }
  }

  async function refresh(o) {
    try { await apiFetch("/pay/query/", { method: "POST", token, body: { mch_order_no: o.mch_order_no } }); load(); }
    catch (err) { setMsg(err.data?.detail || err.message); }
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div>
      {stats ? (
        <div className="wgrid stagger">
          <div className="wcard gold"><div className="ic">💰</div><div><div className="v">{money(stats.collected)}</div><div className="l">Collected (paid)</div></div></div>
          <div className="wcard violet"><div className="ic">🟢</div><div><div className="v">{money(stats.my_net)}</div><div className="l">My Net</div></div></div>
          {!stats.is_sub && <div className="wcard"><div className="ic">🏦</div><div><div className="v">{money(stats.sub_earnings)}</div><div className="l">From Sub-Merchants</div></div></div>}
          <div className="wcard"><div className="ic">🧾</div><div><div className="v">{stats.paid}/{stats.orders}</div><div className="l">Paid / Orders</div></div></div>
        </div>
      ) : <WidgetSkeleton count={4} />}

      <div className="grid two">
        <form className="card" style={{ padding: "1.6rem" }} onSubmit={createLink}>
          <h3>➕ Create Payment Link</h3>
          {msg && <div className="alert err small">{msg}</div>}
          <div className="form-grid">
            <label>Amount ($)<input name="amount" type="number" step="0.01" required /></label>
            <label>Payment Method
              <select name="way_code" required>{ways.map((w) => <option key={w} value={w}>{w}</option>)}</select>
            </label>
            <label>Player ID / handle<input name="client_id" placeholder="optional" /></label>
            <label>Note (extParam)<input name="ext_param" placeholder="optional" /></label>
          </div>
          <button className="btn btn-primary" style={{ marginTop: ".6rem" }}>Generate Link</button>
          {result?.cashierUrl && (
            <div className="alert ok" style={{ marginTop: "1rem" }}>
              <b>Payment link ready — send this to the player:</b>
              <div style={{ display: "flex", gap: ".5em", marginTop: ".5rem" }}>
                <input readOnly value={result.cashierUrl} />
                <button type="button" className="btn btn-primary sm" onClick={() => copy(result.cashierUrl, "new")}>{copied === "new" ? "Copied!" : "Copy"}</button>
              </div>
            </div>
          )}
        </form>

        <div className="card" style={{ padding: "1.6rem" }}>
          <h3>ℹ️ How it works</h3>
          <p className="muted small">Generate a payment link, copy it, and send it to your player. When they pay, the order flips to <b>Success</b> automatically. Your fee and net are recorded per order.</p>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "1.4rem" }}><h3 style={{ margin: 0 }}>Payment Orders</h3></div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr><th>Order</th><th>Amount</th><th>Method</th><th>Status</th><th>Net</th><th>Link</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="muted small">{o.mch_order_no}{o.merchant_name && stats && o.merchant !== undefined ? "" : ""}</td>
                <td>{money(o.amount)}</td>
                <td>{o.way_code}</td>
                <td><span className={`badge ${stateCls(o.state)}`}>{o.state_label}</span></td>
                <td className="gold">{money(o.net_amount)}</td>
                <td>{o.cashier_url ? <button className="ibtn" title="Copy link" onClick={() => copy(o.cashier_url, o.id)}>{copied === o.id ? "✓" : "🔗"}</button> : "—"}</td>
                <td><button className="ibtn" title="Refresh status" onClick={() => refresh(o)}>🔄</button></td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan="7" className="muted center" style={{ padding: "1.5rem" }}>No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
