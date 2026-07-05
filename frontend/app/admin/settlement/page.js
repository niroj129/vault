"use client";

import { useEffect, useState } from "react";
import ExportButton from "../../../components/admin/ExportButton";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdminSettlement() {
  const { token } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { if (token) apiFetch("/stats/settlement/", { token }).then(setD).catch(() => {}); }, [token]);
  if (!d) return <div className="muted">Loading…</div>;

  return (
    <div>
      <p className="muted small" style={{ marginBottom: "1rem" }}>All-time ledger settlement — every load, cashout and bonus since day one.</p>
      <div className="wgrid">
        <div className="wcard"><div className="ic">💵</div><div><div className="v">${money(d.totals.load)}</div><div className="l">All-time Loads</div></div></div>
        <div className="wcard gold"><div className="ic">🎁</div><div><div className="v">${money(d.totals.bonus)}</div><div className="l">All-time Bonuses</div></div></div>
        <div className="wcard"><div className="ic">💸</div><div><div className="v">${money(d.all_time_cashouts)}</div><div className="l">All-time Cashouts</div></div></div>
        <div className="wcard warn"><div className="ic">⏳</div><div><div className="v">${money(d.pending_cashouts)}</div><div className="l">Pending Cashouts</div></div></div>
        <div className="wcard violet"><div className="ic">🏦</div><div><div className="v">${money(d.net_liability)}</div><div className="l">Player Balances (liability)</div></div></div>
        <div className="wcard"><div className="ic">📈</div><div><div className="v">${money(d.total_profit)}</div><div className="l">Total Profit Logged</div></div></div>
      </div>

      <div className="toolbar"><h3 style={{ margin: 0 }}>Per-Player Balances</h3><ExportButton resource="transactions" label="Export Ledger" /></div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr><th>Player</th><th>Tier</th><th>Loyalty</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
          <tbody>
            {d.players.map((p) => (
              <tr key={p.player}><td><b>{p.player}</b></td><td><span className={`tier ${p.tier}`}>{p.tier}</span></td>
                <td>{p.loyalty} pts</td><td style={{ textAlign: "right" }} className="gold">${money(p.balance)}</td></tr>
            ))}
            {!d.players.length && <tr><td colSpan="4" className="muted center" style={{ padding: "1.5rem" }}>No player wallets yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
