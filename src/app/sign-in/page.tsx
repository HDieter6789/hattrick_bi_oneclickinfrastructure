import { redirect } from "next/navigation";
import { auth, signIn, isEntraConfigured } from "@/auth";
import { isDemoMode } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  if (session?.user?.id) redirect(callbackUrl ?? "/portal");

  const demoMode = isDemoMode();

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-sm border-border shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
            1C
          </div>
          <CardTitle>OneClick Fabric Infrastructure</CardTitle>
          <CardDescription>Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isEntraConfigured && (
            <form
              action={async () => {
                "use server";
                await signIn("microsoft-entra-id", { redirectTo: callbackUrl ?? "/portal" });
              }}
            >
              <Button type="submit" className="w-full" variant="default">
                Sign in with Microsoft
              </Button>
            </form>
          )}

          {demoMode && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                Demo mode
                <div className="h-px flex-1 bg-border" />
              </div>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  const email = String(formData.get("email") ?? "");
                  await signIn("demo", { email, redirectTo: callbackUrl ?? "/portal" });
                }}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Demo email</Label>
                  <Input id="email" name="email" type="email" placeholder="admin@oneclick-fabric.example" required />
                </div>
                <p className="text-xs text-muted-foreground">
                  admin@ / agent@ / ops@ / customeradmin@ prefixes map to platform roles; anything else signs in as
                  a customer user.
                </p>
                <Button type="submit" variant="outline" className="w-full">
                  Continue in demo mode
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
