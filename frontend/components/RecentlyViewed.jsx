"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mediaUrl } from "../lib/api";

/** Reads recently-viewed games from localStorage (written by RecordView). */
export default function RecentlyViewed() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem("tf_recent") || "[]")); } catch {}
  }, []);
  if (!items.length) return null;
  return (
    <section className="wrap section">
      <div className="head"><div><span className="kicker">For You</span><h2>🕘 Recently Viewed</h2></div></div>
      <div className="grid games">
        {items.slice(0, 6).map((g) => (
          <Link key={g.slug} href={`/${g.slug}`} className="card game-card">
            <div className="thumb">{g.thumbnail ? <img src={mediaUrl(g.thumbnail)} alt={g.name} loading="lazy" /> : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: "2rem" }}>🎰</div>}</div>
            <div className="game-body"><h3>{g.name}</h3></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
