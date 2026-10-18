"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/common/user-avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { UserBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Person = UserBrief & { can_message?: boolean };
export const ROLE_LABEL: Record<string, string> = { admin: "Staff", agent: "Staff", user: "Player" };

/** Search people on this site; pick one (direct chat) or several (group). */
export function PeoplePicker({ selected, onToggle, multi = false, exclude = [] }:
  { selected: Person[]; onToggle: (p: Person) => void; multi?: boolean; exclude?: number[] }) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {   // debounce-throttle rule
      apiFetch<Person[]>(`/messenger/users/?q=${encodeURIComponent(q)}`, { token }).then(setPeople).catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, token]);

  const list = (people || []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="grid gap-3">
      <InputGroup>
        <InputGroupAddon><Search aria-hidden /></InputGroupAddon>
        <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type @username or a name"
          aria-label="Search people" autoFocus autoComplete="off" />
      </InputGroup>
      <ul className="grid max-h-80 gap-1 overflow-y-auto" aria-label="People" aria-live="polite" aria-busy={people === null}>
        {people === null && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-14" /></li>)}
        {people && !list.length && <li className="p-3 text-sm text-muted-foreground">No one matches “{q}”.</li>}
        {list.map((p) => {
          const on = selected.some((s) => s.id === p.id);
          const closed = p.can_message === false;
          return (
            <li key={p.id}>
              <button type="button" disabled={closed} onClick={() => onToggle(p)} aria-pressed={multi ? on : undefined}
                className={cn("flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50", on && "bg-primary/10")}>
                <UserAvatar name={p.full_name || p.username} src={p.avatar} size={40} online={p.online} />
                <span className="grid min-w-0 flex-1">
                  <b className="truncate">{p.full_name || p.username}</b>
                  <span className="truncate text-sm text-muted-foreground">@{p.username} · {closed ? "Doesn't accept new chats" : ROLE_LABEL[p.role] || p.role}</span>
                </span>
                {multi && (
                  <span aria-hidden className={cn("grid size-5 place-items-center rounded-full border", on && "border-primary bg-primary text-primary-foreground")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
