import type { Metadata } from "next";
import DepositsPage from "@/app/admin/deposits/page";

export const metadata: Metadata = { title: "Loads" };

/** The same desk admins use for payments to check and loads to do; for an agent it only ever shows their own players. */
export default function AgentLoads() {
  return <DepositsPage />;
}
