import { AtSign, Camera, MapPin, MessageCircle, Phone, Send, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ContactForm } from "@/components/forms/contact-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJSONSafe } from "@/lib/server-api";
import type { BusinessInfo } from "@/lib/types";

export const revalidate = 60;
export const metadata: Metadata = { title: "Contact", description: "Contact us — phone, email, WhatsApp, Telegram and our support team for game links and agent info." };

export default async function ContactPage() {
  const b = await getJSONSafe<BusinessInfo>("/business/", {});
  const channels = ([
    b.phone && [Phone, "Phone", b.phone, `tel:${b.phone}`],
    b.email && [AtSign, "Email", b.email, `mailto:${b.email}`],
    b.whatsapp && [MessageCircle, "WhatsApp", b.whatsapp, `https://wa.me/${b.whatsapp.replace(/[^0-9]/g, "")}`],
    b.telegram && [Send, "Telegram", "Message us", b.telegram],
    b.facebook && [Users, "Facebook", "Follow us", b.facebook],
    b.instagram && [Camera, "Instagram", "Follow us", b.instagram],
    b.address && [MapPin, "Address", b.address, null],
  ].filter(Boolean)) as [typeof Phone, string, string, string | null][];
  const legal: [string, string, string | undefined][] = [["about", "About us", b.about], ["terms", "Terms & conditions", b.terms], ["privacy", "Privacy policy", b.privacy]];

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Get in touch" title={`Contact ${b.business_name || "us"}`}
        description="Fastest answer: live chat with an agent. Or leave a message and we'll get back to you."
        actions={<Button asChild><Link href="/messages?c=support"><MessageCircle aria-hidden />Live chat</Link></Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.3fr]">
        <ul className="grid gap-3">
          {channels.map(([Icon, label, value, href]) => {
            const ext = href?.startsWith("http");
            const body: ReactNode = (
              <>
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/20 text-brand-text"><Icon className="size-5" aria-hidden /></span>
                <span className="grid min-w-0"><span className="text-sm text-muted-foreground">{label}</span><b className="truncate">{value}</b></span>
              </>
            );
            return (
              <li key={label}>
                {href ? (
                  <a href={href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="glass flex items-center gap-3 rounded-lg border p-4 transition-colors duration-200 hover:bg-accent">{body}{ext && <span className="sr-only"> (opens in a new tab)</span>}</a>
                ) : <div className="glass flex items-center gap-3 rounded-lg border p-4">{body}</div>}
              </li>
            );
          })}
          {b.map_embed && <li className="overflow-hidden rounded-lg border [&_iframe]:h-64 [&_iframe]:w-full" dangerouslySetInnerHTML={{ __html: b.map_embed }} />}
        </ul>
        <Card className="glass">
          <CardHeader><CardTitle className="text-xl"><h2>Send a message</h2></CardTitle></CardHeader>
          <CardContent><ContactForm /></CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {legal.map(([id, title, text]) => (
          <Card key={id} id={id} className="glass scroll-mt-24">
            <CardHeader><CardTitle className="text-lg"><h2>{title}</h2></CardTitle></CardHeader>
            <CardContent><p className="max-w-prose whitespace-pre-line text-muted-foreground">{text || "Coming soon."}</p></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
