import { Gift } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ForYouPromos } from "@/components/promotions/for-you";
import { PromoCard } from "@/components/promotions/promo-card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getJSONSafe } from "@/lib/server-api";
import type { Promo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promotions & Bonuses", description: "Current promotions, bonus codes and cashback offers for Juwa, Game Vault, Orion Stars and more." };

export default async function Promotions() {
  const promos = (await getJSONSafe<Promo[]>("/promos/", [])).filter((p) => p.active !== false);
  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Offers" title="Promotions" description="Enter a promo code on the Load page when you pay and the bonus credits are added to your load automatically." />
      <ForYouPromos />
      {promos.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promos.map((p) => (
            <li key={p.id}><PromoCard p={p} /></li>
          ))}
        </ul>
      ) : (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Gift aria-hidden /></EmptyMedia><EmptyTitle>No offers right now</EmptyTitle>
          <EmptyDescription>New promotions land every week — check back soon.</EmptyDescription></EmptyHeader></Empty>
      )}
    </div>
  );
}
