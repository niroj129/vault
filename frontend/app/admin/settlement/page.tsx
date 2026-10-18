"use client";

import { Gift, Hourglass, TrendingUp, Wallet, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExportButton } from "@/components/admin/export-button";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";

interface Settlement { totals: { load: string; bonus: string }; all_time_cashouts: string; pending_cashouts: string; total_profit: string }

export default function AdminSettlement() {
  const { token } = useAuth();
  const [d, setD] = useState<Settlement | null>(null);
  useEffect(() => { if (token) apiFetch<Settlement>("/stats/settlement/", { token }).then(setD).catch((e) => toast.error(errorText(e))); }, [token]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Settlement" description="All-time ledger: every load, cash out and bonus since day one." actions={<ExportButton resource="transactions" label="Export ledger" />} />
      {!d ? <><div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div></> : <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={Zap} label="All-time loads" value={money(d.totals.load)} />
          <StatCard icon={Gift} label="All-time bonuses" value={money(d.totals.bonus)} />
          <StatCard icon={Wallet} label="All-time cash outs" value={money(d.all_time_cashouts)} />
          <StatCard icon={Hourglass} label="Pending cash outs" value={money(d.pending_cashouts)} tone={Number(d.pending_cashouts) > 0 ? "warn" : undefined} />
          <StatCard icon={TrendingUp} label="Total profit logged" value={money(d.total_profit)} />
        </div>
      </>}
    </div>
  );
}
