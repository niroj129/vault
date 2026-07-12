"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const NAV = [
  ["/admin", "📊", "Dashboard"],
  ["/admin/gameplatform", "🎯", "Game Platform"],
  ["/admin/transactions", "📆", "Transactions & Shifts"],
  ["/admin/games", "🎮", "Games & Links"],
  ["/admin/winners", "🏆", "Daily Winners"],
  ["/admin/points", "📡", "Points & Telegram"],
  ["/admin/payments", "💳", "Payments & Cashout"],
  ["/admin/merchants", "🏪", "Merchants"],
  ["/admin/payorders", "🧾", "Payment Orders"],
  ["/admin/wallets", "👛", "Player Wallets"],
  ["/admin/settlement", "📒", "Settlement"],
  ["/admin/chat", "💬", "Chat", "unread_chats"],
  ["/admin/players", "👥", "Players"],
  ["/admin/promotions", "🎁", "Promotions"],
  ["/admin/announcements", "📢", "Announcements"],
  ["/admin/reviews", "⭐", "Reviews"],
  ["/admin/faq", "❓", "FAQ"],
  ["/admin/seo", "🔍", "SEO"],
  ["/admin/logins", "🛡️", "Login Activity"],
  ["/admin/settings", "⚙️", "Settings"],
];

export default function AdminLayout({ children }) {
  const { user, ready, token, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (ready && (!user || user.role !== "admin")) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!token) return;
    const load = () => apiFetch("/stats/admin/", { token })
      .then((d) => setUnread(d.unread_chats || 0)).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [token]);

  if (!ready || !user || user.role !== "admin") {
    return <div className="wrap section center muted">Loading…</div>;
  }

  return (
    <div className="admin">
      <aside className={`admin-side ${open ? "open" : ""}`}>
        <Link href="/" className="brand"><Logo size={34} /><span className="brand-name">TIFFANY <b>GAMING</b></span></Link>
        <nav className="admin-nav" onClick={() => setOpen(false)}>
          {NAV.map(([href, ico, label, badge]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>
              <span className="ico">{ico}</span> {label}
              {badge === "unread_chats" && unread > 0 && <span className="pilln">{unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Link href="/">🌐 View Site</Link>
          <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/django-admin/`} target="_blank" rel="noopener">🛠 Django Admin</a>
          <button className="btn btn-ghost sm" onClick={() => { logout(); router.push("/login"); }}>Logout</button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-top">
          <button className="admin-toggle" onClick={() => setOpen((o) => !o)}>☰</button>
          <h1>{(NAV.find(([h]) => h === pathname) || [null, null, "Admin"])[2]}</h1>
          <span className="muted small">👤 {user.username}</span>
        </div>
        <div className="admin-body-c">{children}</div>
      </main>
    </div>
  );
}
