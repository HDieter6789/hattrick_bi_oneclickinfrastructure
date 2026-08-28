"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { INITIAL_WIZARD_DATA, WIZARD_STEPS, type WizardData } from "./types";
import { StepCustomer } from "./steps/step-customer";
import { StepArchitecture } from "./steps/step-architecture";
import { StepFabricResources } from "./steps/step-fabric-resources";
import { StepDataSources } from "./steps/step-data-sources";
import { StepDataIngestion } from "./steps/step-data-ingestion";
import { StepSelfService } from "./steps/step-self-service";
import { StepMonitoring } from "./steps/step-monitoring";
import { StepUserAccess } from "./steps/step-user-access";
import { StepAppointment } from "./steps/step-appointment";
import { StepReview } from "./steps/step-review";
import { StepCreate } from "./steps/step-create";

const STEP_COMPONENTS = [
  StepCustomer,
  StepArchitecture,
  StepFabricResources,
  StepDataSources,
  StepDataIngestion,
  StepSelfService,
  StepMonitoring,
  StepUserAccess,
  StepAppointment,
  StepReview,
  StepCreate,
] as const;

/**
 * The 11-step provisioning wizard shell: owns the current step index and the
 * single accumulator object (`WizardData`) threaded through every step, per
 * the brief's guidance that nothing heavier than `useState` is needed here.
 */
export function WizardShell() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_WIZARD_DATA);

  const update = (patch: Partial<WizardData>) => setData((prev) => ({ ...prev, ...patch }));
  const goNext = () => setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const StepComponent = STEP_COMPONENTS[step];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Deployment</h1>
        <p className="text-sm text-muted-foreground">Provision a managed Fabric data platform for a customer.</p>
      </div>

      <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs">
        {WIZARD_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1">
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                i === step && "border-primary bg-primary/10 font-medium text-primary",
                i < step && "border-success/40 bg-success/10 text-success",
                i > step && "border-transparent text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3" /> : <span>{i + 1}</span>}
              {label}
            </button>
            {i < WIZARD_STEPS.length - 1 && <span className="text-muted-foreground">/</span>}
          </li>
        ))}
      </ol>

      <StepComponent data={data} update={update} goNext={goNext} goBack={goBack} />
    </div>
  );
}
