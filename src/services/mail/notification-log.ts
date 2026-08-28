import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import type { NotificationType } from "@/generated/prisma/enums";
import type { SendMailInput } from "./mail-service";

const log = childLogger({ module: "mail.notification-log" });

/** Non-sensitive short preview only — the full HTML/text body is never
 * persisted (Notification.bodyPreview comment). Truncated well below any
 * reasonable column limit. */
function toBodyPreview(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? "";
  return firstLine.slice(0, 200);
}

/** Shared by every MailService implementation so `Notification` rows are
 * written consistently regardless of provider (mock/smtp/graph) — the one
 * place that decides what's safe to persist about an outbound email. */
export async function recordNotification(
  input: SendMailInput,
  outcome: { status: "sent" | "failed"; error?: string },
): Promise<string | undefined> {
  try {
    const notification = await prisma.notification.create({
      data: {
        customerId: input.customerId,
        userId: input.userId,
        type: input.notificationType ?? inferNotificationType(input.templateKey),
        channel: "email",
        status: outcome.status,
        subject: input.subject,
        bodyPreview: toBodyPreview(input.text),
        sentAt: outcome.status === "sent" ? new Date() : null,
        error: outcome.error,
      },
    });
    return notification.id;
  } catch (error) {
    // Persisting the audit trail should never take down the actual send
    // path — log and move on.
    log.error({ err: error, templateKey: input.templateKey }, "Failed to record mail Notification row");
    return undefined;
  }
}

function inferNotificationType(templateKey: string): NotificationType {
  if (templateKey === "welcome_email") return "welcome_email";
  if (templateKey === "appointment_confirmation") return "appointment_confirmation";
  return "general";
}
