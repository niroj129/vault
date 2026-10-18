import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return <AuthLayout><Suspense><SignupForm /></Suspense></AuthLayout>;
}
