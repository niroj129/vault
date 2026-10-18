"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Dices, Eye, EyeOff, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { genPassword } from "@/components/agent/credentials";
import { CopyButton } from "@/components/common/copy-button";
import { ChoiceCards } from "@/components/play/choice-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Platform, PlatformLogin } from "@/lib/types";
import { PlayerPicker } from "./player-picker";

const schema = z.object({ username: z.string().trim().min(3, "At least 3 characters.").max(32).regex(/^[A-Za-z0-9_.-]+$/, "Letters, numbers, dots, dashes and underscores only."), password: z.string().min(6, "At least 6 characters.") });
type Values = z.infer<typeof schema>;

/** Plain wrapper inside a dialog, a card on a page. Defined out here so it isn't re-created (and the form remounted) on every render. */
function Wrap({ bare, children }: { bare?: boolean; children: React.ReactNode }) {
  return bare ? <div className="grid gap-4">{children}</div> : <Card className="glass"><CardContent className="grid gap-4">{children}</CardContent></Card>;
}

/** Create a new account on the platform, optionally tied to a site player (an existing one or a new one). */
export function CreateAccount({ platform, prefill, onCreated, onOpen, bare }: { platform: Platform; prefill: string; onCreated: () => void; onOpen: (username: string) => void; bare?: boolean }) {
  const { token } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: prefill, password: genPassword() } });
  const { errors, isSubmitting } = form.formState;
  const [show, setShow] = useState(false);
  const [who, setWho] = useState<"none" | "existing" | "new">("none");
  const [player, setPlayer] = useState<number | null>(null);
  const [game, setGame] = useState<string>(String(platform.games[0]?.id ?? ""));
  const [made, setMade] = useState<{ username: string; password: string; login: PlatformLogin | null; site: string | null } | null>(null);
  useEffect(() => { if (prefill) form.setValue("username", prefill); }, [prefill, form]);
  // only when the platform itself changes — the list reloads (new objects) right after a create, and that must not wipe the result screen
  const firstGame = platform.games[0]?.id;
  useEffect(() => { setGame(String(firstGame ?? "")); }, [platform.id, firstGame]);
  useEffect(() => { setMade(null); }, [platform.id]);
  const canLink = platform.games.length > 0;

  async function submit(v: Values) {
    if (who === "existing" && !player) { form.setError("root", { message: "Choose the player, or pick another option." }); return; }
    try {
      const r = await apiFetch<{ username: string; password: string; login: PlatformLogin | null; site_password: string | null }>(`/admin/platforms/${platform.id}/create/`, {
        method: "POST", token, body: { username: v.username.trim(), password: v.password, game: Number(game) || undefined, ...(who === "existing" ? { user: player } : who === "new" ? { new_player: true } : {}) } });
      setMade({ username: r.username, password: r.password, login: r.login, site: r.site_password }); onCreated();
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  if (made) {
    return (
      <Wrap bare={bare}>
        <h2 className="text-lg font-semibold">Account created on {platform.name}</h2>
        <dl className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-2"><dt className="w-24 text-muted-foreground">Login name</dt><dd className="flex items-center gap-1"><code className="font-mono font-semibold">{made.username}</code><CopyButton value={made.username} label="login name" size="icon-xs" /></dd></div>
          <div className="flex items-center gap-2"><dt className="w-24 text-muted-foreground">Password</dt><dd className="flex items-center gap-1"><code className="font-mono font-semibold">{made.password}</code><CopyButton value={made.password} label="password" size="icon-xs" /></dd></div>
          {made.login && <div className="flex items-center gap-2"><dt className="w-24 text-muted-foreground">Player</dt><dd>@{made.login.player.username}</dd></div>}
          {made.site && <div className="flex items-center gap-2"><dt className="w-24 text-muted-foreground">Site login</dt><dd className="flex items-center gap-1"><code className="font-mono font-semibold">{made.login?.player.username} / {made.site}</code><CopyButton value={`${made.login?.player.username} / ${made.site}`} label="site login" size="icon-xs" /></dd></div>}
        </dl>
        <div className="flex flex-wrap gap-2"><Button onClick={() => onOpen(made.username)}>Open account</Button><Button variant="outline" onClick={() => { setMade(null); form.reset({ username: "", password: genPassword() }); setWho("none"); setPlayer(null); }}>Create another</Button></div>
      </Wrap>
    );
  }

  return (
    <Wrap bare={bare}>
      <form noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
        <Field data-invalid={!!errors.username}><FieldLabel htmlFor="ca-user">Login name</FieldLabel>
          <Input id="ca-user" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...form.register("username")} />
          <FieldDescription>The name the player types into {platform.name}.</FieldDescription><FieldError>{errors.username?.message}</FieldError></Field>
        <Field data-invalid={!!errors.password}><FieldLabel htmlFor="ca-pw">Password</FieldLabel>
          <InputGroup>
            <InputGroupInput id="ca-pw" type={show ? "text" : "password"} autoComplete="new-password" className="font-mono" aria-invalid={!!errors.password} {...form.register("password")} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="button" size="icon-xs" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>{show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</InputGroupButton>
              <InputGroupButton type="button" size="icon-xs" aria-label="Make a new password" onClick={() => form.setValue("password", genPassword(), { shouldValidate: true })}><Dices aria-hidden /></InputGroupButton>
            </InputGroupAddon>
          </InputGroup><FieldError>{errors.password?.message}</FieldError></Field>
        {canLink ? (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Whose account is it?</legend>
            <ChoiceCards label="Whose account is it" value={who} onChange={(v) => setWho(v as typeof who)} className="sm:grid-cols-3" choices={[
              { value: "none", label: "Nobody yet", description: "Just create it" }, { value: "existing", label: "A player I have", description: "Tie it to them" }, { value: "new", label: "A new player", description: "Create their site login too" }]} />
            {who === "existing" && <PlayerPicker value={player} onChange={setPlayer} />}
            {platform.games.length > 1 && (
              <Field><FieldLabel htmlFor="ca-game">Game</FieldLabel>
                <Select value={game} onValueChange={setGame}><SelectTrigger id="ca-game" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>{platform.games.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent></Select></Field>
            )}
          </fieldset>
        ) : <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">No game is linked to this connection yet, so the account can&apos;t be tied to a player. Set the game&apos;s <b>Loading</b> to {platform.name} under Games &amp; images.</p>}
        {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
        <Button type="submit" className="w-fit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? <><Spinner aria-hidden />Creating…</> : <><Plus aria-hidden />Create account</>}</Button>
      </form>
    </Wrap>
  );
}
