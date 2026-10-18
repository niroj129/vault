import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AgentShell } from "@/components/agent/agent-shell";

export const metadata: Metadata = { title: { default: "Agent console", template: "%s · Agent" }, robots: { index: false } };

export default function AgentLayout({ children }: { children: ReactNode }) {
  return <AgentShell>{children}</AgentShell>;
}
