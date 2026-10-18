"use client";

import { Stars } from "@/components/common/stars";
import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/admin/resource-manager";
import { shortDate } from "@/lib/format";

interface Row { id: number; game_slug: string; user_name: string; rating: number; comment: string; created_at: string; [k: string]: unknown }

export default function AdminReviews() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Reviews" description="Moderate player reviews. Deleting removes a review from the game page." />
      <ResourceManager<Row> title="Reviews" itemName="Review" endpoint="/reviews/" canAdd={false} canEdit={false} searchKeys={["game_slug", "user_name", "comment"]}
        describeDelete={(r) => `${r.user_name}'s review of ${r.game_slug} will be removed.`} emptyText="Player reviews appear here."
        columns={[
          { key: "game_slug", label: "Game", render: (r) => <b>{r.game_slug}</b> },
          { key: "user_name", label: "Player" },
          { key: "rating", label: "Rating", render: (r) => <Stars value={r.rating} /> },
          { key: "comment", label: "Comment", render: (r) => <span className="line-clamp-2 max-w-md text-muted-foreground">{r.comment || "—"}</span> },
          { key: "created_at", label: "Date", render: (r) => shortDate(r.created_at) },
        ]} fields={[]} />
    </div>
  );
}
