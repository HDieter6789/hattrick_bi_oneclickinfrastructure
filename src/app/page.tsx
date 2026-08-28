import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isInternalRole } from "@/lib/authz";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  redirect(isInternalRole(session.user.role) ? "/admin" : "/portal");
}
