import { prisma } from "@/db/prisma";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { getMailService, buildWelcomeEmail } from "@/services/mail";
import type { WelcomeEmailOptions } from "@/services/mail";
import { NonRetryableStepError, type StepExecutionContext, type StepExecutor, type StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.send-welcome-email" });

/**
 * Sends the customer welcome email (brief section 27) once the service is
 * live. Registered as the LAST fixed provisioning step (see
 * register-steps.ts's `registerFixedProvisioningSteps`), after
 * `health_validation` and `access_configuration` — the engine's
 * stop-on-first-fixed-step-failure behavior (services/provisioning/engine.ts)
 * means this step never runs unless both of those already succeeded, so by
 * the time a customer is emailed, their deployment has been validated
 * healthy and their access has been configured. The appointment-confirmed
 * gate is enforced even earlier, independent of this ordering, at
 * deployment-creation time (src/features/provisioning/service.ts's
 * `createDeployment`) — a deployment can never reach any fixed step,
 * including this one, without a confirmed Appointment.
 *
 * Idempotent: if a `welcome_email` Notification already exists with
 * status "sent" for this customer, skip rather than sending twice.
 */
export const sendWelcomeEmailStep: StepExecutor = {
  stepKey: "send_welcome_email",
  name: "Send welcome email",

  async execute({ deployment, correlationId }: StepExecutionContext): Promise<StepResult> {
    const alreadySent = await prisma.notification.findFirst({
      where: { customerId: deployment.customerId, type: "welcome_email", status: "sent" },
    });
    if (alreadySent) {
      log.info({ customerId: deployment.customerId, notificationId: alreadySent.id }, "Welcome email already sent — skipping");
      return { outcome: "skipped", resourceId: alreadySent.id };
    }

    const customer = await prisma.customer.findUnique({ where: { id: deployment.customerId } });
    if (!customer) {
      throw new NonRetryableStepError(`Customer ${deployment.customerId} not found`, "CUSTOMER_NOT_FOUND");
    }
    if (!customer.contactEmail) {
      throw new NonRetryableStepError(`Customer ${deployment.customerId} has no contact email on file`, "MISSING_CONTACT_EMAIL");
    }

    const [datasets, sqlEndpoints, nextAppointment] = await Promise.all([
      prisma.datasetCatalogEntry.findMany({ where: { customerId: customer.id }, orderBy: { name: "asc" } }),
      prisma.sqlEndpoint.findMany({ where: { customerId: customer.id, includedInWelcomeEmail: true, provisioningStatus: "Success" } }),
      prisma.appointment.findFirst({
        where: { customerId: customer.id, status: "confirmed", startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        include: { serviceAgent: { include: { user: true } } },
      }),
    ]);

    const env = getEnv();
    const reportEntries = datasets.filter((d) => d.availableViaReport);
    const mostRecentUpdate = datasets.map((d) => d.lastUpdatedAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];

    const options: WelcomeEmailOptions = {
      serviceStatus: customer.status === "active" ? "Active" : customer.status,
      datasets: datasets.map((d) => ({ name: d.name })),
      sql: sqlEndpoints[0] ? { server: sqlEndpoints[0].server, database: sqlEndpoints[0].database } : null,
      reports: reportEntries.length > 0 ? reportEntries.map((r) => ({ name: r.name })) : undefined,
      dataFreshness: mostRecentUpdate ? `Most recently refreshed ${mostRecentUpdate.toISOString().slice(0, 10)}` : null,
      nextAppointment: nextAppointment
        ? { startTime: nextAppointment.startTime, agentName: nextAppointment.serviceAgent?.user.name ?? undefined }
        : null,
      supportEmail: env.SUPPORT_EMAIL ?? env.MAIL_FROM_ADDRESS,
      supportPhone: env.SUPPORT_PHONE,
    };

    const email = buildWelcomeEmail({ companyName: customer.companyName, contactFirstName: customer.contactFirstName }, options);

    const result = await getMailService().sendMail({
      to: [customer.contactEmail],
      subject: email.subject,
      html: email.html,
      text: email.text,
      templateKey: "welcome_email",
      customerId: customer.id,
      notificationType: "welcome_email",
      data: { datasetCount: datasets.length, hasSql: Boolean(options.sql), reportCount: reportEntries.length },
    });

    if (result.status !== "sent") {
      return {
        outcome: "failed",
        errorCode: "WELCOME_EMAIL_SEND_FAILED",
        errorMessage: result.error ?? "Failed to send welcome email",
      };
    }

    log.info({ customerId: customer.id, correlationId, notificationId: result.notificationId }, "Welcome email sent");
    return { outcome: "succeeded", resourceId: result.notificationId };
  },
};
