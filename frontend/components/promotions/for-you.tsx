"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Promo } from "@/lib/types";
import { PromoCard } from "./promo-card";

/** Offers made to this player only (or hidden from others). The public list can't show them. */
export function ForYouPromos() {
  const { token } = useAuth();
  const [promos, setPromos] = useState<Promo[]>([]);
  useEffect(() => {
    if (!token) { setPromos([]); return; }
    apiFetch<Promo[]>("/promos/mine/", { token }).then((r) => setPromos(r.filter((p) => p.audience !== "all"))).catch(() => setPromos([]));
  }, [token]);
  if (!promos.length) return null;
  return (
    <section aria-labelledby="for-you" className="grid gap-4">
      <h2 id="for-you" className="text-xl font-semibold">Offers for you</h2>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{promos.map((p) => <li key={p.id}><PromoCard p={p} /></li>)}</ul>
    </section>
  );
}
