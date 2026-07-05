"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function NotificationBell() {
  const { user, token } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch("/notifications/", { token }).then(setItems).catch(() => {});
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  if (!user) return null;
  const unread = items.filter((i) => !i.is_read).length;

  async function openPanel() {
    setOpen((o) => !o);
    if (!open && unread) {
      try { await apiFetch("/notifications/read_all/", { method: "POST", token }); load(); } catch {}
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="icon-btn2" onClick={openPanel} aria-label="Notifications">
        🔔{unread > 0 && <span className="dotbadge">{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          {items.length ? items.map((n) => (
            <Link key={n.id} href={n.link || "#"} className={`notif-item ${n.is_read ? "" : "unread"}`} style={{ display: "block" }} onClick={() => setOpen(false)}>
              <div className="small">{n.text}</div>
              <div className="muted" style={{ fontSize: ".7rem" }}>{(n.created_at || "").slice(0, 16).replace("T", " ")}</div>
            </Link>
          )) : <p className="muted small center" style={{ padding: "1rem" }}>No notifications</p>}
        </div>
      )}
    </div>
  );
}
