"use client";

import { MessageCircle, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import type { AdminUser, Conversation } from "@/lib/types";
import { Activity } from "./activity";
import { EditPlayerDialog } from "./edit-player-dialog";
import { GameAccounts } from "./game-accounts";

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-0.5 rounded-lg border bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>;
}

/** Everything about one player, in a panel beside the list. */
export function PlayerSheet({ player, onClose, onChanged }: { player: AdminUser | null; onClose: () => void; onChanged: () => void }) {
  const { token } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [opening, setOpening] = useState(false);

  async function message() {
    if (!player) return;
    setOpening(true);
    try { const c = await apiFetch<Conversation>("/messenger/conversations/", { method: "POST", token, body: { kind: "direct", user: player.id } }); router.push(`/messages?c=${c.id}`); }
    catch (e) { toast.error(errorText(e)); setOpening(false); }
  }

  return (
    <Sheet open={!!player} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {player && (
          <>
            <SheetHeader className="gap-3 border-b p-5 pr-12">
              <div className="flex items-center gap-3">
                <UserAvatar name={player.full_name || player.username} src={player.avatar} size={52} />
                <div className="grid min-w-0 leading-tight">
                  <SheetTitle className="truncate text-xl">{player.full_name || player.username}</SheetTitle>
                  <SheetDescription className="truncate">@{player.username}{player.phone ? ` · ${player.phone}` : ""}</SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {player.vip_tier && <Badge variant="secondary">{player.vip_tier}</Badge>}
                {player.is_active === false && <Badge variant="destructive">Disabled</Badge>}
                <span className="text-sm text-muted-foreground">Loaded <b className="tabular-nums text-foreground">{money(player.total_loaded)}</b> in {player.deposit_count || 0} load{(player.deposit_count || 0) === 1 ? "" : "s"}</span>
                <span className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={message} disabled={opening} aria-busy={opening}>{opening ? <Spinner aria-hidden /> : <MessageCircle aria-hidden />}Message</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil aria-hidden />Edit</Button>
                </span>
              </div>
            </SheetHeader>
            <Tabs defaultValue="games" className="gap-4 p-5">
              <TabsList className="w-full"><TabsTrigger value="games" className="flex-1">Game accounts</TabsTrigger><TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger><TabsTrigger value="details" className="flex-1">Details</TabsTrigger></TabsList>
              <TabsContent value="games"><GameAccounts key={player.id} player={player} onChanged={onChanged} /></TabsContent>
              <TabsContent value="activity"><Activity key={player.id} player={player} /></TabsContent>
              <TabsContent value="details">
                <dl className="grid gap-2 sm:grid-cols-2">
                  <Detail label="Username" value={player.username} /><Detail label="Name" value={player.full_name} />
                  <Detail label="Phone" value={player.phone || ""} /><Detail label="Email" value={player.email || ""} />
                  <Detail label="Joined" value={player.date_joined ? dateTime(player.date_joined) : ""} /><Detail label="Last sign-in" value={player.last_login ? dateTime(player.last_login) : "Never"} />
                  <Detail label="VIP points" value={String(player.loyalty_points ?? 0)} /><Detail label="Referral code" value={player.referral_code || ""} />
                </dl>
              </TabsContent>
            </Tabs>
            <EditPlayerDialog player={player} open={editing} onOpenChange={setEditing} onSaved={onChanged} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
