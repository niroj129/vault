import { StatusBadge } from "@/components/play/status-badge";

/** Active / hidden style flag as icon + text. */
export const OnOff = ({ on, yes = "Active", no = "Hidden" }: { on: boolean; yes?: string; no?: string }) =>
  <StatusBadge tone={on ? "ok" : "neutral"}>{on ? yes : no}</StatusBadge>;
