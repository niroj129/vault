"use client";

import { Trophy } from "lucide-react";
import Image from "next/image";
import { ExportButton } from "@/components/admin/export-button";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { mediaUrl } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import type { Winner } from "@/lib/types";

export default function AdminWinners() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Daily winners" description="Big wins shown on the Winners page and the home page." actions={<ExportButton resource="winners" label="Export winners" />} />
      <ResourceManager<Winner & { [k: string]: unknown }> title="Winners" itemName="Winner" endpoint="/winners/" searchKeys={["name", "game"]}
        columns={[
          { key: "photo", label: "Photo", mobileHidden: true, render: (r) => (
            <span className="relative grid size-9 place-items-center overflow-hidden rounded-full bg-warning/20 text-warning">
              {r.photo ? <Image src={mediaUrl(r.photo)} alt="" fill sizes="36px" className="object-cover" /> : <Trophy className="size-4" aria-hidden />}</span>) },
          { key: "name", label: "Winner", render: (r) => <b>{r.name}</b> },
          { key: "amount", label: "Amount", render: (r) => <b className="text-warning tabular-nums">{money(r.amount)}</b> },
          { key: "game", label: "Game" },
          { key: "win_date", label: "Date", render: (r) => shortDate(r.win_date) },
        ]}
        fields={[
          { name: "name", label: "Winner name", required: true },
          { name: "amount", label: "Winning amount ($)", type: "number", required: true, min: 0 },
          { name: "game", label: "Game" },
          { name: "win_date", label: "Date", type: "date", required: true },
          { name: "photo", label: "Photo", type: "image" },
        ]}
        defaults={{ win_date: new Date().toISOString().slice(0, 10) }} />
    </div>
  );
}
