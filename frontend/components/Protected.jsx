"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../lib/auth";

export default function Protected({ children, role }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (role && user.role !== role) router.replace("/dashboard");
  }, [ready, user, role, router]);

  if (!ready || !user || (role && user.role !== role)) {
    return <div className="wrap section center muted">Loading…</div>;
  }
  return children;
}
