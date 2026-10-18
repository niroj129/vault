"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CreateAccountButton } from "@/components/common/create-account-button";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface Slide {
  kicker?: string; icon?: ReactNode; title: string; text?: string;
  cta?: { signup?: boolean; href?: string; label: string }; cta2?: { href: string; label: string }; images: string[];
}

/** Promo carousel. Moves only when the visitor asks (no auto-advance: WCAG 2.2.2, motion rules). */
export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (!api) return;
    const on = () => setCurrent(api.selectedScrollSnap());
    on();
    api.on("select", on);
    return () => { api.off("select", on); };
  }, [api]);
  if (!slides.length) return null;

  return (
    <Carousel setApi={setApi} opts={{ loop: slides.length > 1 }} aria-label="Highlights"
      className="dark overflow-hidden rounded-2xl bg-[radial-gradient(90%_120%_at_90%_10%,color-mix(in_oklab,var(--primary)_55%,transparent),transparent_60%),linear-gradient(160deg,var(--secondary),var(--background))] text-foreground shadow-xl ring-1 ring-border">
      <CarouselContent className="ml-0">
        {slides.map((s, k) => (
          <CarouselItem key={k} className="pl-0" aria-label={`${k + 1} of ${slides.length}`}>
            <div className="grid min-h-[22rem] items-center gap-6 p-6 sm:p-10 md:grid-cols-[1.2fr_1fr] md:p-12">
              <div className="grid content-center justify-items-start gap-4">
                {s.kicker && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/60 px-3 py-1 text-xs font-semibold tracking-wider text-brand-text uppercase">
                    {s.icon && <span className="[&_svg]:size-3.5" aria-hidden>{s.icon}</span>}{s.kicker}
                  </span>
                )}
                <h2 className="max-w-xl text-3xl leading-tight font-bold text-foreground sm:text-4xl">{s.title}</h2>
                {s.text && <p className="max-w-lg text-lg text-muted-foreground">{s.text}</p>}
                <div className="flex w-full flex-wrap gap-3 pt-2">
                  {s.cta?.signup ? <CreateAccountButton label={s.cta.label} size="lg" tabIndex={k === current ? 0 : -1} />
                    : s.cta?.href && <Button asChild size="lg"><Link href={s.cta.href} tabIndex={k === current ? 0 : -1}>{s.cta.label}</Link></Button>}
                  {s.cta2 && (
                    <Button asChild size="lg" variant="outline" className="bg-secondary/60 hover:bg-secondary">
                      <Link href={s.cta2.href} tabIndex={k === current ? 0 : -1}>{s.cta2.label}</Link>
                    </Button>
                  )}
                </div>
              </div>
              <div aria-hidden className="relative hidden h-72 md:block">
                {s.images.slice(0, 3).map((src, j) => (
                  <span key={j} className={cn("absolute top-1/2 aspect-[3/4] w-40 -translate-y-1/2 overflow-hidden rounded-xl shadow-xl ring-1 ring-border",
                    j === 0 && "left-[42%] z-10 w-44 -translate-x-1/2", j === 1 && "left-[18%] -rotate-6 opacity-90", j === 2 && "right-[4%] rotate-6 opacity-90")}>
                    <Image src={mediaUrl(src)} alt="" fill sizes="176px" priority={k === 0} className="object-cover" />
                  </span>
                ))}
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      {slides.length > 1 && (
        <div className="flex items-center gap-2 px-6 pb-5 sm:px-10 md:px-12">
          <div className="flex items-center" role="group" aria-label="Choose slide">
            {slides.map((_, k) => (
              <button key={k} type="button" onClick={() => api?.scrollTo(k)} aria-label={`Show slide ${k + 1}`} aria-current={k === current}
                className="hit-44 grid h-11 w-6 place-items-center">
                <span className={cn("h-2 w-6 rounded-full transition-[transform,background-color] duration-200 ease-out", k === current ? "scale-x-100 bg-primary" : "scale-x-[0.34] bg-muted-foreground")} />
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <CarouselPrevious className="static my-0 translate-y-0 bg-secondary/60 hover:bg-secondary" size="icon" />
            <CarouselNext className="static my-0 translate-y-0 bg-secondary/60 hover:bg-secondary" size="icon" />
          </div>
        </div>
      )}
    </Carousel>
  );
}
