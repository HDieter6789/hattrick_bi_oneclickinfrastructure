import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import type { MailService, SendMailInput, SendMailResult } from "./mail-service";
import { recordNotification } from "./notification-log";

const log = childLogger({ module: "mail.smtp-service" });

/** Production mail via SMTP (nodemailer) — used when MAIL_PROVIDER=smtp.
 * Credentials come only from env.ts (SMTP_HOST/PORT/USER/PASSWORD), never
 * hardcoded, and the transporter is never logged (nodemailer's own debug
 * output is left off). */
export class SmtpMailService implements MailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const env = getEnv();
    if (!env.SMTP_HOST || !env.SMTP_PORT) {
      throw new Error("SMTP is not configured (SMTP_HOST / SMTP_PORT are required when MAIL_PROVIDER=smtp)");
    }
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return this.transporter;
  }

  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    const env = getEnv();
    try {
      await this.getTransporter().sendMail({
        from: env.MAIL_FROM_ADDRESS,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      log.info({ to: input.to, subject: input.subject, templateKey: input.templateKey }, "SMTP mail sent");
      const notificationId = await recordNotification(input, { status: "sent" });
      return { status: "sent", notificationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP send failed";
      log.error({ err: error, to: input.to, templateKey: input.templateKey }, "SMTP mail send failed");
      const notificationId = await recordNotification(input, { status: "failed", error: message });
      return { status: "failed", notificationId, error: message };
    }
  }
}
