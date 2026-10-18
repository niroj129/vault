import { Mail, ShieldCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { StatusBadge, type Tone } from "@/components/play/status-badge";
import { ago, money } from "@/lib/format";
import { payLabel } from "@/lib/pay-brands";
import type { MailEvidence, MailMatch, Money } from "@/lib/types";

export const matchTone = (m: MailMatch): Tone => (m === "code" || m === "linked" ? "ok" : m === "likely" ? "wait" : "neutral");

/** The forwarded payment email behind a QR payment, shown where staff decide. Evidence only. */
export function MailEvidenceBox({ e, expected }: { e: MailEvidence; expected: Money }) {
  const off = e.amount != null && Number(e.amount) !== Number(expected);
  return (
    <div className="grid gap-1.5 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-semibold"><Mail className="size-4 text-info" aria-hidden />Payment email
        <StatusBadge tone={matchTone(e.match)}>{e.match_label}</StatusBadge>
        <Link href={`/admin/mail?id=${e.id}`} className="ml-auto inline-flex min-h-8 items-center text-sm font-medium text-brand-text underline-offset-4 hover:underline">View email</Link></p>
      <p><b className="tabular-nums">{money(e.amount)}</b> from <b>{e.payer || "unknown"}</b>{e.app ? ` by ${payLabel(e.app === "cashapp" ? "ecashapp" : e.app)}` : ""} · {ago(e.received_at)}</p>
      {e.note && <p className="text-muted-foreground">Note: “{e.note}”</p>}
      <p className="flex items-center gap-1.5 text-muted-foreground">
        {e.verified ? <><ShieldCheck className="size-4 text-success" aria-hidden />Sender checked: really from {payLabel(e.app === "cashapp" ? "ecashapp" : e.app)}</>
          : <><ShieldQuestion className="size-4 text-warning" aria-hidden />Sender not verified. Check your app before approving.</>}</p>
      {off && <p className="flex items-center gap-1.5 font-medium text-warning"><TriangleAlert className="size-4" aria-hidden />The email says {money(e.amount)}, the player said {money(expected)}.</p>}
    </div>
  );
}
