"use client";

import { Gamepad2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { apiFetch } from "@/lib/api";

interface Suggestion { slug: string; name: string }

/** Game search: a button in the top bar that opens a command palette (⌘K / Ctrl K). */
export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {   // debounce-throttle rule
      apiFetch<Suggestion[]>(`/search/suggest/?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => setResults([]));
    }, 180);
  }, [q]);

  function go(path: string) { setOpen(false); setQ(""); router.push(path); }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label="Search games"
        className="h-11 w-11 justify-center px-0 text-muted-foreground md:w-full md:max-w-md md:justify-start md:px-4 md:font-normal">
        <Search aria-hidden />
        <span className="hidden md:inline">Search games</span>
        <Kbd className="ml-auto hidden md:inline-flex">⌘K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search games" description="Type a game name" showCloseButton>
        <Command shouldFilter={false}>
        <CommandInput value={q} onValueChange={setQ} placeholder="Search games…" />
        <CommandList>
          {q.trim().length >= 2 && <CommandEmpty>No games match “{q.trim()}”.</CommandEmpty>}
          {results.length > 0 && (
            <CommandGroup heading="Games">
              {results.map((s) => (
                <CommandItem key={s.slug} value={s.slug} onSelect={() => go(`/${s.slug}`)}>
                  <Gamepad2 aria-hidden />{s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {q.trim().length >= 2 && (
            <CommandGroup heading="More">
              <CommandItem value="__all" onSelect={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}>
                <Search aria-hidden />See all results for “{q.trim()}”
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
