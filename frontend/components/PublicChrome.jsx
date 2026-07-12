"use client";

import { usePathname } from "next/navigation";

/** Hides the public header/footer on the admin console. */
export default function PublicChrome({ children }) {
  const pathname = usePathname();
  if (pathname && (pathname.startsWith("/admin") || pathname.startsWith("/merchant"))) return null;
  return children;
}
