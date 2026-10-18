"use client";

import { Check, CheckCircle2, ExternalLink, Headset, KeyRound, MessageCircle, Play, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Deposit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PayTo } from "./pay-to";
import { ProofPicker } from "./proof-picker";

function Countdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!until) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <span className="tabular-nums">{left ? `expires in ${m}:${String(s).padStart(2, "0")}` : "expired"}</span>;
}

type StepState = "done" | "now" | "todo" | "bad";
function Steps({ steps }: { steps: [string, StepState][] }) {
  return (
    <ol aria-label="Progress" className="grid gap-2 sm:grid-cols-3">
      {steps.map(([label, st], i) => (
        <li key={label} aria-current={st === "now" ? "step" : undefined}
          className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm font-medium", st === "now" && "border-primary ring-2 ring-primary/30", st === "todo" && "text-muted-foreground")}>
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
            st === "done" && "bg-success text-background", st === "now" && "bg-primary text-primary-foreground", st === "bad" && "bg-destructive text-destructive-foreground", st === "todo" && "bg-muted")}>
            {st === "done" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : st === "bad" ? <XCircle className="size-4" aria-hidden /> : i + 1}
          </span>
          {label}<span className="sr-only"> — {st === "done" ? "done" : st === "now" ? "in progress" : st === "bad" ? "stopped" : "next"}</span>
        </li>
      ))}
    </ol>
  );
}

