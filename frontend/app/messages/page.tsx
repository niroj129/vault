"use client";

import { MessageCircleOff } from "lucide-react";
import { Suspense } from "react";
import { Protected } from "@/components/common/protected";
import { Messenger } from "@/components/chat/messenger";
import { useSite } from "@/components/site-context";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function MessagesPage() {
  const site = useSite();
  return (
    <Protected>
      {site.features?.messenger === false ? (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><MessageCircleOff aria-hidden /></EmptyMedia><EmptyTitle>Messaging isn&apos;t available on this site.</EmptyTitle></EmptyHeader></Empty>
      ) : <Suspense><Messenger /></Suspense>}
    </Protected>
  );
}
