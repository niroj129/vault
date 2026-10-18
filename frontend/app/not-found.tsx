import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return (
    <Empty className="min-h-[50dvh]">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchX aria-hidden /></EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>That page or game could not be found. It may have moved.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button asChild><Link href="/">Back home</Link></Button>
        <Button asChild variant="outline"><Link href="/games">Browse games</Link></Button>
      </EmptyContent>
    </Empty>
  );
}
