"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

/** Client-side guard for signed-in pages (auth is a bearer token in this browser). */
export function Protected({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    else if (role && user.role !== role) router.replace("/profile");
  }, [ready, user, role, router]);

  if (!ready || !user || (role && user.role !== role)) {
    return (
      <div role="status" className="flex min-h-[50dvh] items-center justify-center gap-3 text-muted-foreground">
        <Spinner className="size-5" /> Loading…
      </div>
    );
  }
  return <>{children}</>;
}
