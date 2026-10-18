import { Suspense } from "react";
import { PlayersWorkspace } from "@/components/agent/players-workspace";

export default function AgentHome() {
  return <Suspense><PlayersWorkspace /></Suspense>;
}
