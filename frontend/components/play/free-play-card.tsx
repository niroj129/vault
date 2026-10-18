"use client";

import { Gift } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Deposit, PlayGame } from "@/lib/types";

/** Redeem a free play code: credits go on the game with no payment (loaded by API when the game has one). */
export function FreePlayCard({ games, preselect, initialCode, onRedeemed }: { games: PlayGame[]; preselect: number | null; initialCode: string; onRedeemed: (ref: string) => void }) {
  const { token } = useAuth();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [gameId, setGameId] = useState(String(preselect && games.some((g) => g.id === preselect) ? preselect : games[0]?.id ?? ""));
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const game = games.find((g) => String(g.id) === gameId);
  if (!games.length) return null;

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !game) return;
    setBusy(true); setError("");
    try {
      const d = await apiFetch<Deposit>("/play/freeplay/", { method: "POST", token, body: { code: code.trim(), game: game.id, game_username: username.trim() || undefined } });
      onRedeemed(d.reference);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Gift className="size-5 text-brand-text" aria-hidden /><h2>Free play code</h2></CardTitle>
        <CardDescription>Got a free play code? Enter it to get free credits on a game — no payment needed.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={redeem} noValidate className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="fp-code">Code</FieldLabel>
            <Input id="fp-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono uppercase" aria-invalid={!!error} aria-describedby="fp-help" />
          </Field>
          <Field>
            <FieldLabel htmlFor="fp-game">Load onto</FieldLabel>
            <Select value={gameId} onValueChange={setGameId}><SelectTrigger id="fp-game" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{games.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent></Select>
          </Field>
          <Button type="submit" className="sm:mt-[1.625rem]" disabled={!code.trim() || busy} aria-busy={busy}>{busy ? <><Spinner aria-hidden />Redeeming…</> : "Redeem"}</Button>
          {game && !game.login && !game.automated && (
            <Field className="sm:col-span-3">
              <FieldLabel htmlFor="fp-user">Your {game.name} username <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id="fp-user" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={120} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="e.g. maya_77" />
            </Field>
          )}
          <FieldDescription id="fp-help" role={error ? "alert" : undefined} className={`sm:col-span-3 ${error ? "text-destructive-text" : ""}`}>
            {error || (game?.automated ? `Credits are added to ${game.name} automatically.` : "Our team loads it for you and sends you a message.")}
          </FieldDescription>
        </form>
      </CardContent>
    </Card>
  );
}
