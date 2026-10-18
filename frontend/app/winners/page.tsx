import { Play, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mediaUrl } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { getJSONSafe } from "@/lib/server-api";
import type { Winner } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Winners", description: "See the latest big winners across Juwa, Game Vault, Orion Stars and more." };

function Face({ w, size }: { w: Winner; size: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-warning/20 font-bold text-warning" style={{ width: size, height: size, fontSize: size / 2.6 }} aria-hidden>
      {w.photo ? <Image src={mediaUrl(w.photo)} alt="" fill sizes={`${size}px`} className="object-cover" /> : w.name[0]}
    </span>
  );
}

export default async function WinnersPage() {
  const winners = await getJSONSafe<Winner[]>("/winners/", []);
  const total = winners.reduce((s, w) => s + Number(w.amount || 0), 0);
  const top = [...winners].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 3);
  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Hall of fame" title="Winners" description={`${winners.length} recent wins · ${money(total)} paid out`}
        actions={<Button asChild><Link href="/games"><Play aria-hidden />Play now</Link></Button>} />
      {top.length > 0 && (
        <section aria-label="Biggest wins">
          <ol className="grid gap-4 sm:grid-cols-3">
            {top.map((w, i) => (
              <li key={w.id} className={cn(i === 0 && "sm:order-2", i === 1 && "sm:order-1", i === 2 && "sm:order-3")}>
                <Card className={cn("glass h-full", i === 0 && "ring-2 ring-warning/60 sm:-translate-y-3")}>
                  <CardContent className="grid justify-items-center gap-2 text-center">
                    <span className={cn("grid size-8 place-items-center rounded-md text-sm font-bold", i === 0 ? "bg-warning text-background" : "bg-muted")}>
                      <span className="sr-only">Rank </span>{i + 1}
                    </span>
                    <Face w={w} size={56} />
                    <b>{w.name}</b>
                    <span className="text-3xl font-bold text-warning tabular-nums">{money(w.amount)}</span>
                    <span className="text-sm text-muted-foreground">{w.game || "Jackpot"} · {shortDate(w.win_date)}</span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}
      {winners.length ? (
        <Card className="glass py-0">
          <Table>
            <caption className="sr-only">All recent wins</caption>
            <TableHeader><TableRow><TableHead className="pl-6">Player</TableHead><TableHead>Game</TableHead><TableHead>Date</TableHead><TableHead className="pr-6 text-right">Win</TableHead></TableRow></TableHeader>
            <TableBody>
              {winners.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="pl-6"><span className="flex items-center gap-3"><Face w={w} size={32} /><b>{w.name}</b></span></TableCell>
                  <TableCell className="text-muted-foreground">{w.game || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(w.win_date)}</TableCell>
                  <TableCell className="pr-6 text-right font-bold text-warning tabular-nums">{money(w.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Trophy aria-hidden /></EmptyMedia><EmptyTitle>No winners yet</EmptyTitle>
          <EmptyDescription>Big wins show up here as they happen.</EmptyDescription></EmptyHeader></Empty>
      )}
    </div>
  );
}
