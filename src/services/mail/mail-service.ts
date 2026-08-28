import type { NotificationType } from "@/generated/prisma/enums";

export interface SendMailInput {
  to: string[];
  cc?: string[];
  subject: string;
  /** Rendered body. Callers build this from a template function (e.g.
   * templates/welcome-email.ts's `buildWelcomeEmail`) — the mail service
   * itself is a delivery mechanism, not a template engine. */
  html: string;
  text: string;
  /** Identifies which template produced this email, for logging/audit —
   * never used to re-render anything server-side. */
  templateKey: string;
  /** Template input, redacted and logged (never persisted verbatim) for
   * traceability — see src/lib/redact.ts. */
  data?: Record<string, unknown>;
  /** Optional linkage so a Notification row can be attributed. */
  customerId?: string;
  userId?: string;
  notificationType?: NotificationType;
}

export interface SendMailResult {
  status: "sent" | "failed";
  notificationId?: string;
  error?: string;
}

/**
 * The only interface the rest of the application uses to send mail — same
 * interface+mock/real+factory pattern as services/fabric and
 * services/graph. Every implementation writes a `Notification` row
 * (subject + non-sensitive bodyPreview only, never the full body) so mail
 * activity is auditable from the admin portal regardless of provider.
 */
export interface MailService {
  sendMail(input: SendMailInput): Promise<SendMailResult>;
}
