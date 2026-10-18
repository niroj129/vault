"use client";

import { ExternalLink } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaUrl } from "@/lib/api";

/** Full-size payment screenshot. */
export function ScreenshotDialog({ src, title, onClose }: { src: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Check the details match what the player told you.</DialogDescription></DialogHeader>
        {src && <Image src={mediaUrl(src)} alt={title} width={720} height={1280} sizes="(max-width: 640px) 100vw, 576px" className="mx-auto h-auto max-h-[65dvh] w-auto rounded-lg object-contain" />}
        <DialogFooter>{src && <Button asChild variant="outline"><a href={mediaUrl(src)} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />Open full size</a></Button>}
          <Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
