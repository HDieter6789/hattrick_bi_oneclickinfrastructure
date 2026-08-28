"use client";

import { useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { WizardStepProps } from "@/components/wizard/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Collects the emails that should get portal access once infrastructure is
 * live. No API route exists yet to persist these as `CustomerUser` rows
 * (this task is UI-only and may not add one) — the emails are kept in
 * wizard state and shown in the Review step for the operator's awareness,
 * but nothing is written to the database from this step. See the
 * implementation report for the flagged backend gap.
 */
export function StepUserAccess({ data, update, goNext, goBack }: WizardStepProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (data.userAccessEmails.includes(trimmed)) {
      setError("That email was already added.");
      return;
    }
    update({ userAccessEmails: [...data.userAccessEmails, trimmed] });
    setEmail("");
    setError(null);
  }

  function removeEmail(target: string) {
    update({ userAccessEmails: data.userAccessEmails.filter((e) => e !== target) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Access</CardTitle>
        <CardDescription>Who at the customer should get portal access once infrastructure is deployed?</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            These invitations are collected here for the record but aren&apos;t persisted by any existing API yet — granting actual
            portal access is a provisioning-time concern handled separately.
          </span>
        </div>

        <div className="flex gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
            placeholder="name@customer.com"
            type="email"
          />
          <Button type="button" variant="outline" onClick={addEmail}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {data.userAccessEmails.map((e) => (
            <Badge key={e} variant="secondary" className="gap-1.5">
              {e}
              <button type="button" onClick={() => removeEmail(e)} aria-label={`Remove ${e}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button type="button" onClick={goNext}>
            {data.userAccessEmails.length > 0 ? "Continue" : "Skip"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
