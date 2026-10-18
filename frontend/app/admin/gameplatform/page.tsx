"use client";

import { Suspense } from "react";
import { PlatformConsole } from "@/components/admin/platforms/platform-console";

export default function GamePlatformPage() {
  return <Suspense><PlatformConsole /></Suspense>;
}
