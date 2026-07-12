"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const num = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function AdminOverview() {
  const { token } = useAuth();
  const [s, setS] = useState(null);
  const [top, setTop] = useState([]);

  useEffect(() => {
    if (token) {
      apiFetch("/stats/admin/", { token }).then(setS).catch(() => {});
      apiFetch("/stats/top-games/", { token }).then(setTop).catch(() => {});
    }
  }, [token]);

  if (!s) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="wgrid">
        <W ic="👥" v={s.players} l="Players" cls="violet" />
        <W ic="🎮" v={`${s.active_games}/${s.total_games}`} l="Active Games" />
        <W ic="💵" v={`$${num(s.today_loads)}`} l="Loads Today" cls="gold" />
        <W ic="💸" v={`$${num(s.today_withdraws)}`} l="Withdraws Today" />
        <W ic="🕐" v={(s.current_shift || "").split(" ")[0]} l={`Shift · ${(s.current_shift || "").match(/\((.*)\)/)?.[1] || ""}`} cls="violet" />
        <W ic="📡" v={s.low_points} l="Low-Point Games" cls={s.low_points ? "warn" : ""} />
        <W ic="💬" v={s.unread_chats} l="Unread Chats" cls={s.unread_chats ? "warn" : ""} />
      </div>

      <div className="card" style={{ padding: "1.6rem" }}>
        <h3>🏆 Today's Winner</h3>
        {s.latest_winner ? (
          <div style={{ display: "flex", flexDirection: "column", gap: ".4em", marginTop: ".5rem" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{s.latest_winner.name}</div>
            <div className="gold" style={{ fontSize: "1.6rem", fontWeight: 800 }}>${num(s.latest_winner.amount)}</div>
            <div className="muted small">{s.latest_winner.game} · {s.latest_winner.win_date}</div>
            <Link href="/admin/winners" className="btn btn-secondary sm" style={{ width: "fit-content", marginTop: ".5rem" }}>Manage Winners</Link>
          </div>
        ) : <p className="muted">No winner yet. <Link href="/admin/winners" className="gold">Add one →</Link></p>}
      </div>

      {top.length > 0 && (
        <div className="card" style={{ padding: "1.6rem", marginTop: "1.4rem" }}>
          <h3>🔥 Top Games (by plays)</h3>
          <table className="dtable"><thead><tr><th>Game</th><th>Plays</th><th>Views</th></tr></thead>
            <tbody>{top.map((g) => (
              <tr key={g.slug}><td><b>{g.name}</b></td><td>{g.clicks}</td><td>{g.views}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", marginTop: "1.4rem" }}>
        {[["/admin/gameplatform", "🎯", "Game Platform"], ["/admin/transactions", "📆", "Transactions"],
          ["/admin/merchants", "🏪", "Merchants"], ["/admin/payorders", "🧾", "Payment Orders"],
          ["/admin/chat", "💬", "Chat"], ["/admin/settlement", "📒", "Settlement"]].map(([h, i, l]) => (
          <Link key={h} href={h} className="tile"><span className="emoji">{i}</span><b>{l}</b></Link>
        ))}
      </div>
    </div>
  );
}

const W = ({ ic, v, l, cls }) => (
  <div className={`wcard ${cls || ""}`}><div className="ic">{ic}</div><div><div className="v">{v}</div><div className="l">{l}</div></div></div>
);
