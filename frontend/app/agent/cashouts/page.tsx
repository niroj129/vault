import type { Metadata } from "next";
import RedeemsPage from "@/app/admin/redeems/page";

export const metadata: Metadata = { title: "Cash outs" };

export default function AgentCashOuts() {
  return <RedeemsPage />;
}
