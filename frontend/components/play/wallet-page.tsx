"use client";

import { MessageCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PlayOptions } from "@/lib/types";
import { DepositStatus } from "./deposit-status";
import { FreePlayCard } from "./free-play-card";
import { History } from "./history";
import { LoadForm } from "./load-form";
import { RedeemForm } from "./redeem-form";

const TABS = [["load", "Load"], ["redeem", "Cash out"], ["history", "History"]] as const;

/** Load & cash out. Tabs live in the URL (?tab=), so they deep-link and Back works. */
export function WalletPage() {
  const { token } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get("ref");
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab")! : "load";
  const preselect = Number(params.get("game")) || null;
  const promoParam = (params.get("promo") || "").slice(0, 40);
  const freeParam = (params.get("freeplay") || "").slice(0, 40);
  const [opts, setOpts] = useState<PlayOptions | null>(null);
  const [error, setError] = useState("");
  const loadOpts = useCallback(() => { apiFetch<PlayOptions>("/play/options/", { token }).then(setOpts).catch((e) => setError(errorText(e))); }, [token]);
  useEffect(() => { loadOpts(); }, [loadOpts]);
  const go = (q: string) => router.push(`/load${q ? `?${q}` : ""}`);

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Wallet" title={ref ? "Your payment" : "Load & cash out"} description="Pay with the app you like — we load your game as soon as it clears." />
      {params.get("welcome") && <Alert><AlertDescription>Welcome aboard! Pick a game below to get started.</AlertDescription></Alert>}
      {error && <p role="alert" className="rounded-md bg-destructive/15 p-4 text-destructive-text">{error}</p>}
      {ref ? <DepositStatus refId={ref} onNew={() => go("")} /> : (
        <Tabs value={tab} onValueChange={(v) => go(v === "load" ? "" : `tab=${v}`)} className="gap-6">
          <TabsList className="w-full sm:w-fit">
            {TABS.map(([k, l]) => <TabsTrigger key={k} value={k} className="flex-1 px-5 sm:flex-none">{l}</TabsTrigger>)}
          </TabsList>
          {!opts ? <Skeleton className="h-96 rounded-xl" /> : (
            <>
              <TabsContent value="load" className="grid gap-4">
                <FreePlayCard games={opts.games} preselect={preselect} initialCode={freeParam} onRedeemed={(r) => go(`ref=${r}`)} />
                {opts.payments_on ? <LoadForm opts={opts} preselect={preselect} initialPromo={promoParam} onStarted={(r) => go(`ref=${r}`)} /> : (
                  <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Wallet aria-hidden /></EmptyMedia><EmptyTitle>Online payments aren&apos;t on yet</EmptyTitle>
                    <EmptyDescription>Message support and an agent will load your game.</EmptyDescription></EmptyHeader>
                    <EmptyContent><Button asChild><Link href="/messages?c=support"><MessageCircle aria-hidden />Message support</Link></Button></EmptyContent></Empty>
                )}
              </TabsContent>
              <TabsContent value="redeem"><RedeemForm opts={opts} preselect={preselect} onRequested={loadOpts} /></TabsContent>
              <TabsContent value="history"><History /></TabsContent>
            </>
          )}
        </Tabs>
      )}
    </div>
  );
}
