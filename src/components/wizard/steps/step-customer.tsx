"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createCustomerInput, type CreateCustomerDraft } from "@/features/customers/schemas";
import { fetchJson, jsonHeaders } from "@/components/shared/fetch-json";
import type { WizardStepProps } from "@/components/wizard/types";

interface ApiCustomer {
  id: string;
  companyName: string;
  contactEmail: string;
  status: string;
}

export function StepCustomer({ data, update, goNext }: WizardStepProps) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ["wizard-customers"],
    queryFn: () => fetchJson<{ customers: ApiCustomer[] }>("/api/customers"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const customers = customersQuery.data?.customers ?? [];
    if (!q) return customers;
    return customers.filter((c) => c.companyName.toLowerCase().includes(q) || c.contactEmail.toLowerCase().includes(q));
  }, [customersQuery.data, search]);

  const form = useForm<CreateCustomerDraft>({
    resolver: zodResolver(createCustomerInput),
    defaultValues: { companyName: "", contactFirstName: "", contactLastName: "", contactEmail: "" },
  });

  const createMutation = useMutation({
    mutationFn: (draft: CreateCustomerDraft) =>
      fetchJson<{ customer: ApiCustomer }>("/api/customers", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(draft) }),
    onSuccess: ({ customer }) => {
      toast.success(`${customer.companyName} created.`);
      queryClient.invalidateQueries({ queryKey: ["wizard-customers"] });
      update({ customerId: customer.id, customerName: customer.companyName });
      goNext();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function selectCustomer(customer: ApiCustomer) {
    update({ customerId: customer.id, customerName: customer.companyName });
    goNext();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
        <CardDescription>Pick an existing customer, or create a new one to provision infrastructure for.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!creating ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers…" className="pl-7" />
              </div>
              <Button type="button" variant="outline" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                New customer
              </Button>
            </div>

            {customersQuery.isLoading && (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            )}

            {customersQuery.isError && <p className="text-sm text-destructive">Couldn&apos;t load customers.</p>}

            {!customersQuery.isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No customers match &quot;{search}&quot;.</p>
            )}

            <div className="flex flex-col gap-2">
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-secondary"
                >
                  <div>
                    <p className="text-sm font-medium">{customer.companyName}</p>
                    <p className="text-xs text-muted-foreground">{customer.contactEmail}</p>
                  </div>
                  <Badge variant="outline">{customer.status}</Badge>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" {...form.register("companyName")} />
                {form.formState.errors.companyName && <p className="text-xs text-destructive">{form.formState.errors.companyName.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contactEmail">Contact email</Label>
                <Input id="contactEmail" type="email" {...form.register("contactEmail")} />
                {form.formState.errors.contactEmail && <p className="text-xs text-destructive">{form.formState.errors.contactEmail.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contactFirstName">Contact first name</Label>
                <Input id="contactFirstName" {...form.register("contactFirstName")} />
                {form.formState.errors.contactFirstName && <p className="text-xs text-destructive">{form.formState.errors.contactFirstName.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contactLastName">Contact last name</Label>
                <Input id="contactLastName" {...form.register("contactLastName")} />
                {form.formState.errors.contactLastName && <p className="text-xs text-destructive">{form.formState.errors.contactLastName.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Create customer
              </Button>
            </div>
          </form>
        )}

        {data.customerId && !creating && (
          <p className="text-xs text-muted-foreground">Currently selected: {data.customerName}</p>
        )}
      </CardContent>
    </Card>
  );
}
