"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

/** Horizontal game row: title, "View all", arrow buttons and keyboard arrows (shadcn Carousel). */
/** `icon` is a rendered element (server pages can't pass component functions to client components). */
export function GameRail({ title, icon, href, items }: { title: string; icon?: ReactNode; href?: string; items: ReactNode[] }) {
  if (!items.length) return null;
  const id = `rail-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <Carousel opts={{ align: "start", dragFree: true, slidesToScroll: "auto" }} className="grid gap-4">
        <div className="flex items-center gap-2">
          <h2 id={id} className="flex items-center gap-2 text-xl">{icon && <span className="text-brand-text [&_svg]:size-6" aria-hidden>{icon}</span>}{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            {href && <Button asChild variant="outline" size="sm"><Link href={href}>View all<span className="sr-only"> {title}</span></Link></Button>}
            <CarouselPrevious className="static my-0 translate-y-0" size="icon-sm" aria-label={`Scroll ${title} back`} />
            <CarouselNext className="static my-0 translate-y-0" size="icon-sm" aria-label={`Scroll ${title} forward`} />
          </div>
        </div>
        <CarouselContent className="-ml-4">
          {items.map((node, k) => (
            <CarouselItem key={k} className="basis-[40%] pl-4 xs:basis-[34%] sm:basis-[25%] md:basis-[20%] lg:basis-[16.66%] xl:basis-[12.5%]">{node}</CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
