"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

function SettingsForm({ title, endpoint, fields, token }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { apiFetch(endpoint, { token }).then(setData).catch(() => {}); }, [endpoint, token]);

  async function save(e) {
    e.preventDefault();
    try {
      const body = {};
      fields.forEach((f) => { body[f.name] = f.type === "checkbox" ? !!data[f.name] : (data[f.name] ?? ""); });
      await apiFetch(endpoint, { method: "PUT", token, body });
      setMsg("Saved ✔"); setTimeout(() => setMsg(""), 2500);
    } catch { setMsg("Save failed"); }
  }

  if (!data) return <div className="card" style={{ padding: "1.6rem" }}><span className="muted">Loading…</span></div>;

  return (
    <form className="card" style={{ padding: "1.6rem" }} onSubmit={save}>
      <h3>{title}</h3>
      {msg && <div className="alert ok small">{msg}</div>}
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name} className={f.type === "textarea" || f.full ? "full" : ""}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea rows={f.rows || 3} value={data[f.name] || ""} onChange={(e) => setData({ ...data, [f.name]: e.target.value })} />
            ) : f.type === "checkbox" ? (
              <div className="field-row"><input type="checkbox" checked={!!data[f.name]} onChange={(e) => setData({ ...data, [f.name]: e.target.checked })} /> <span className="muted small">Enabled</span></div>
            ) : f.type === "color" ? (
              <input type="color" value={data[f.name] || "#000000"} onChange={(e) => setData({ ...data, [f.name]: e.target.value })} />
            ) : (
              <input type={f.type || "text"} value={data[f.name] || ""} onChange={(e) => setData({ ...data, [f.name]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <button className="btn btn-primary" style={{ marginTop: ".8rem" }}>Save {title}</button>
    </form>
  );
}

export default function AdminSettings() {
  const { token } = useAuth();
  if (!token) return null;
  return (
    <div style={{ display: "grid", gap: "1.4rem" }}>
      <SettingsForm title="Site Settings" endpoint="/settings/" token={token} fields={[
        { name: "site_name", label: "Site Name" },
        { name: "tagline", label: "Tagline", full: true },
        { name: "currency", label: "Currency Symbol" },
        { name: "signup_url", label: "Create-Account Redirect URL", full: true },
        { name: "color_primary", label: "Primary Color", type: "color" },
        { name: "color_secondary", label: "Secondary Color", type: "color" },
        { name: "color_accent", label: "Accent Color", type: "color" },
        { name: "analytics_id", label: "Google Analytics ID" },
        { name: "gsc_verification", label: "Search Console Verification" },
        { name: "twilio_sid", label: "Twilio SID (SMS)" },
        { name: "twilio_token", label: "Twilio Auth Token" },
        { name: "twilio_from", label: "Twilio From Number" },
        { name: "game_api_url", label: "Game API Base URL", full: true, help: "e.g. https://panel.host (no /api)" },
        { name: "game_api_agent_id", label: "Game API Agent ID" },
        { name: "game_api_secret", label: "Game API Secret Key" },
        { name: "game_api_use_doh", label: "Use Secure DNS (bypass ISP block)", type: "checkbox" },
        { name: "game_api_force_ip", label: "Pin API to IP (optional)" },
        { name: "maintenance_mode", label: "Maintenance Mode", type: "checkbox" },
      ]} />

      <SettingsForm title="Business Info" endpoint="/business/" token={token} fields={[
        { name: "business_name", label: "Business Name" },
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
        { name: "whatsapp", label: "WhatsApp" },
        { name: "telegram", label: "Telegram URL" },
        { name: "facebook", label: "Facebook URL" },
        { name: "instagram", label: "Instagram URL" },
        { name: "address", label: "Address", full: true },
        { name: "map_embed", label: "Map Embed (iframe)", type: "textarea", full: true },
        { name: "about", label: "About", type: "textarea", full: true },
        { name: "terms", label: "Terms", type: "textarea", full: true },
        { name: "privacy", label: "Privacy", type: "textarea", full: true },
      ]} />
    </div>
  );
}
