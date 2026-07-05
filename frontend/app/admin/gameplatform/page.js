"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getJSONSafe } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

export default function GamePlatform() {
  const { token } = useAuth();
  const [status, setStatus] = useState(null);
  const [methods, setMethods] = useState([]);
  const [out, setOut] = useState(null);

  const loadStatus = useCallback(() => {
    apiFetch("/gameapi/status/", { token }).then(setStatus).catch(() => {});
  }, [token]);
  useEffect(() => { loadStatus(); getJSONSafe("/payment-methods/", []).then(setMethods); }, [loadStatus]);

  async function call(path, body, label) {
    setOut({ label, loading: true });
    try { const r = await apiFetch(path, { method: "POST", token, body }); setOut({ label, data: r }); loadStatus(); }
    catch (err) { setOut({ label, error: err.data?.detail || err.message }); }
  }

  const cfg = status?.configured;

  return (
    <div>
      <div className="wgrid">
        <div className={`wcard ${cfg ? "" : "warn"}`}><div className="ic">🔌</div><div><div className="v">{cfg ? "Connected" : "Not set"}</div><div className="l">Game API</div></div></div>
        <div className="wcard gold"><div className="ic">🏦</div><div><div className="v">{status?.agent_balance ?? "—"}</div><div className="l">Agent Balance</div></div></div>
      </div>
      {status && !cfg && <div className="alert err">Configure the Game API URL, Agent ID and Secret in <b>Settings</b> to enable these actions.</div>}
      {status?.error && <div className="alert err">API error: {status.error}</div>}

      <div className="grid two">
        <Panel title="➕ Create Player Account" fields={[["account", "Login name"], ["login_pwd", "Password"]]}
          onSubmit={(v) => call("/gameapi/add-user/", v, "Create player")} btn="Create Account" />
        <Panel title="🔎 Find Player ID" fields={[["account_name", "Login name"]]}
          onSubmit={(v) => call("/gameapi/get-user-id/", v, "Find player ID")} btn="Lookup" />

        <Panel title="💵 Load / Recharge" fields={[["account_name", "Login name (for record)"], ["user_id", "Player ID"], ["amount", "Amount", "number"]]}
          selectField={{ name: "payment_method", label: "Payment Method", options: methods.map((m) => m.name) }}
          onSubmit={(v) => call("/gameapi/recharge/", v, "Load")} btn="Load Account" accent />
        <Panel title="💸 Withdraw / Cashout" fields={[["account_name", "Login name (for record)"], ["user_id", "Player ID"], ["amount", "Amount", "number"]]}
          selectField={{ name: "payment_method", label: "Payment Method", options: methods.map((m) => m.name) }}
          onSubmit={(v) => call("/gameapi/withdraw/", v, "Withdraw")} btn="Withdraw" />

        <Panel title="💰 Player Balance" fields={[["user_id", "Player ID"]]}
          onSubmit={(v) => call("/gameapi/user-balance/", v, "Player balance")} btn="Check Balance" />
        <Panel title="🔑 Reset Password" fields={[["user_id", "Player ID"], ["login_pwd", "New password"]]}
          onSubmit={(v) => call("/gameapi/reset-password/", v, "Reset password")} btn="Reset" />

        <Panel title="🚪 Force Player Offline" fields={[["user_id", "Player ID"]]}
          onSubmit={(v) => call("/gameapi/player-offline/", v, "Force offline")} btn="Force Offline" />
        <Panel title="📉 Low-Balance Users" fields={[["query_date", "Date", "date"]]}
          onSubmit={(v) => call("/gameapi/low-deposit/", v, "Low-balance users")} btn="Fetch" />
      </div>

      {out && (
        <div className="card" style={{ padding: "1.4rem", marginTop: "1.4rem" }}>
          <h3>Result — {out.label}</h3>
          {out.loading ? <p className="muted">Calling platform…</p>
            : out.error ? <div className="alert err small">{out.error}</div>
            : <pre style={{ whiteSpace: "pre-wrap", fontSize: ".8rem", color: "var(--muted)" }}>{JSON.stringify(out.data, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

function Panel({ title, fields, selectField, onSubmit, btn, accent }) {
  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const v = {};
    fields.forEach(([n]) => (v[n] = f.get(n)));
    if (selectField) v[selectField.name] = f.get(selectField.name);
    onSubmit(v);
  }
  return (
    <form className="card" style={{ padding: "1.4rem" }} onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {fields.map(([n, label, type]) => (
        <label key={n}>{label}<input name={n} type={type || "text"} required={n !== "account_name"} /></label>
      ))}
      {selectField && (
        <label>{selectField.label}
          <select name={selectField.name}>{selectField.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        </label>
      )}
      <button className={`btn ${accent ? "btn-primary" : "btn-secondary"} full`}>{btn}</button>
    </form>
  );
}
