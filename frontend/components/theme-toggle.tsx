"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Day / Night switch, the same on every page (player and admin). */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const night = !mounted || resolvedTheme !== "day";
  const label = night ? "Switch to Day theme" : "Switch to Night theme";
  const button = (
    <Button variant="ghost" size={withLabel ? "default" : "icon"} onClick={() => setTheme(night ? "day" : "night")} aria-label={label}>
      <Sun className="size-5 scale-0 rotate-90 transition-transform duration-200 ease-out [.light_&]:scale-100 [.light_&]:rotate-0" aria-hidden />
      <Moon className="absolute size-5 scale-100 rotate-0 transition-transform duration-200 ease-out [.light_&]:scale-0 [.light_&]:-rotate-90" aria-hidden />
      {withLabel && <span className="ml-1">{night ? "Night" : "Day"}</span>}
    </Button>
  );
  if (withLabel) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{night ? "Night theme" : "Day theme"}</TooltipContent>
    </Tooltip>
  );
}
