import { redirect } from "next/navigation";

// "My account" became Profile.
export default function Page() {
  redirect("/profile");
}
