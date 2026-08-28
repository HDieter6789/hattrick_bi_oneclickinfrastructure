import { getEnv } from "@/lib/env";
import { getGraphClient } from "@/services/graph";
import type { MailService } from "./mail-service";
import { MockMailService } from "./mock-mail-service";
import { SmtpMailService } from "./smtp-mail-service";
import { GraphMailService } from "./graph-mail-service";

let cached: MailService | null = null;

/** Factory — keyed off MAIL_PROVIDER (mock|smtp|graph), same pattern as
 * services/calendar's CALENDAR_PROVIDER. */
export function getMailService(): MailService {
  if (cached) return cached;
  const provider = getEnv().MAIL_PROVIDER;
  if (provider === "smtp") {
    cached = new SmtpMailService();
  } else if (provider === "graph") {
    cached = new GraphMailService(getGraphClient());
  } else {
    cached = new MockMailService();
  }
  return cached;
}

export type { MailService, SendMailInput, SendMailResult } from "./mail-service";
export { buildWelcomeEmail } from "./templates/welcome-email";
export type {
  RenderedEmail,
  WelcomeEmailAppointment,
  WelcomeEmailCustomer,
  WelcomeEmailDataset,
  WelcomeEmailOptions,
  WelcomeEmailReport,
  WelcomeEmailSqlAccess,
} from "./templates/welcome-email";
