"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/common/user-avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { matches, rank } from "@/lib/search";
import type { AdminUser } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Pick one site player: search, then tap. */
export function PlayerPicker({ value, onChange, label = "Find a player" }: { value: number | null; onChange: (id: number | null) => void; label?: string }) {
  const { token } = useAuth();
  const [people, setPeople] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    apiFetch<AdminUser[] | { results: AdminUser[] }>("/users/?role=user", { token }).then((r) => setPeople(Array.isArray(r) ? r : r.results)).catch(() => setPeople([]));
  }, [token]);
  const shown = useMemo(() => rank((people || []).filter((u) => matches(`${u.username} ${u.full_name}`, q)), q, (u) => `${u.username} ${u.full_name}`).slice(0, 30), [people, q]);
  return (
    <div className="grid gap-2">
      <InputGroup><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
        <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} aria-label={label} /></InputGroup>
      {!people ? <Skeleton className="h-24" /> : (
        <ul className="grid max-h-56 gap-1 overflow-y-auto" role="radiogroup" aria-label="Players">
          {shown.map((u) => (
            <li key={u.id}>
              <button type="button" role="radio" aria-checked={value === u.id} onClick={() => onChange(value === u.id ? null : u.id)}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  value === u.id ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "bg-muted/30")}>
                <UserAvatar name={u.full_name || u.username} src={u.avatar} size={32} />
                <span className="grid leading-tight"><b className="text-sm">{u.full_name || u.username}</b><span className="text-xs text-muted-foreground">@{u.username}</span></span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="p-3 text-center text-sm text-muted-foreground">No players found.</li>}
        </ul>
      )}
    </div>
  );
}
