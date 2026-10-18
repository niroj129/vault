import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment status", robots: { index: false } };

const MAP = {
  succeeded: { Icon: CheckCircle2, tone: "text-success", title: "Payment successful", msg: "Your payment went through. You can close this page." },
  failed: { Icon: XCircle, tone: "text-destructive-text", title: "Payment failed", msg: "The payment didn't complete. Please try again or contact support." },
  processing: { Icon: Clock, tone: "text-warning", title: "Payment processing", msg: "Your payment is being processed. This can take a moment." },
};

export default async function PayReturn({ searchParams }: { searchParams: Promise<{ status?: string; amount?: string; mchOrderNo?: string }> }) {
  const sp = await searchParams;
  const info = MAP[(sp.status || "processing").toLowerCase() as keyof typeof MAP] || MAP.processing;
  const amount = sp.amount ? `$${(Number(sp.amount) / 100).toFixed(2)}` : null;
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Card className="glass w-full max-w-md text-center">
        <CardContent className="grid justify-items-center gap-3 py-4">
          <info.Icon className={`size-14 ${info.tone}`} aria-hidden />
          <h1 className="text-2xl">{info.title}</h1>
          {amount && <p className="text-3xl font-bold tabular-nums">{amount}</p>}
          <p className="text-muted-foreground">{info.msg}</p>
          {sp.mchOrderNo && <p className="text-sm text-muted-foreground">Ref: <span className="font-mono">{sp.mchOrderNo}</span></p>}
          <Button asChild className="mt-2"><Link href="/">Back to home</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
