"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Authenticated CSV download (sends the token, then saves the file). */
export function ExportButton({ resource, label = "Export CSV" }: { resource: string; label?: string }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/export/${resource}.csv`, { headers: { Authorization: `Token ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status}).`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${resource}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed."); } finally { setBusy(false); }
  }
  return <Button variant="outline" onClick={download} disabled={busy} aria-busy={busy}>{busy ? <Spinner aria-hidden /> : <Download aria-hidden />}{label}</Button>;
}
