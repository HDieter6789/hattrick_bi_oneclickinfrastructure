import { Mail, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Static contact info — no dedicated support API route exists (or is
 * needed) for this task. */
export function SupportTab() {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Support</CardTitle>
        <CardDescription>Reach your OneClick service team.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          <a href="mailto:support@oneclickfabric.example" className="hover:underline">
            support@oneclickfabric.example
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="size-4 text-muted-foreground" />
          <span>+1 (800) 555-0134</span>
        </div>
        <p className="text-muted-foreground">
          For onboarding calls and infrastructure changes, use the Appointments tab to schedule time with a Fabric specialist.
        </p>
      </CardContent>
    </Card>
  );
}
