import { Clock, Gift, MessageCircle, Sparkles, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CopyCode } from "@/components/common/copy-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { mediaUrl } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { Promo } from "@/lib/types";

/** Gives a bonus a player can actually get (by code or automatically). */
export const hasBonus = (p: Promo) => Number(p.bonus_percent) > 0 || Number(p.bonus_flat) > 0;
export const isFreePlay = (p: Promo) => Number(p.free_credits) > 0;

/** "+50% bonus (up to $25) · min $20 load · one-time per player" */
export function terms(p: Promo) {
  if (isFreePlay(p)) return [`$${Number(p.free_credits)} free play credits — no payment needed`, p.usage === "once" ? "one-time per player" : "redeem it again anytime"].join(" · ");
  const give = [Number(p.bonus_percent) > 0 && `${Number(p.bonus_percent)}%`, Number(p.bonus_flat) > 0 && `$${Number(p.bonus_flat)}`].filter(Boolean).join(" + ");
  return [`+${give} bonus${Number(p.max_bonus) > 0 ? ` (up to $${Number(p.max_bonus)})` : ""}`,
    Number(p.min_deposit) > 0 && `min $${Number(p.min_deposit)} load`, p.usage === "once" ? "one-time per player" : "use it on every load"].filter(Boolean).join(" · ");
}

export function PromoCard({ p }: { p: Promo }) {
  const auto = p.auto_apply && hasBonus(p);
  const forYou = p.audience !== "all";
  return (
    <Card className="dark relative isolate h-full overflow-hidden bg-[radial-gradient(90%_120%_at_100%_0%,color-mix(in_oklab,var(--primary)_45%,transparent),transparent_60%),linear-gradient(160deg,var(--secondary),var(--background))] text-foreground">
      {p.image && <Image src={mediaUrl(p.image)} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="-z-10 object-cover opacity-25" />}
      <CardHeader>
        <span className="mb-2 grid size-11 place-items-center rounded-md bg-primary/25 text-brand-text"><Gift className="size-5" aria-hidden /></span>
        {(forYou || auto) && (
          <div className="flex flex-wrap gap-1.5">
            {forYou && <Badge className="gap-1"><Sparkles className="size-3" aria-hidden />Just for you</Badge>}
            {auto && <Badge variant="secondary">Added automatically</Badge>}
          </div>
        )}
        <CardTitle className="text-xl"><h2>{p.title}</h2></CardTitle>
      </CardHeader>
      <CardContent className="flex-1">{p.description && <p className="max-w-prose text-foreground/85">{p.description}</p>}</CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        {p.code && <CopyCode code={p.code} />}
        {isFreePlay(p) && p.code ? (
          <Button asChild><Link href={`/load?freeplay=${encodeURIComponent(p.code)}`}><Gift aria-hidden />Redeem free play</Link></Button>
        ) : auto && !p.code ? (
          <Button asChild><Link href="/load"><Wallet aria-hidden />Load now</Link></Button>
        ) : hasBonus(p) && p.code ? (
          <Button asChild><Link href={`/load?promo=${encodeURIComponent(p.code)}`}><Wallet aria-hidden />Use at checkout</Link></Button>
        ) : (
          <Button asChild><Link href="/messages?c=support"><MessageCircle aria-hidden />Claim with an agent</Link></Button>
        )}
        {(hasBonus(p) || isFreePlay(p)) && <p className="w-full text-sm text-muted-foreground">{auto ? "Added to your load automatically — nothing to enter. " : ""}{terms(p)}</p>}
        {p.expires && <p className="flex w-full items-center gap-1.5 pt-1 text-sm text-muted-foreground"><Clock className="size-4" aria-hidden />Ends {shortDate(p.expires)}</p>}
      </CardFooter>
    </Card>
  );
}
