"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

export default function AdminWallets() {
  const { token } = useAuth();
  const [players, setPlayers] = useState([]);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiFetch("/users/", { token }).then((u) => setPlayers(u.filter((x) => x.role === "user"))).catch(() => {});
  }, [token]);

  async function adjust(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const sign = f.get("direction") === "debit" ? -1 : 1;
    try {
      const r = await apiFetch("/wallet/adjust/", { method: "POST", token, body: {
        user: f.get("user"), amount: sign * Number(f.get("amount")),
        kind: f.get("kind"), note: f.get("note"),
      } });
      setResult(r.balance); setMsg("Wallet updated ✔"); e.target.reset();
    } catch (err) { setMsg(err.data?.detail || "Failed"); }
  }

  return (
    <div>
      <p className="muted small" style={{ marginBottom: "1rem" }}>Credit or debit a player's wallet. Every change is logged as a transaction and notifies the player.</p>
      <form className="card" style={{ padding: "1.6rem", maxWidth: 520 }} onSubmit={adjust}>
        <h3>👛 Adjust Wallet</h3>
        {msg && <div className="alert ok small">{msg}{result != null && ` — new balance $${result}`}</div>}
        <label>Player
          <select name="user" required>
            <option value="">— select —</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.username} ({p.full_name})</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label>Direction
            <select name="direction"><option value="credit">Credit (+)</option><option value="debit">Debit (−)</option></select>
          </label>
          <label>Amount<input name="amount" type="number" step="0.01" required /></label>
          <label>Type
            <select name="kind"><option value="load">Load</option><option value="cashout">Cashout</option><option value="bonus">Bonus</option><option value="adjust">Adjustment</option></select>
          </label>
          <label>Note<input name="note" /></label>
        </div>
        <button className="btn btn-primary" style={{ marginTop: ".6rem" }}>Apply</button>
      </form>
    </div>
  );
}
