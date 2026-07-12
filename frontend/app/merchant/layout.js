"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function MerchantLayout({ children }) {
  const { user, ready, token, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (ready && (!user || user.role !== "merchant")) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (token) apiFetch("/merchants/me/", { token }).then(setMe).catch(() => {});
  }, [token]);

  if (!ready || !user || user.role !== "merchant") {
    return <div className="wrap section center muted">Loading…</div>;
  }

  const nav = [
    ["/merchant", "📊", "Dashboard"],
    ["/merchant/payouts", "💸", "Payouts"],
  ];
  if (me && !me.is_sub) nav.push(["/merchant/submerchants", "🏦", "Sub-Merchants"]);

  return (
    <div className="admin">
      <aside className={`admin-side ${open ? "open" : ""}`}>
        <Link href="/" className="brand"><Logo size={34} /><span className="brand-name">TIFFANY <b>PAY</b></span></Link>
        <nav className="admin-nav" onClick={() => setOpen(false)}>
          {nav.map(([href, ico, label]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>
              <span className="ico">{ico}</span> {label}
            </Link>
          ))}
        </nav>
        <div className="admin-side-foot">
          {me && <span className="muted small" style={{ padding: ".4em .6em" }}>Fee: {me.fee_percent}%{me.is_sub ? " · sub" : ""}</span>}
          <button className="btn btn-ghost sm" onClick={() => { logout(); router.push("/login"); }}>Logout</button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-top">
          <button className="admin-toggle" onClick={() => setOpen((o) => !o)}>☰</button>
          <h1>{(nav.find(([h]) => h === pathname) || [null, null, "Merchant"])[2]}</h1>
          <span className="muted small">🏪 {me?.name || user.username}</span>
        </div>
        <div className="admin-body-c">{children}</div>
      </main>
    </div>
  );
}
