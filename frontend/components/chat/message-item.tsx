"use client";

import { Ban, Copy, Flag, MoreHorizontal, Pencil, Trash2, Wallet } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { mediaUrl } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function timeLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface Props {
  m: ChatMessage; channel?: "sms" | "whatsapp" | "sendblue"; mine: boolean; grouped: boolean; showName: string | null; cashier: boolean; seen: string | null;
  canEdit: boolean; canDelete: boolean; canReport: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void; onImageLoad: () => void;
}

/** One message. Actions sit in a menu button that is always reachable (never hover-only). */
export function MessageItem({ m, channel, mine, grouped, showName, cashier, seen, canEdit, canDelete, canReport, onEdit, onDelete, onReport, onImageLoad }: Props) {
  if (m.kind === "system") return <li className="mx-auto my-2 max-w-md rounded-full bg-muted px-3 py-1 text-center text-sm text-muted-foreground">{m.body}</li>;
  const hasActions = canEdit || canDelete || canReport || (!!m.body && !m.deleted);
  return (
    <li className={cn("group flex flex-col gap-1", mine ? "items-end" : "items-start", grouped ? "mt-0.5" : "mt-3")}>
      {showName && (cashier
        ? <span className="flex items-center gap-1 px-1 text-xs font-semibold text-success"><Wallet className="size-3.5" aria-hidden />{showName}</span>
        : <span className="px-1 text-xs font-semibold text-muted-foreground">{showName}</span>)}
      <div className={cn("flex max-w-[min(34rem,88%)] items-center gap-1", mine && "flex-row-reverse")}>
        <div className={cn("grid gap-2 rounded-2xl px-4 py-2.5 text-base leading-relaxed break-words whitespace-pre-wrap",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card",
          cashier && "border-success/40 bg-success/10",
          m.deleted && "border-dashed bg-transparent text-muted-foreground italic")}>
          {m.deleted ? <span className="flex items-center gap-1.5"><Ban className="size-4" aria-hidden />Message deleted</span> : (
            <>
              {m.image && (
                <a href={mediaUrl(m.image)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg" aria-label="Open photo full size">
                  <Image src={mediaUrl(m.image)} alt="Shared photo" width={320} height={240} sizes="320px" onLoad={onImageLoad}
                    className="h-auto max-h-80 w-auto max-w-full object-contain" />
                </a>
              )}
              {m.body && <span>{m.body}</span>}
            </>
          )}
        </div>
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Message options"
                className="opacity-60 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? "end" : "start"}>
              {m.body && !m.deleted && (
                <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(m.body).then(() => toast.success("Copied")); }}><Copy aria-hidden />Copy</DropdownMenuItem>
              )}
              {canEdit && <DropdownMenuItem onSelect={onEdit}><Pencil aria-hidden />Edit</DropdownMenuItem>}
              {(canDelete || canReport) && <DropdownMenuSeparator />}
              {canDelete && <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 aria-hidden />Delete for everyone</DropdownMenuItem>}
              {canReport && <DropdownMenuItem variant="destructive" onSelect={onReport}><Flag aria-hidden />Report</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <span className="px-1 text-xs text-muted-foreground">
        <time dateTime={m.created_at}>{timeLabel(m.created_at)}</time>
        {m.edited_at && !m.deleted && " · edited"}
        {m.kind === "sms_out" && <> · {m.sms_status?.startsWith("not sent") || m.sms_status?.startsWith("error") ? <span className="text-destructive-text">{m.sms_status}</span> : channel === "sendblue" ? m.sms_status : `${channel === "whatsapp" ? "WhatsApp" : "SMS"} ${m.sms_status}`}</>}
        {seen && <> · <span className="font-semibold text-brand-text">{seen}</span></>}
      </span>
    </li>
  );
}
