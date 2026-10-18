"use client";

import { Ban, Bell, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import type { User } from "@/lib/types";

const PRIVACY = [
  ["everyone", "Everyone", "Anyone on the site can start a chat with you."],
  ["contacts", "Only people I already chat with", "New people can't message you. Existing chats keep working."],
  ["nobody", "Nobody", "Only staff can message you."],
] as const;

function SectionTitle({ icon: Icon, children }: { icon: typeof Bell; children: React.ReactNode }) {
  return <CardTitle className="flex items-center gap-2 text-lg"><Icon className="size-5 text-brand-text" aria-hidden /><h2>{children}</h2></CardTitle>;
}

export function PrivacyAndAlerts() {
  const { user, token, refreshUser } = useAuth();
  const [privacy, setPrivacy] = useState<string>(user?.dm_privacy || "everyone");
  const [push, setPush] = useState<PushState>("off");
  const [blocked, setBlocked] = useState<User[]>([]);

  useEffect(() => { void pushState().then(setPush); }, []);
  useEffect(() => { apiFetch<User[]>("/messenger/blocks/", { token }).then(setBlocked).catch(() => {}); }, [token]);

  async function pick(v: string) {
    const prev = privacy; setPrivacy(v);
    try { await apiFetch("/messenger/profile/", { method: "PATCH", token, body: { dm_privacy: v } }); await refreshUser(); toast.success("Saved"); }
    catch (e) { setPrivacy(prev); toast.error(errorText(e)); }
  }
  async function togglePush(on: boolean) {
    try { setPush(on ? await enablePush(token) : await disablePush(token)); }
    catch (e) { toast.error(errorText(e)); setPush(await pushState()); }
  }
  async function unblock(u: User) {
    try { await apiFetch(`/messenger/blocks/${u.id}/`, { method: "DELETE", token }); setBlocked((b) => b.filter((x) => x.id !== u.id)); toast.success(`Unblocked ${u.full_name || u.username}`); }
    catch (e) { toast.error(errorText(e)); }
  }
  const pushHint = push === "unsupported" ? "This browser can't show notifications. On iPhone, add the site to your Home Screen first."
    : push === "blocked" ? "Blocked in your browser settings for this site." : "Get a notification when someone messages you, even with the site closed.";

  return (
    <>
      <Card className="glass">
        <CardHeader><SectionTitle icon={ShieldCheck}>Who can message me</SectionTitle><CardDescription>Support can always reach you.</CardDescription></CardHeader>
        <CardContent>
          <RadioGroup value={privacy} onValueChange={pick} aria-label="Who can message me">
            {PRIVACY.map(([v, label, hint]) => (
              <FieldLabel key={v} htmlFor={`dm-${v}`}>
                <Field orientation="horizontal">
                  <RadioGroupItem value={v} id={`dm-${v}`} />
                  <FieldContent><FieldTitle>{label}</FieldTitle><FieldDescription>{hint}</FieldDescription></FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><SectionTitle icon={Bell}>Notifications</SectionTitle></CardHeader>
        <CardContent>
          <Field orientation="horizontal" className="justify-between">
            <FieldContent><FieldLabel htmlFor="push-switch">New message alerts</FieldLabel><FieldDescription>{pushHint}</FieldDescription></FieldContent>
            <Switch id="push-switch" checked={push === "on"} onCheckedChange={togglePush} disabled={push === "unsupported" || push === "blocked"} />
          </Field>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><SectionTitle icon={Ban}>Blocked people</SectionTitle></CardHeader>
        <CardContent>
          {blocked.length === 0 ? <p className="text-sm text-muted-foreground">You haven&apos;t blocked anyone. Block someone from the ··· menu in their chat.</p> : (
            <ul className="divide-y">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <UserAvatar name={b.full_name || b.username} src={b.avatar} size={36} />
                  <span className="grid flex-1"><b>{b.full_name || b.username}</b><span className="text-sm text-muted-foreground">@{b.username}</span></span>
                  <Button variant="outline" size="sm" onClick={() => unblock(b)}>Unblock<span className="sr-only"> {b.username}</span></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
