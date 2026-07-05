"use client";

import { API_BASE } from "../../lib/api";
import { useAuth } from "../../lib/auth";

/** Authenticated CSV download (sends the knox token, then saves the blob). */
export default function ExportButton({ resource, label }) {
  const { token } = useAuth();
  async function download() {
    const res = await fetch(`${API_BASE}/api/export/${resource}.csv`, {
      headers: { Authorization: `Token ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${resource}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  return <button className="btn btn-ghost sm" onClick={download}>⬇ {label || "Export CSV"}</button>;
}
