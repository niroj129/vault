"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { OnOff } from "@/components/admin/on-off";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { Protected } from "@/components/common/protected";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminUser } from "@/lib/types";

/** Agents create and manage their own players (the API only returns theirs). */
export default function AgentPlayers() {
  return (
    <Protected role="agent">
      <div className="grid gap-6">
        <PageHeader eyebrow="Agent" title="My players" description="Players you look after. Create accounts and keep their details up to date."
          actions={<Button asChild variant="outline"><Link href="/messages"><MessageCircle aria-hidden />Messages</Link></Button>} />
        <ResourceManager<AdminUser> title="Players" itemName="Player" addLabel="Create player" endpoint="/users/" canDelete={false}
          searchKeys={["username", "full_name", "email", "phone"]}
          columns={[
            { key: "username", label: "Username", render: (r) => <b>{r.username}</b> },
            { key: "full_name", label: "Name", render: (r) => r.full_name || "—" },
            { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
            { key: "vip_tier", label: "Tier", render: (r) => <Badge variant="secondary">{r.vip_tier}</Badge> },
            { key: "is_active", label: "Status", render: (r) => <OnOff on={!!r.is_active} no="Disabled" /> },
          ]}
          fields={[
            { name: "username", label: "Username", required: true },
            { name: "full_name", label: "Full name" },
            { name: "email", label: "Email", type: "email" },
            { name: "phone", label: "Phone" },
            { name: "password", label: "Password", type: "password", requiredOnCreate: true, full: true, help: "Leave blank when editing to keep the current one." },
            { name: "is_active", label: "Active", type: "checkbox" },
          ]}
          defaults={{ is_active: true }} />
      </div>
    </Protected>
  );
}
