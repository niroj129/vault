"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/** Night (dark, default) / Day (light). Stored under "theme" as "night"/"day",
 * the same values the site used before, so returning visitors keep their choice. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" storageKey="theme" themes={["night", "day"]}
      value={{ night: "dark", day: "light" }} defaultTheme="night" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
