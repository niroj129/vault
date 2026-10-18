import Image from "next/image";
import { CopyButton } from "@/components/common/copy-button";
import { mediaUrl } from "@/lib/api";
import { money } from "@/lib/format";
import type { Money } from "@/lib/types";

/** Where to send a direct (own QR) payment: QR, handle, account name, note and instructions. */
export function PayTo({ name, handle, accountName, qr, instructions, amount, username }: {
  name: string; handle?: string; accountName?: string; qr?: string | null; instructions?: string; amount?: Money; username?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-muted/40 p-4 text-center sm:flex-row sm:text-left">
      {qr && (
        <a href={mediaUrl(qr)} target="_blank" rel="noopener noreferrer" aria-label={`Open the ${name} QR code full size`}
          className="block w-full max-w-56 shrink-0 rounded-xl bg-white p-2.5 shadow-md sm:w-40">
          <Image src={mediaUrl(qr)} alt={`${name} QR code`} width={320} height={320} className="h-auto w-full rounded-md" />
        </a>
      )}
      <div className="grid min-w-0 justify-items-center gap-2 sm:justify-items-start">
        <p className="text-xs font-semibold tracking-wider text-brand-text uppercase">Send {amount ? money(amount) : "your payment"} with {name}</p>
        {handle && (
          <div className="flex max-w-full items-center gap-1 rounded-md bg-background/70 py-1 pr-1 pl-3">
            <code className="truncate font-mono text-lg font-bold">{handle}</code>
            <CopyButton value={handle} label={`${name} handle`} />
          </div>
        )}
        {accountName && <p className="text-sm text-muted-foreground">Account name: <b className="text-foreground">{accountName}</b></p>}
        {username && <p className="text-sm text-muted-foreground">Put <b className="text-foreground">{username}</b> in the note so we know it&apos;s you.</p>}
        {instructions && <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">{instructions}</p>}
      </div>
    </div>
  );
}
