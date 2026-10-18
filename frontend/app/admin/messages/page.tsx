import { Suspense } from "react";
import { Messenger } from "@/components/chat/messenger";

export const metadata = { title: "Inbox" };

export default function AdminInbox() {
  return <Suspense><Messenger basePath="/admin/messages" /></Suspense>;
}
