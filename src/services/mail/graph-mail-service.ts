import { childLogger } from "@/lib/logger";
import type { MicrosoftGraphClient } from "@/services/graph/graph-client";
import type { MailService, SendMailInput, SendMailResult } from "./mail-service";
import { recordNotification } from "./notification-log";

const log = childLogger({ module: "mail.graph-service" });

/** Production mail via Microsoft Graph `sendMail` — used when
 * MAIL_PROVIDER=graph (e.g. no SMTP relay available, sending as a
 * licensed Microsoft 365 mailbox instead). Requires the Graph app
 * registration to hold `Mail.Send`. */
export class GraphMailService implements MailService {
  constructor(private readonly graph: MicrosoftGraphClient) {}

  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    try {
      await this.graph.sendMail({ to: input.to, cc: input.cc, subject: input.subject, html: input.html, text: input.text });
      log.info({ to: input.to, subject: input.subject, templateKey: input.templateKey }, "Graph mail sent");
      const notificationId = await recordNotification(input, { status: "sent" });
      return { status: "sent", notificationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Graph mail send failed";
      log.error({ err: error, to: input.to, templateKey: input.templateKey }, "Graph mail send failed");
      const notificationId = await recordNotification(input, { status: "failed", error: message });
      return { status: "failed", notificationId, error: message };
    }
  }
}
