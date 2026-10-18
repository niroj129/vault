"use client";

import Link from "next/link";
import { SendblueSetup } from "@/components/admin/phone/sendblue-setup";
import { TwilioSetup } from "@/components/admin/phone/twilio-setup";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PhoneMessaging() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Phone messaging" description={<>Connect a provider so your team can message phones from the <Link href="/admin/messages" className="font-semibold text-brand-text underline-offset-4 hover:underline">Inbox</Link>. Replies come back into the same thread. You can connect more than one.</>} />
      <Tabs defaultValue="sendblue" className="gap-6">
        <TabsList><TabsTrigger value="sendblue" className="px-4">Sendblue · iMessage</TabsTrigger><TabsTrigger value="twilio" className="px-4">Twilio · SMS &amp; WhatsApp</TabsTrigger></TabsList>
        <TabsContent value="sendblue"><SendblueSetup /></TabsContent>
        <TabsContent value="twilio"><TwilioSetup /></TabsContent>
      </Tabs>
    </div>
  );
}
