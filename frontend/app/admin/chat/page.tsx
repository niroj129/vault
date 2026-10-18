import { redirect } from "next/navigation";

// Support lives in Messages as a pinned conversation.
export default function Page() {
  redirect("/admin/messages");
}
