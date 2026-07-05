"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

export default function AdminPoints() {
  const { token } = useAuth();
  const [report, setReport] = useState(null);
  const [settings, setSettings] = useState(null);
  const [msg, setMsg] = useState("");
  const [edits, setEdits] = useState({});

  const load = useCallback(() => {
    apiFetch("/points/report/", { token }).then(setReport).catch(() => {});
    apiFetch("/settings/", { token }).then(setSettings).catch(() => {});
  }, [token]);
  useEffect(() => { if (token) load(); }, [token, load]);

  async function savePoints(row) {
    const e = edits[row.id] || {};
    try {
      await apiFetch(`/games/${row.slug}/`, {
        method: "PATCH", token,
        body: {
          sub_points: e.sub ?? row.sub_points,
          vendor_points: e.vendor ?? row.vendor_points,
        },
      });
      setMsg(`${row.name} points updated ✔`); load();
    } catch { setMsg("Update failed"); }
  }

  async function sendAlert(row) {
    setMsg("Sending…");
    try {
      const r = await apiFetch("/telegram/alert/", { method: "POST", token, body: { game: row.id } });
      setMsg(r.ok ? `Telegram alert sent for ${row.name} ✔` : "Telegram send failed");
    } catch (err) { setMsg(err.data?.detail || err.message); }
  }

  async function saveTelegram(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await apiFetch("/settings/", {
        method: "PUT", token,
        body: {
          telegram_bot_token: f.get("token"), telegram_chat_id: f.get("chat"),
          points_threshold: f.get("threshold"), load_amount: f.get("load"),
        },
      });
      setMsg("Telegram settings saved ✔"); load();
    } catch { setMsg("Could not save settings"); }
  }

  if (!report || !settings) return <div className="muted">Loading…</div>;

  return (
    <div>
      {msg && <div className="alert ok">{msg}</div>}
      <div className="wgrid">
        <div className="wcard warn"><div className="ic">📡</div><div><div className="v">{report.low_count}</div><div className="l">Games below {report.threshold}</div></div></div>
        <div className="wcard"><div className="ic">🎯</div><div><div className="v">{report.threshold}</div><div className="l">Alert Threshold</div></div></div>
        <div className="wcard"><div className="ic">🔔</div><div><div className="v">{report.load_amount}</div><div className="l">Default Load</div></div></div>
        <div className={`wcard ${report.telegram_configured ? "" : "warn"}`}><div className="ic">✈️</div><div><div className="v">{report.telegram_configured ? "On" : "Off"}</div><div className="l">Telegram</div></div></div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto", marginBottom: "1.4rem" }}>
        <table className="dtable">
          <thead><tr><th>Game</th><th>Sub-Dist</th><th>Vendor</th><th>Combined</th><th></th></tr></thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b>{r.low && <span className="badge warn" style={{ marginLeft: ".5em" }}>LOW</span>}</td>
                <td><input style={{ width: 90 }} type="number" defaultValue={r.sub_points}
                  onChange={(e) => setEdits({ ...edits, [r.id]: { ...edits[r.id], sub: e.target.value } })} /></td>
                <td><input style={{ width: 90 }} type="number" defaultValue={r.vendor_points}
                  onChange={(e) => setEdits({ ...edits, [r.id]: { ...edits[r.id], vendor: e.target.value } })} /></td>
                <td><span className={`badge ${r.low ? "warn" : "ok"}`}>{r.combined}</span></td>
                <td><div className="row-btns">
                  <button className="ibtn" title="Save points" onClick={() => savePoints(r)}>💾</button>
                  <button className="ibtn" title="Send Telegram load alert" onClick={() => sendAlert(r)}>🔔</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: "1.6rem", maxWidth: 560 }}>
        <h3>✈️ Telegram Setup</h3>
        <p className="muted small">When a game's combined points drop below the threshold, send a load reminder to your Telegram group.</p>
        <form onSubmit={saveTelegram}>
          <label>Bot Token<input name="token" defaultValue={settings.telegram_bot_token} placeholder="123456:ABC-..." /></label>
          <label>Group Chat ID<input name="chat" defaultValue={settings.telegram_chat_id} placeholder="-1001234567890" /></label>
          <div className="form-grid">
            <label>Alert Threshold<input name="threshold" type="number" defaultValue={settings.points_threshold} /></label>
            <label>Default Load Amount<input name="load" type="number" defaultValue={settings.load_amount} /></label>
          </div>
          <button className="btn btn-primary">Save Telegram Settings</button>
        </form>
      </div>
    </div>
  );
}
