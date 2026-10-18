import type { ReactNode } from "react";

// Re-mounts on every navigation: a short fade keeps continuity between pages (off with reduced motion).
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-in fade-in duration-200 ease-out">{children}</div>;
}
