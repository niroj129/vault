"use client";

import { ArrowDownUp, KeyRound, Megaphone, MessageCircle, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExportButton } from "@/components/admin/export-button";
import { GameLoginsEditor } from "@/components/admin/game-logins-editor";
import { PingDialog } from "@/components/admin/ping-dialog";
import { ResourceManager } from "@/components/admin/resource-manager";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { AdminUser, Conversation } from "@/lib/types";

const TABS = [["players", "Players"], ["staff", "Staff"], ["off", "Disabled"]] as const;
const SORTS = [["new", "Newest"], ["top", "Top loaded"], ["recent", "Last deposit"], ["az", "A–Z"]] as const;
const inTab = (r: AdminUser, t: string) => (t === "off" ? !r.is_active : t === "staff" ? !!r.is_active && r.role !== "user" : !!r.is_active && r.role === "user");

export default function AdminPlayers() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<string>("players");
  const [sort, setSort] = useState<string>("new");
  const [agents, setAgents] = useState<AdminUser[]>([]);
  const [logins, setLogins] = useState<AdminUser | null>(null);
  const [ping, setPing] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { if (token) apiFetch<AdminUser[]>("/users/?role=agent", { token }).then(setAgents).catch(() => {}); }, [token]);
  // /admin/players?logins=<id> (from the player panel in the inbox)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("logins");
    if (id && token) apiFetch<AdminUser>(`/users/${id}/`, { token }).then(setLogins).catch(() => {});
  }, [token]);

  async function message(r: AdminUser) {
    setBusy(r.id);
    try { const c = await apiFetch<Conversation>("/messenger/conversations/", { method: "POST", token, body: { kind: "support", user: r.id } }); router.push(`/admin/messages?c=${c.id}`); }
    catch (e) { toast.error(errorText(e)); setBusy(null); }
  }
  const by: Record<string, (a: AdminUser, b: AdminUser) => number> = {
    new: (a, b) => new Date(b.date_joined || 0).getTime() - new Date(a.date_joined || 0).getTime(),
    top: (a, b) => Number(b.total_loaded || 0) - Number(a.total_loaded || 0),
    recent: (a, b) => new Date(b.last_deposit || 0).getTime() - new Date(a.last_deposit || 0).getTime(),
    az: (a, b) => a.username.localeCompare(b.username),
  };

  return (
    <div className="grid gap-6">
      <PageHeader title="Players & staff" description="Everyone on your site. Open a chat, see their game logins, or check how much they've loaded."
        actions={<ExportButton resource="players" label="Export" />} />
      <ResourceManager<AdminUser> title="Accounts" itemName="Account" addLabel="New account" endpoint="/users/" searchKeys={["username", "full_name", "email", "phone"]}
        describeDelete={(r) => `@${r.username} and their chats, deposits and logins will be deleted. To keep their history, disable the account instead.`}
        filterRows={(rows) => rows.filter((r) => inTab(r, tab)).sort(by[sort])}
        toolbar={(rows) => (
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tab} onValueChange={setTab}><TabsList>{TABS.map(([k, l]) => <TabsTrigger key={k} value={k} className="px-3">{l}<span className="text-muted-foreground tabular-nums">{rows.filter((r) => inTab(r, k)).length}</span></TabsTrigger>)}</TabsList></Tabs>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-44" aria-label="Sort"><ArrowDownUp aria-hidden /><SelectValue /></SelectTrigger>
              <SelectContent>{SORTS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        renderList={(rows, { edit, remove }) => rows.length === 0 ? (
          <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Users aria-hidden /></EmptyMedia><EmptyTitle>No one here</EmptyTitle>
            <EmptyDescription>{tab === "players" ? "Players who sign up or that you create show up here." : tab === "staff" ? "Admins and agents you add show up here." : "Disabled accounts show up here."}</EmptyDescription></EmptyHeader></Empty>
        ) : (
          <ul className="grid gap-2">
            {rows.map((r) => {
              const name = r.full_name || r.username;
              return (
                <li key={r.id}>
                  <Card className={`glass grid items-center gap-4 px-4 py-3 lg:grid-cols-[minmax(14rem,1.2fr)_minmax(0,1.6fr)_auto] ${r.is_active ? "" : "opacity-70"}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={name} src={r.avatar} size={42} />
                      <div className="grid min-w-0"><b className="flex flex-wrap items-center gap-2">{name}{r.role !== "user" && <Badge>{r.role}</Badge>}{r.role === "user" && r.vip_tier && <Badge variant="outline">{r.vip_tier}</Badge>}</b>
                        <span className="truncate text-sm text-muted-foreground">@{r.username} · joined {ago(r.date_joined)}{r.agent_name ? ` · agent ${r.agent_name}` : ""}</span></div>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(r.role === "user"
                        ? [["Loaded", money(r.total_loaded)], ["Deposits", r.deposit_count || 0], ["Last deposit", ago(r.last_deposit)], ["Game logins", r.login_count || 0]]
                        : [["Role", r.role === "agent" ? "Agent" : "Admin"], ...(r.role === "agent" ? [["Players", r.player_count]] : []), ["Last sign-in", ago(r.last_login)]]
                      ).map(([k, v]) => <div key={String(k)}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>)}
                    </dl>
                    <div className="flex items-center justify-end gap-1">
                      {r.role === "user" && <>
                        <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => message(r)}><MessageCircle aria-hidden />{busy === r.id ? "Opening…" : "Message"}</Button>
                        <Button variant="outline" size="sm" onClick={() => setLogins(r)}><KeyRound aria-hidden />Logins</Button>
                      </>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`More for ${r.username}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => edit(r)}><Pencil aria-hidden />Edit account</DropdownMenuItem>
                          {r.role === "user" && <DropdownMenuItem onSelect={() => setPing(r)}><Megaphone aria-hidden />Email / SMS</DropdownMenuItem>}
                          {r.id !== user?.id && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => remove(r)}><Trash2 aria-hidden />Delete</DropdownMenuItem></>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        columns={[]}
        fields={[
          { name: "username", label: "Username", required: true },
          { name: "full_name", label: "Full name" },
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Phone" },
          { name: "role", label: "Role", type: "select", options: [{ value: "user", label: "Player" }, { value: "agent", label: "Agent (manages own players)" }, { value: "admin", label: "Admin" }] },
          { name: "agent", label: "Agent (for players)", type: "select", options: [{ value: "", label: "None" }, ...agents.map((a) => ({ value: String(a.id), label: a.full_name || a.username }))] },
          { name: "password", label: "Password", type: "password", requiredOnCreate: true, full: true, help: "Leave blank when editing to keep the current one." },
          { name: "is_active", label: "Active (can sign in)", type: "checkbox" },
        ]}
        defaults={{ role: "user", is_active: true, agent: "" }} />
      {logins && <GameLoginsEditor player={logins} onClose={() => setLogins(null)} />}
      {ping && <PingDialog player={ping} onClose={() => setPing(null)} />}
    </div>
  );
}
