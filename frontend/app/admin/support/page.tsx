"use client";

import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { OwnerThread } from "@/components/owner-chat/thread";

export default function PlatformSupport() {
  return (
    <div className="grid gap-4">
      <PageHeader title="Platform support" description="A private chat with the platform owner. Ask for help, request a feature or report a problem. Your players never see this." />
      <div className="glass flex h-[calc(100dvh-16rem)] min-h-[24rem] flex-col overflow-hidden rounded-xl border">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-brand-text"><LifeBuoy className="size-5" aria-hidden /></span>
          <div className="grid"><b>Platform owner</b><span className="text-sm text-muted-foreground">Replies show here and as a notification</span></div>
        </div>
        <OwnerThread path="/owner-chat/" mine="site" label="Chat with the platform owner" empty="Say hello. The platform owner gets a notification straight away." />
      </div>
    </div>
  );
}
