"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useSite } from "@/components/site-context";

type Props = Omit<ComponentProps<typeof Button>, "asChild"> & { label?: string };

/** "Create account": the site's own sign-up page when self sign-up is on;
 * otherwise the operator's sign-up link (Settings), or the contact page. */
export function CreateAccountButton({ label = "Create account", ...props }: Props) {
  const { signup_url, allow_signup } = useSite();
  if (allow_signup !== false) return <Button asChild {...props}><Link href="/signup">{label}</Link></Button>;
  if (signup_url) return <Button asChild {...props}><a href={signup_url} target="_blank" rel="noopener noreferrer">{label}</a></Button>;
  return <Button asChild {...props}><Link href="/business">{label}</Link></Button>;
}
