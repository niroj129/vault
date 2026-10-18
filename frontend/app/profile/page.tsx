import type { Metadata } from "next";
import { Protected } from "@/components/common/protected";
import { ProfilePage } from "@/components/profile/profile-page";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default function Page() {
  return <Protected><ProfilePage /></Protected>;
}
