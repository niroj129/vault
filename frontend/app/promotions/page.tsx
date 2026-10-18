import { Clock, Gift, MessageCircle, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CopyCode } from "@/components/common/copy-code";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { mediaUrl } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { getJSONSafe } from "@/lib/server-api";
import type { Promo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promotions & Bonuses", description: "Current promotions, bonus codes and cashback offers for Juwa, Game Vault, Orion Stars and more." };

const hasBonus = (p: Promo) => !!p.code && (Number(p.bonus_percent) > 0 || Number(p.bonus_flat) > 0);

/** "+50% bonus (up to $25) · min $20 · one-time" */
function terms(p: Promo) {
  const give = [Number(p.bonus_percent) > 0 && `${Number(p.bonus_percent)}%`, Number(p.bonus_flat) > 0 && `$${Number(p.bonus_flat)}`].filter(Boolean).join(" + ");
  return [`+${give} bonus${Number(p.max_bonus) > 0 ? ` (up to $${Number(p.max_bonus)})` : ""}`,
    Number(p.min_deposit) > 0 && `min $${Number(p.min_deposit)} load`, p.usage === "once" ? "one-time per player" : "use it on every load"].filter(Boolean).join(" · ");
}

export default async function Promotions() {
  const promos = (await getJSONSafe<Promo[]>("/promos/", [])).filter((p) => p.active !== false);
  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Offers" title="Promotions" description="Enter a promo code on the Load page when you pay and the bonus credits are added to your load automatically." />
      {promos.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promos.map((p) => (
            <li key={p.id}>
              <Card className="dark relative isolate h-full overflow-hidden bg-[radial-gradient(90%_120%_at_100%_0%,color-mix(in_oklab,var(--primary)_45%,transparent),transparent_60%),linear-gradient(160deg,var(--secondary),var(--background))] text-foreground">
                {p.image && <Image src={mediaUrl(p.image)} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="-z-10 object-cover opacity-25" />}
                <CardHeader>
                  <span className="mb-2 grid size-11 place-items-center rounded-md bg-primary/25 text-brand-text"><Gift className="size-5" aria-hidden /></span>
                  <CardTitle className="text-xl"><h2>{p.title}</h2></CardTitle>
                </CardHeader>
                <CardContent className="flex-1">{p.description && <p className="max-w-prose text-foreground/85">{p.description}</p>}</CardContent>
                <CardFooter className="flex flex-wrap items-center gap-2">
                  {p.code && <CopyCode code={p.code} />}
                  {hasBonus(p) ? (
                    <Button asChild><Link href={`/load?promo=${encodeURIComponent(p.code)}`}><Wallet aria-hidden />Use at checkout</Link></Button>
                  ) : (
                    <Button asChild><Link href="/messages?c=support"><MessageCircle aria-hidden />Claim with an agent</Link></Button>
                  )}
                  {hasBonus(p) && <p className="w-full text-sm text-muted-foreground">{terms(p)}</p>}
                  {p.expires && <p className="flex w-full items-center gap-1.5 pt-1 text-sm text-muted-foreground"><Clock className="size-4" aria-hidden />Ends {shortDate(p.expires)}</p>}
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Gift aria-hidden /></EmptyMedia><EmptyTitle>No offers right now</EmptyTitle>
          <EmptyDescription>New promotions land every week — check back soon.</EmptyDescription></EmptyHeader></Empty>
      )}
    </div>
  );
}
