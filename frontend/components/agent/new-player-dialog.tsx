"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Copy, Dices, Eye, EyeOff, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, fieldErrors } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminUser, Game, StaffLogin } from "@/lib/types";
import { genPassword, suggestUsername } from "./credentials";

const schema = z.object({
  full_name: z.string().trim().max(150),
  username: z.string().trim().min(3, "At least 3 characters.").max(30, "30 characters at most.").regex(/^[A-Za-z0-9_.-]+$/, "Letters, numbers, dots, dashes and underscores only."),
  phone: z.string().trim().max(30),
  password: z.string().min(6, "At least 6 characters."),
});
type Values = z.infer<typeof schema>;
interface Made { game: string; ok: boolean; username?: string; password?: string; error?: string }

/** New player in one step: the site account, plus a game account on every connected game you tick. */
export function NewPlayerDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: (id: number | null) => void }) {
  const { token } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<{ player: AdminUser; password: string; made: Made[] } | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: "", username: "", phone: "", password: genPassword() } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) return;
    setResult(null); form.reset({ full_name: "", username: "", phone: "", password: genPassword() }); setShow(false);
    apiFetch<Game[]>("/games/", { token }).then((all) => {
      const api = all.filter((g) => g.status === "active" && g.provider);
      setGames(api); setPicked(new Set(api.map((g) => g.id)));
    }).catch(() => setGames([]));
  }, [open, token, form]);

  async function submit(v: Values) {
    let player: AdminUser;
    try {
      player = await apiFetch<AdminUser>("/users/", { method: "POST", token, body: { username: v.username.trim(), full_name: v.full_name.trim(), phone: v.phone.trim(), password: v.password, is_active: true } });
    } catch (e) {
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) Object.entries(fe).forEach(([k, m]) => form.setError(k in v ? (k as keyof Values) : "root", { message: m }));
      else form.setError("root", { message: errorText(e) });
      return;
    }
    const made: Made[] = [];
    for (const g of games.filter((x) => picked.has(x.id))) {
      try {
        const r = await apiFetch<{ login: StaffLogin }>("/admin/game-accounts/", { method: "POST", token, body: { action: "create", user: player.id, game: g.id } });
        made.push({ game: g.name, ok: true, username: r.login.username, password: r.login.password });
      } catch (e) { made.push({ game: g.name, ok: false, error: errorText(e) }); }
    }
    setResult({ player, password: v.password, made });
    onDone(null);
  }

  const copyAll = result && [
    `${result.player.full_name || result.player.username} — your logins`,
    `Site: ${typeof window !== "undefined" ? window.location.origin : ""}`, `Username: ${result.player.username}`, `Password: ${result.password}`,
    ...result.made.filter((m) => m.ok).map((m) => `${m.game}: ${m.username} / ${m.password}`),
  ].join("\n");
  const [uname, pw] = form.watch(["username", "password"]);

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>New player</DialogTitle>
              <DialogDescription>Creates their account on the site and on the games you tick. You&apos;ll get the logins to send them.</DialogDescription>
            </DialogHeader>
            <form id="new-player" noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.full_name}><FieldLabel htmlFor="np-name">Name <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                  <Input id="np-name" autoComplete="off" {...form.register("full_name")} /><FieldError>{errors.full_name?.message}</FieldError></Field>
                <Field data-invalid={!!errors.phone}><FieldLabel htmlFor="np-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                  <Input id="np-phone" type="tel" autoComplete="off" inputMode="tel" {...form.register("phone")} /><FieldError>{errors.phone?.message}</FieldError></Field>
              </div>
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="np-user">Username</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="np-user" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...form.register("username")} />
                  <InputGroupAddon align="inline-end"><InputGroupButton type="button" onClick={() => form.setValue("username", suggestUsername(form.getValues("full_name")), { shouldValidate: true })}><Sparkles aria-hidden />Suggest</InputGroupButton></InputGroupAddon>
                </InputGroup>
                <FieldError>{errors.username?.message}</FieldError>
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="np-pw">Password</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="np-pw" type={show ? "text" : "password"} autoComplete="new-password" className="font-mono" aria-invalid={!!errors.password} {...form.register("password")} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton type="button" size="icon-xs" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>{show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</InputGroupButton>
                    <InputGroupButton type="button" size="icon-xs" aria-label="Make a new password" onClick={() => form.setValue("password", genPassword(), { shouldValidate: true })}><Dices aria-hidden /></InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>We made one for you. Change it if the player asked for something specific.</FieldDescription>
                <FieldError>{errors.password?.message}</FieldError>
              </Field>
              {games.length > 0 && (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">Create game accounts now <span className="font-normal text-muted-foreground">(connected games)</span></legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {games.map((g) => (
                      <label key={g.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-muted/40 px-3 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                        <Checkbox checked={picked.has(g.id)} onCheckedChange={(c) => setPicked((s) => { const n = new Set(s); if (c === true) n.add(g.id); else n.delete(g.id); return n; })} />
                        <span className="text-sm font-medium">{g.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">Other games need a username added by hand — open the player after creating them.</p>
                </fieldset>
              )}
              {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
            </form>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" form="new-player" disabled={isSubmitting || !uname || !pw} aria-busy={isSubmitting}>
                {isSubmitting ? <><Spinner aria-hidden />Creating…</> : <><Plus aria-hidden />Create player</>}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{result.player.full_name || result.player.username} is ready</DialogTitle>
              <DialogDescription>Send these logins to the player. The passwords stay visible in their profile if you need them again.</DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2" aria-label="Logins">
              <li className="grid gap-1 rounded-lg border bg-muted/40 p-3">
                <b>Site</b>
                <Cred label="Username" value={result.player.username} />
                <Cred label="Password" value={result.password} />
              </li>
              {result.made.map((m) => (
                <li key={m.game} className="grid gap-1 rounded-lg border bg-muted/40 p-3">
                  <b>{m.game}</b>
                  {m.ok ? <><Cred label="Username" value={m.username || ""} /><Cred label="Password" value={m.password || ""} /></>
                    : <p className="flex items-start gap-2 text-sm text-destructive-text"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />Couldn&apos;t create it: {m.error}. Try again from the player&apos;s page.</p>}
                </li>
              ))}
            </ul>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(copyAll || "").then(() => toast.success("All logins copied")).catch(() => toast.error("Couldn't copy")); }}><Copy aria-hidden />Copy all</Button>
              <Button variant="outline" onClick={() => { setResult(null); form.reset({ full_name: "", username: "", phone: "", password: genPassword() }); }}>Add another</Button>
              <Button onClick={() => { onOpenChange(false); onDone(result.player.id); }}>Open player</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Cred({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono font-semibold">{value}</code>
      <CopyButton value={value} label={label.toLowerCase()} size="icon-xs" />
    </div>
  );
}
