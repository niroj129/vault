"use client";

import { CalendarRange, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { ExportButton } from "@/components/admin/export-button";
import { OnOff } from "@/components/admin/on-off";
import { ResourceManager } from "@/components/admin/resource-manager";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/play/status-badge";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";

interface Method { id: number; name: string; details: string; icon: string; sort_order: number; active: boolean }
interface Cashout { id: number; player: string; amount: string; method: string; game: string; status: "paid" | "pending" | "rejected"; date: string; notes: string }
interface Profit { id: number; date: string; amount: string; notes: string }
const today = () => new Date().toISOString().slice(0, 10);

export default function AdminPayments() {
  const { token } = useAuth();
  const [s, setS] = useState<{ today_cashout?: number; daily_profit?: number; monthly_profit?: number }>({});
  useEffect(() => { if (token) apiFetch("/stats/admin/", { token }).then(setS).catch(() => {}); }, [token]);

  return (
    <div className="grid gap-8">
      <PageHeader title="Payments & profit" description="Manual payment methods, recorded cash outs and daily profit." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={Wallet} label="Cash outs today" value={money(s.today_cashout)} />
        <StatCard icon={TrendingUp} label="Profit today" value={money(s.daily_profit)} />
        <StatCard icon={CalendarRange} label="Profit this month" value={money(s.monthly_profit)} />
      </div>
      <ResourceManager<Method>
        title="Payment methods" itemName="payment method" addLabel="Add method" endpoint="/payment-methods/" searchKeys={["name", "details"]}
        columns={[
          { key: "name", label: "Method", render: (r) => <b>{r.name}</b> },
          { key: "details", label: "Details", mobileHidden: true },
          { key: "active", label: "Status", render: (r) => <OnOff on={r.active} yes="Active" no="Off" /> },
        ]}
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "details", label: "Account, handle or instructions", full: true },
          { name: "icon", label: "Icon key", help: "Short name, like card or cashapp." },
          { name: "sort_order", label: "Sort order", type: "number", min: 0 },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
        defaults={{ active: true, sort_order: "0", icon: "card" }}
      />
      <ResourceManager<Cashout>
        title="Cash outs" itemName="cash out" addLabel="Record cash out" endpoint="/cashouts/" searchKeys={["player", "method", "game"]}
        toolbar={() => <ExportButton resource="cashouts" label="Export cash outs" />}
        columns={[
          { key: "player", label: "Player", render: (r) => <b>{r.player}</b> },
          { key: "amount", label: "Amount", render: (r) => <span className="font-semibold tabular-nums">{money(r.amount)}</span> },
          { key: "method", label: "Method", mobileHidden: true },
          { key: "status", label: "Status", render: (r) => <StatusBadge tone={r.status === "paid" ? "ok" : r.status === "pending" ? "wait" : "bad"}>{r.status[0].toUpperCase() + r.status.slice(1)}</StatusBadge> },
          { key: "date", label: "Date" },
        ]}
        fields={[
          { name: "player", label: "Player", required: true },
          { name: "amount", label: "Amount ($)", type: "number", required: true, min: 0 },
          { name: "method", label: "Method" },
          { name: "game", label: "Game" },
          { name: "status", label: "Status", type: "select", options: [{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "rejected", label: "Rejected" }] },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "notes", label: "Notes", full: true },
        ]}
        defaults={{ date: today(), status: "paid" }}
      />
      <ResourceManager<Profit>
        title="Daily profit" itemName="profit record" addLabel="Record profit" endpoint="/profit/"
        toolbar={() => <ExportButton resource="profit" label="Export profit" />}
        columns={[
          { key: "date", label: "Date", render: (r) => <b>{r.date}</b> },
          { key: "amount", label: "Amount", render: (r) => <span className="font-semibold tabular-nums">{money(r.amount)}</span> },
          { key: "notes", label: "Notes", mobileHidden: true },
        ]}
        fields={[
          { name: "date", label: "Date", type: "date", required: true },
          { name: "amount", label: "Amount ($)", type: "number", required: true },
          { name: "notes", label: "Notes", full: true },
        ]}
        defaults={{ date: today() }}
      />
    </div>
  );
}
