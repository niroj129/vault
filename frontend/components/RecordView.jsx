"use client";

import { useEffect } from "react";

/** Records a game into the recently-viewed localStorage list. */
export default function RecordView({ slug, name, thumbnail }) {
  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem("tf_recent") || "[]");
      const next = [{ slug, name, thumbnail }, ...list.filter((g) => g.slug !== slug)].slice(0, 8);
      localStorage.setItem("tf_recent", JSON.stringify(next));
    } catch {}
  }, [slug, name, thumbnail]);
  return null;
}
