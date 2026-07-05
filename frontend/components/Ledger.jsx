"use client";

import { useState } from "react";

const KIND = {
  load: { icon: "💵", label: "Load" },
  cashout: { icon: "💸", label: "Cashout" },
  bonus: { icon: "🎁", label: "Bonus" },
  adjust: { icon: "⚙️", label: "Adjustment" },
};
const money = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** transactions: newest-first list; currentBalance: wallet balance now. */
export default function Ledger({ transactions = [], currentBalance = 0 }) {
  const [filter, setFilter] = useState("all");

  // running balance after each transaction (newest = current balance)
  let bal = Number(currentBalance);
  const withBal = transactions.map((t) => {
    const row = { ...t, balance_after: bal };
    bal -= Number(t.amount);
    return row;
  });
  const rows = filter === "all" ? withBal : withBal.filter((t) => t.kind === filter);

  if (!transactions.length) return <p className="muted small">No transactions yet.</p>;

  return (
    <div>
      <div className="ledger-toolbar">
        {["all", "load", "cashout", "bonus", "adjust"].map((k) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {k === "all" ? "All" : `${KIND[k].icon} ${KIND[k].label}`}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="ledger">
          <thead><tr><th>Type</th><th>Note</th><th>Date</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
          <tbody>
            {rows.map((t) => {
              const pos = Number(t.amount) >= 0;
              return (
                <tr key={t.id}>
                  <td><span className="kind">{(KIND[t.kind] || KIND.adjust).icon} {(KIND[t.kind] || KIND.adjust).label}</span></td>
                  <td className="muted small">{t.note || "—"}</td>
                  <td className="muted small">{(t.created_at || "").slice(0, 10)}</td>
                  <td style={{ textAlign: "right" }} className={pos ? "amt-pos" : "amt-neg"}>{pos ? "+" : "−"}${money(Math.abs(t.amount))}</td>
                  <td style={{ textAlign: "right" }} className="bal">${money(t.balance_after)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
