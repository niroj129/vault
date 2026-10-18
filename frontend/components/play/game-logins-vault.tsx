"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Eye, EyeOff, Gamepad2, KeyRound, Play, RefreshCw, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { PlayGame, PlayOptions } from "@/lib/types";

const unameSchema = z.object({ username: z.string().trim().min(2, "Enter your username on this game.").max(120) });

function AddUsername({ game, onDone, onCancel }: { game: PlayGame; onDone: () => void; onCancel: () => void }) {
  const { token } = useAuth();
  const form = useForm<z.infer<typeof unameSchema>>({ resolver: zodResolver(unameSchema), defaultValues: { username: "" } });
  async function submit(v: z.infer<typeof unameSchema>) {
    try { await apiFetch("/play/accounts/", { method: "POST", token, body: { game: game.id, username: v.username } }); onDone(); }
    catch (e) { form.setError("username", { message: errorText(e) }); }
  }
  const err = form.formState.errors.username;
  return (
    <form onSubmit={form.handleSubmit(submit)} className="mt-2 grid gap-2" noValidate>
      <Field data-invalid={!!err}>
        <FieldLabel htmlFor={`uname-${game.id}`}>Your {game.name} username</FieldLabel>
        <Input id={`uname-${game.id}`} autoFocus autoComplete="off" aria-invalid={!!err} {...form.register("username")} />
        <FieldError>{err?.message}</FieldError>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function Row({ g, compact, onChanged }: { g: PlayGame; compact: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const [show, setShow] = useState(false);
  const [bal, setBal] = useState(g.login?.last_balance || null);
  const [busy, setBusy] = useState<"" | "bal" | "create">("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const lg = g.login;

  async function refresh() {
    if (!lg) return;
    setBusy("bal"); setError("");
    try { const r = await apiFetch<{ balance: string }>(`/play/accounts/${lg.id}/balance/`, { token }); setBal(r.balance); }
    catch (e) { setError(errorText(e)); } finally { setBusy(""); }
  }
  // API-connected game: fetch the live balance on its own when the page opens
  useEffect(() => { if (lg && g.automated) void refresh(); }, [lg?.id, g.automated]); // eslint-disable-line react-hooks/exhaustive-deps -- once per login
  async function create() {
    setBusy("create"); setError("");
    try { await apiFetch("/play/accounts/", { method: "POST", token, body: { game: g.id } }); onChanged(); }
    catch (e) { setError(errorText(e)); setBusy(""); }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
      <Link href={`/${g.slug}`} aria-label={`About ${g.name}`} className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {g.thumbnail ? <Image src={mediaUrl(g.logo || g.thumbnail)} alt="" fill sizes="48px" className="object-cover" /> : <Gamepad2 className="size-5" aria-hidden />}
      </Link>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-center gap-2">
          <b className="truncate">{g.name}</b>
          {lg && g.automated && (
            <Button variant="ghost" size="xs" onClick={refresh} disabled={busy === "bal"} aria-label="Check live balance" className="tabular-nums">
              {busy === "bal" ? "…" : bal ? money(bal) : "Balance"}<RefreshCw aria-hidden />
            </Button>
          )}
        </div>
        {lg ? (
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1"><dt className="text-muted-foreground">User</dt>
              <dd className="flex items-center"><code className="rounded bg-background/60 px-1.5 py-0.5 font-mono">{lg.username}</code><CopyButton value={lg.username} label="username" size="icon-xs" /></dd></div>
            {lg.password && (
              <div className="flex items-center gap-1"><dt className="text-muted-foreground">Password</dt>
                <dd className="flex items-center"><code className="rounded bg-background/60 px-1.5 py-0.5 font-mono">{show ? lg.password : "••••••"}</code>
                  <Button variant="ghost" size="icon-xs" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
                    {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                  <CopyButton value={lg.password} label="password" size="icon-xs" /></dd></div>
            )}
          </dl>
        ) : adding ? (
          <AddUsername game={g} onDone={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {g.self_serve && g.automated ? "Get a free login — made instantly."
              : <>No account yet. Load it once and we'll make one, or{" "}
                <button type="button" className="inline-flex min-h-11 items-center font-semibold text-brand-text underline underline-offset-2" onClick={() => setAdding(true)}>add your username</button>.</>}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      </div>
      {!adding && (
        <div className="flex flex-wrap gap-2">
          {lg ? (
            <>
              <Button asChild size="sm"><Link href={`/load?game=${g.id}`}><Zap aria-hidden />Load</Link></Button>
              {!compact && <Button asChild size="sm" variant="outline"><Link href={`/load?tab=redeem&game=${g.id}`}>Cash out</Link></Button>}
              {g.play_url && <Button asChild size="sm" variant="outline"><a href={g.play_url} target="_blank" rel="noopener noreferrer"><Play aria-hidden />Play</a></Button>}
            </>
          ) : g.self_serve && g.automated ? (
            <Button size="sm" onClick={create} disabled={busy === "create"} aria-busy={busy === "create"}>{busy === "create" ? "Creating…" : "Get account"}</Button>
          ) : (
            <Button asChild size="sm" variant="outline"><Link href={`/load?game=${g.id}`}><Zap aria-hidden />Load</Link></Button>
          )}
        </div>
      )}
    </li>
  );
}

/** The player's game accounts (and games they can still get one on). */
export function GameLoginsVault({ compact = false }: { compact?: boolean }) {
  const { token } = useAuth();
  const [games, setGames] = useState<PlayGame[] | null>(null);
  const [more, setMore] = useState(false);
  const load = useCallback(() => {
    apiFetch<PlayOptions>("/play/options/", { token }).then((o) => setGames(o.games)).catch(() => setGames([]));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (games === null) return <div className="grid gap-2">{[0, 1].map((i) => <Skeleton key={i} className="h-[4.5rem]" />)}</div>;
  const mine = games.filter((g) => g.login);
  const rest = games.filter((g) => !g.login);
  const shown = compact ? [...mine, ...rest.slice(0, Math.max(0, 3 - mine.length))] : [...mine, ...(more || !mine.length ? rest : [])];
  if (!shown.length) {
    return (
      <Empty className="border">
        <EmptyHeader><EmptyMedia variant="icon"><KeyRound aria-hidden /></EmptyMedia>
          <EmptyTitle>No game logins yet</EmptyTitle><EmptyDescription>Load a game and your login will appear here.</EmptyDescription></EmptyHeader>
        <EmptyContent><Button asChild><Link href="/load">Load a game</Link></Button></EmptyContent>
      </Empty>
    );
  }
  return (
    <div className="grid gap-2">
      <ul className="grid gap-2">{shown.map((g) => <Row key={g.id} g={g} compact={compact} onChanged={load} />)}</ul>
      {!compact && mine.length > 0 && rest.length > 0 && (
        <Button variant="outline" className="border-dashed" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <ChevronDown className={more ? "rotate-180 transition-transform duration-200" : "transition-transform duration-200"} aria-hidden />
          {more ? "Hide other games" : `Other games (${rest.length})`}
        </Button>
      )}
    </div>
  );
}
