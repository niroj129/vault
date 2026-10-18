/* One icon family (Lucide, 2px stroke). Size tokens: 16 inline, 20 controls, 24 navigation. */
import {
  Dices, Fish, Gamepad2, Hash, Joystick, LayoutGrid, Ticket, Tv, type LucideIcon,
} from "lucide-react";

export const ICON = { inline: 16, control: 20, nav: 24 } as const;

/** Game category icon keys stored in the database → Lucide icons. */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  fish: Fish, slot: Dices, arcade: Joystick, ticket: Ticket, video: Tv, grid: Hash, dice: Dices, all: LayoutGrid, game: Gamepad2,
};
export const categoryIcon = (key?: string | null): LucideIcon => CATEGORY_ICON[key || ""] || Dices;
