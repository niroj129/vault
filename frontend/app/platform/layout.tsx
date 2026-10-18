import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PlatformShell } from "@/components/platform/platform-shell";

export const metadata: Metadata = { title: { default: "Owner console", template: "%s · Owner console" }, robots: { index: false } };

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
