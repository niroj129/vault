import type { Metadata } from "next";
import { Suspense } from "react";
import { Protected } from "@/components/common/protected";
import { WalletPage } from "@/components/play/wallet-page";

export const metadata: Metadata = { title: "Load & cash out", robots: { index: false } };

export default function LoadPage() {
  return <Protected><Suspense><WalletPage /></Suspense></Protected>;
}
