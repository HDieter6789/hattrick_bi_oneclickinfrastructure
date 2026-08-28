import { childLogger } from "@/lib/logger";
import { redactForPersistence } from "@/lib/redact";
import type { MailService, SendMailInput, SendMailResult } from "./mail-service";
import { recordNotification } from "./notification-log";

const log = childLogger({ module: "mail.mock-service" });

/** Demo-mode mail — never sends a real email. Logs the (redacted) send
 * intent to the app logger and writes a `Notification` row with
 * `status: "sent"` so the rest of the app (admin portal, tests) behaves
 * identically to a real send. */
export class MockMailService implements MailService {
  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    log.info(
      {
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        templateKey: input.templateKey,
        data: input.data ? redactForPersistence(input.data) : undefined,
      },
      "Mock mail send",
    );
    const notificationId = await recordNotification(input, { status: "sent" });
    return { status: "sent", notificationId };
  }
}
