import { HelpCircle, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/common/json-ld";
import { PageHeader } from "@/components/common/page-header";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getJSONSafe } from "@/lib/server-api";
import type { SiteFAQ } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "FAQ", description: "Answers about accounts, loading balance, cash outs, games and bonuses." };

export default async function FAQPage() {
  const faqs = await getJSONSafe<SiteFAQ[]>("/faqs/", []);
  const groups = faqs.reduce<Record<string, SiteFAQ[]>>((acc, f) => { (acc[f.category || "General"] ||= []).push(f); return acc; }, {});
  const many = Object.keys(groups).length > 1;
  return (
    <div className="grid gap-8">
      {faqs.length > 0 && <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }} />}
      <PageHeader eyebrow="Help centre" title="Frequently asked questions" description="Accounts, loads, cash outs and bonuses — explained." />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-8">
          {Object.entries(groups).map(([name, items]) => (
            <section key={name} aria-label={many ? undefined : "Questions"} aria-labelledby={many ? `faq-${name}` : undefined} className="grid gap-3">
              {many && <h2 id={`faq-${name}`} className="text-xl">{name}</h2>}
              <Accordion type="multiple" className="glass rounded-lg border px-4">
                {items.map((f) => (
                  <AccordionItem key={f.id} value={String(f.id)}>
                    <AccordionTrigger className="text-base">{f.question}</AccordionTrigger>
                    <AccordionContent className="max-w-prose whitespace-pre-line text-muted-foreground">{f.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
          {!faqs.length && <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><HelpCircle aria-hidden /></EmptyMedia><EmptyTitle>No questions yet</EmptyTitle></EmptyHeader></Empty>}
        </div>
        <Card className="glass lg:sticky lg:top-20">
          <CardHeader>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><span className="size-2 rounded-full bg-success" aria-hidden />Agents online</p>
            <CardTitle className="text-lg"><h2>Still need help?</h2></CardTitle>
            <CardDescription>Our agents answer in minutes, day and night.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild className="w-full"><Link href="/messages?c=support"><MessageCircle aria-hidden />Chat with support</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link href="/business">Other ways to reach us</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