/** One payment, live: polls until the credits are on the game (staff may load by hand). */
export function DepositStatus({ refId, onNew }: { refId: string; onNew: () => void }) {
  const { token } = useAuth();
  const [d, setD] = useState<Deposit | null>(null);
  const [error, setError] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    apiFetch<Deposit>(`/play/deposits/${refId}/`, { token }).then((x) => { setD(x); setError(""); }).catch((e) => setError(errorText(e)));
  }, [refId, token]);
  useEffect(() => { load(); }, [load]);
  const done = !!d && (d.load_status === "loaded" || ["rejected", "expired", "failed"].includes(d.status));
  useEffect(() => {
    if (done) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [done, load]);

  async function sendProof(f: File) {
    setProof(f); setSending(true); setError("");
    const fd = new FormData(); fd.append("proof", f);
    try { setD(await apiFetch<Deposit>(`/play/deposits/${refId}/`, { method: "POST", token, body: fd })); setProof(null); }
    catch (e) { setError(errorText(e)); } finally { setSending(false); }
  }

  if (!d && error) return <p role="alert" className="rounded-md bg-destructive/15 p-4 text-destructive-text">{error}</p>;
  if (!d) return <Skeleton className="h-72 max-w-2xl rounded-xl" />;

  const failed = ["rejected", "expired", "failed"].includes(d.status);
  const paid = d.status === "approved";
  const loaded = d.load_status === "loaded";
  const steps: [string, StepState][] = d.direct
    ? [["Sent", "done"], ["Payment checked", failed ? "bad" : paid ? "done" : "now"], ["Credits loaded", loaded ? "done" : paid ? "now" : "todo"]]
    : [["Pay", failed ? "bad" : paid ? "done" : "now"], ["Payment confirmed", paid ? "done" : "todo"], ["Credits loaded", loaded ? "done" : paid ? "now" : "todo"]];

  return (
    <Card className="glass max-w-2xl" aria-live="polite" aria-busy={!done}>
      <CardHeader className="flex flex-row items-center gap-4">
        {d.game?.thumbnail && (
          <span className="relative size-14 shrink-0 overflow-hidden rounded-lg"><Image src={mediaUrl(d.game.logo || d.game.thumbnail)} alt="" fill sizes="56px" className="object-cover" /></span>
        )}
        <div className="grid">
          <p className="text-sm text-muted-foreground">{d.method_label} · {d.direct ? <>code <b className="font-mono">{d.code}</b></> : `ref ${d.reference.slice(-8)}`}</p>
          <h2 className="text-2xl">{money(d.amount)} for {d.game?.name || "your game"}</h2>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Steps steps={steps} />

        {d.status === "pending" && d.direct && (
          <div className="grid gap-4">
            <p className="flex items-center gap-3 rounded-lg bg-muted p-4"><Spinner className="size-5" aria-hidden />We&apos;re checking your {d.method_label} payment — usually a few minutes.</p>
            <div className="flex items-start gap-4">
              {d.proof && (
                <a href={mediaUrl(d.proof)} target="_blank" rel="noopener noreferrer" className="relative block h-28 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-border" aria-label="Open your screenshot">
                  <Image src={mediaUrl(d.proof)} alt="Your payment screenshot" fill sizes="80px" className="object-cover" />
                </a>
              )}
              <div className="grid flex-1 gap-2">
                <p className="text-sm">{d.proof ? <><b>Screenshot received.</b> <span className="text-muted-foreground">Wrong one? Upload another.</span></>
                  : <><b>No screenshot yet.</b> <span className="text-muted-foreground">Adding one gets you loaded faster.</span></>}</p>
                <ProofPicker file={proof} onFile={sendProof} label={d.proof ? "Upload a different screenshot" : "Upload your screenshot"} hint="Tap to choose, or drop an image here" />
                {sending && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner aria-hidden />Uploading…</p>}
              </div>
            </div>
            {d.pay_to && (
              <details className="group rounded-lg border p-3">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-text">Haven&apos;t sent it yet? Show the {d.method_label} details</summary>
                <div className="pt-3"><PayTo name={d.method_label} handle={d.pay_to.handle} accountName={d.pay_to.account_name} qr={d.pay_to.qr} amount={d.amount} /></div>
              </details>
            )}
          </div>
        )}

        {d.status === "pending" && !d.direct && (
          <div className="grid justify-items-start gap-3">
            {d.tag ? (
              <>
                <p>Send exactly <b>{money(d.amount)}</b> with {d.method_label} to:</p>
                <div className="flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-3"><code className="font-mono text-lg font-bold">{d.tag}</code><CopyButton value={d.tag} label="tag" /></div>
                {d.tag_email && <div className="flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-3"><code className="font-mono">{d.tag_email}</code><CopyButton value={d.tag_email} label="email" /></div>}
              </>
            ) : d.checkout_url ? (
              <>
                <p>Finish paying on the secure {d.method_label} page. This screen updates by itself.</p>
                <Button asChild size="lg"><a href={d.checkout_url}><ExternalLink aria-hidden />Open {d.method_label} checkout</a></Button>
              </>
            ) : <p className="text-muted-foreground">Waiting for the payment provider…</p>}
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Waiting for your payment · <Countdown until={d.expires_at} /></p>
          </div>
        )}

        {paid && (d.load_status === "queued" || d.load_status === "loading") && (
          <p className="flex items-center gap-3 rounded-lg bg-muted p-4"><Spinner className="size-5" aria-hidden />Payment received — loading {d.game?.name}…</p>
        )}

        {loaded && (
          <div className="grid justify-items-center gap-2 py-2 text-center">
            <CheckCircle2 className="size-12 text-success" aria-hidden />
            <h3 className="text-xl">{money(d.credit_amount || d.amount)} in credits is on {d.game?.name}</h3>
            <p className="text-muted-foreground">Your login is in Game logins — open the game and play.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {d.game?.play_url && <Button asChild><a href={d.game.play_url} target="_blank" rel="noopener noreferrer"><Play aria-hidden />Play {d.game.name}</a></Button>}
              <Button asChild variant="outline"><Link href="/profile#logins"><KeyRound aria-hidden />My game logins</Link></Button>
              <Button variant="ghost" onClick={onNew}>Load again</Button>
            </div>
          </div>
        )}

        {paid && (d.load_status === "failed" || d.load_status === "manual") && (
          <div className="grid justify-items-center gap-2 py-2 text-center">
            <Headset className="size-12 text-warning" aria-hidden />
            <h3 className="text-xl">Payment received</h3>
            <p className="max-w-prose text-muted-foreground">Our team is loading {d.game?.name || "your game"} now. You&apos;ll get a message in Support and a notification the moment it&apos;s done.</p>
            <Button asChild className="mt-2"><Link href="/messages?c=support"><MessageCircle aria-hidden />Message support</Link></Button>
          </div>
        )}

        {failed && (
          <div className="grid justify-items-center gap-2 py-2 text-center">
            <XCircle className="size-12 text-destructive-text" aria-hidden />
            <h3 className="text-xl">{d.direct ? "We couldn't find this payment" : `Payment ${d.status_label.toLowerCase()}`}</h3>
            <p className="max-w-prose text-muted-foreground">{d.direct ? (d.reason || "Message support with your screenshot and we'll sort it out.") : "You weren't charged. Start a new payment to try again."}</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {d.direct && <Button asChild variant="outline"><Link href="/messages?c=support"><MessageCircle aria-hidden />Message support</Link></Button>}
              <Button onClick={onNew}>Try again</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      </CardContent>
    </Card>
  );
}
