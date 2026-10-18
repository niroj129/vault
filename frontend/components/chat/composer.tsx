"use client";

import { Check, ImageIcon, Pencil, Send, Smile, X } from "lucide-react";
import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SavedReplies } from "./staff-tools";

const EMOJIS = ["😀", "😂", "😍", "🤑", "🥳", "🔥", "💰", "🎰", "🎲", "🏆", "👍", "🙏", "❤️", "🎉"];

/** GSM-7 texts split at 160/153 chars; anything else (emoji) at 70/67. */
function smsSegments(t: string) {
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(t);
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return t.length <= single ? 1 : Math.ceil(t.length / multi);
}

interface Props {
  text: string; onText: (v: string) => void; file: File | null; onFile: (f: File | null) => void; editing: boolean; onCancelEdit: () => void;
  sms: boolean; channel?: string; staff: boolean; sending: boolean; onSubmit: () => void; onError: (msg: string) => void;
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { text, onText, file, onFile, editing, onCancelEdit, sms, channel, staff, sending, onSubmit, onError }, ref) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const empty = !text.trim() && !file;
  return (
    <form className="grid gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {(editing || file) && (
        <p className="flex w-fit items-center gap-2 rounded-md bg-muted py-1 pr-1 pl-3 text-sm">
          {editing ? <><Pencil className="size-4" aria-hidden />Editing message</> : <><ImageIcon className="size-4" aria-hidden /><span className="max-w-48 truncate">{file?.name}</span></>}
          <Button type="button" variant="ghost" size="icon-xs" aria-label={editing ? "Cancel edit" : "Remove photo"} onClick={() => (editing ? onCancelEdit() : onFile(null))}><X aria-hidden /></Button>
        </p>
      )}
      <div className="flex items-end gap-1 rounded-2xl border bg-muted/40 p-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Insert emoji"><Smile aria-hidden /></Button></PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-auto p-2">
            <div role="group" aria-label="Emoji" className="grid grid-cols-7 gap-1">
              {EMOJIS.map((em) => (
                <button key={em} type="button" onClick={() => onText(text + em)} aria-label={`Insert ${em}`}
                  className="grid size-11 place-items-center rounded-md text-xl transition-colors duration-150 hover:bg-accent">{em}</button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {!sms && !editing && (
          <Button type="button" variant="ghost" size="icon" asChild>
            <label aria-label="Attach photo">
              <ImageIcon aria-hidden />
              <input type="file" accept="image/*" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 5 * 1024 * 1024) onError("Photos must be 5 MB or smaller."); else onFile(f); } e.target.value = ""; }} />
            </label>
          </Button>
        )}
        {staff && !editing && <SavedReplies onPick={(t) => onText(text ? `${text} ${t}` : t)} />}
        <label htmlFor="mx-input" className="sr-only">Message</label>
        <Textarea id="mx-input" ref={ref} rows={1} value={text} maxLength={sms ? 1600 : 4000}
          className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => onText(e.target.value)} placeholder={channel === "whatsapp" ? "WhatsApp message" : channel === "sendblue" ? "iMessage" : sms ? "Text message" : "Message"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); }
            if (e.key === "Escape" && editing) onCancelEdit();
          }} />
        <Button type="submit" size="icon" className="rounded-full" disabled={sending || empty} aria-busy={sending} aria-label={editing ? "Save edit" : "Send"}>
          {sending ? <Spinner aria-hidden /> : editing ? <Check aria-hidden /> : <Send aria-hidden />}
        </Button>
      </div>
      {sms && channel === "sms" && text.length > 0 && <p className="px-2 text-sm text-muted-foreground" aria-live="polite">{text.length} chars · {smsSegments(text)} SMS segment{smsSegments(text) > 1 ? "s" : ""}</p>}
      <p className="sr-only">Press Enter to send, Shift+Enter for a new line.</p>
    </form>
  );
});
