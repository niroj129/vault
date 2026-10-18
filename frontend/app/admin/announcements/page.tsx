"use client";

import { Pin } from "lucide-react";
import { OnOff } from "@/components/admin/on-off";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { shortDate } from "@/lib/format";
import type { Announcement } from "@/lib/types";

type Row = Announcement & { created_at: string };

export default function AdminAnnouncements() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Announcements" description="The pinned announcement shows in the bar at the top of every page." />
      <ResourceManager<Row> title="Announcements" itemName="Announcement" addLabel="New announcement" endpoint="/announcements/" searchKeys={["title", "body"]}
        columns={[
          { key: "title", label: "Title", render: (r) => <b>{r.title}</b> },
          { key: "pinned", label: "Pinned", render: (r) => (r.pinned ? <span className="inline-flex items-center gap-1 text-brand-text"><Pin className="size-4" aria-hidden />Pinned</span> : "—") },
          { key: "active", label: "Status", render: (r) => <OnOff on={r.active} /> },
          { key: "created_at", label: "Created", render: (r) => shortDate(r.created_at) },
        ]}
        fields={[
          { name: "title", label: "Title", required: true, full: true },
          { name: "body", label: "Message", type: "textarea" },
          { name: "pinned", label: "Pin to the top bar", type: "checkbox" },
          { name: "active", label: "Show on the site", type: "checkbox" },
        ]}
        defaults={{ active: true, pinned: false }} />
    </div>
  );
}
