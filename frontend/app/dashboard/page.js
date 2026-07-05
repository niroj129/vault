"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Protected from "../../components/Protected";
import GameCard from "../../components/GameCard";
import Ledger from "../../components/Ledger";
import RecentlyViewed from "../../components/RecentlyViewed";
import { apiFetch, SITE_URL } from "../../lib/api";
import { useAuth } from "../../lib/auth";

function Dashboard() {
  const { user, token } = useAuth();
  const [me, setMe] = useState(user);
  const [msg, setMsg] = useState("");
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [favs, setFavs] = useState([]);
  const [board, setBoard] = useState([]);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = () => {
    apiFetch("/wallet/me/", { token }).then(setWallet).catch(() => {});
    apiFetch("/favorites/", { token }).then(setFavs).catch(() => {});
    apiFetch("/auth/me/", { token }).then(setMe).catch(() => {});
    apiFetch("/stats/leaderboard/", { token }).then(setBoard).catch(() => {});
  };
  useEffect(() => { refresh(); }, [token]);

  const refLink = `${SITE_URL}/?ref=${me.referral_code || ""}`;

  async function redeem(e) {
    e.preventDefault();
    const code = new FormData(e.target).get("code");
    try { const r = await apiFetch("/promos/redeem/", { method: "POST", token, body: { code } }); setNotice(`🎁 ${r.title} — an agent will apply your bonus!`); e.target.reset(); }
    catch (err) { setNotice(err.data?.detail || "Invalid code."); }
  }
  async function requestCashout(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await apiFetch("/cashouts/request/", { method: "POST", token, body: { amount: f.get("amount"), method: f.get("method") } }); setNotice("💸 Cashout request sent! An agent will process it shortly."); e.target.reset(); refresh(); }
    catch (err) { setNotice(err.data?.detail || "Could not request cashout."); }
  }
  async function changePw(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get("new_password") !== f.get("confirm")) { setMsg("New passwords do not match."); return; }
    try { await apiFetch("/auth/change-password/", { method: "POST", token, body: { current_password: f.get("current_password"), new_password: f.get("new_password") } }); setMsg("Password updated ✔"); e.target.reset(); }
    catch (err) { setMsg(err.message || "Could not update password."); }
  }

  return (
    <section className="wrap section">
      <div className="head" style={{ alignItems: "center" }}>
        <h2>Welcome, {me.full_name || me.username}</h2>
        <span className={`tier ${me.vip_tier}`}>👑 {me.vip_tier} member</span>
      </div>
      {notice && <div className="alert ok">{notice}</div>}

      <div className="wgrid">
        <div className="wcard gold"><div className="ic">💰</div><div><div className="v">${Number(wallet.balance).toLocaleString()}</div><div className="l">Wallet Balance</div></div></div>
        <div className="wcard violet"><div className="ic">⭐</div><div><div className="v">{me.loyalty_points ?? 0}</div><div className="l">Loyalty Points</div></div></div>
        <div className="wcard"><div className="ic">🎁</div><div><div className="v">{me.referral_count ?? 0}</div><div className="l">Referrals</div></div></div>
        <div className="wcard"><div className="ic">❤️</div><div><div className="v">{favs.length}</div><div className="l">Favorites</div></div></div>
      </div>

      <div className="grid two">
        <div className="card" style={{ padding: "1.6rem" }}>
          <h3>💳 Wallet Ledger</h3>
          <Ledger transactions={wallet.transactions} currentBalance={wallet.balance} />
        </div>
        <div style={{ display: "grid", gap: "1.4rem", alignContent: "start" }}>
          <form className="card" style={{ padding: "1.6rem" }} onSubmit={redeem}>
            <h3>🎁 Redeem Bonus Code</h3>
            <div style={{ display: "flex", gap: ".5em" }}>
              <input name="code" placeholder="Enter code…" required />
              <button className="btn btn-primary sm">Redeem</button>
            </div>
          </form>
          <form className="card" style={{ padding: "1.6rem" }} onSubmit={requestCashout}>
            <h3>💸 Request Cashout</h3>
            <div className="form-grid">
              <label>Amount<input name="amount" type="number" step="0.01" required /></label>
              <label>Method<input name="method" placeholder="CashApp, BTC…" /></label>
            </div>
            <button className="btn btn-primary sm">Request Cashout</button>
          </form>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: "1.4rem" }}>
        <div className="card" style={{ padding: "1.6rem" }}>
          <h3>🏅 Loyalty Leaderboard</h3>
          <table className="dtable"><tbody>
            {board.map((p, i) => (
              <tr key={p.username}><td>{["🥇", "🥈", "🥉"][i] || i + 1}</td><td><b>{p.username === me.username ? "You" : p.full_name || p.username}</b></td>
                <td><span className={`tier ${p.tier}`}>{p.tier}</span></td><td style={{ textAlign: "right" }} className="gold">{p.loyalty_points} pts</td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card" style={{ padding: "1.6rem" }}>
          <h3>🎁 Your Referral Link</h3>
          <p className="muted small">Share and earn credits when friends join.</p>
          <div style={{ display: "flex", gap: ".5em", marginTop: ".6rem" }}>
            <input readOnly value={refLink} />
            <button className="btn btn-primary sm" onClick={() => { navigator.clipboard.writeText(refLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <p className="muted small" style={{ marginTop: ".6rem" }}>Code: <b className="gold">{me.referral_code}</b></p>
        </div>
      </div>

      {favs.length > 0 && (
        <>
          <div className="head" style={{ marginTop: "1rem" }}><h2>❤️ Your Favorites</h2></div>
          <div className="grid games">{favs.map((f) => <GameCard key={f.id} game={f.game_detail} />)}</div>
        </>
      )}

      <RecentlyViewed />

      <div className="card" id="password" style={{ padding: "1.8rem", maxWidth: 460, marginTop: "1.5rem" }}>
        <h3>🔑 Change Password</h3>
        {msg && <div className="alert ok">{msg}</div>}
        <form onSubmit={changePw}>
          <label>Current Password<input name="current_password" type="password" required /></label>
          <label>New Password<input name="new_password" type="password" required minLength={6} /></label>
          <label>Confirm New Password<input name="confirm" type="password" required /></label>
          <button className="btn btn-primary">Update Password</button>
        </form>
      </div>
    </section>
  );
}

export default function Page() {
  return <Protected><Dashboard /></Protected>;
}
