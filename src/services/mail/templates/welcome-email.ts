/**
 * The welcome email (brief section 27). Content is governed by an exact
 * required list and an exact exclusion list — both enforced structurally
 * here, not just by convention:
 *
 *  - `WelcomeEmailOptions` is a narrow, whitelisted DTO. It has no field
 *    for a Fabric workspace/item id, a Fabric access token, a secret, or
 *    any deployment-log text — so there is nothing for this function to
 *    leak even by accident. Callers (the sendWelcomeEmailStep executor)
 *    must actively choose what goes in, not what stays out.
 *  - Dataset/report names are business names from `DatasetCatalogEntry`
 *    (never Fabric item ids), and SQL details are the customer-facing
 *    server/database from `SqlEndpoint` with the auth method hardcoded to
 *    "Microsoft Entra ID" — this function never accepts a password field
 *    at all (Fabric's SQL endpoints are Entra-authenticated only; there is
 *    no password to send).
 *
 * See tests/unit/welcome-email.test.ts for the regression test asserting
 * the rendered output never contains "token"/"password"/"secret" or a
 * UUID-shaped string, and always includes each required section when its
 * option is supplied.
 */

export interface WelcomeEmailCustomer {
  companyName: string;
  contactFirstName: string;
}

export interface WelcomeEmailDataset {
  name: string;
}

export interface WelcomeEmailReport {
  name: string;
}

/** Customer-facing SQL connection details only — server/database strings,
 * never a credential. Fabric SQL Analytics Endpoints are Microsoft Entra
 * ID authenticated only, so there is no password to send. */
export interface WelcomeEmailSqlAccess {
  server: string;
  database: string;
}

export interface WelcomeEmailAppointment {
  startTime: Date;
  agentName?: string;
}

export interface WelcomeEmailOptions {
  serviceStatus: string;
  datasets: WelcomeEmailDataset[];
  sql?: WelcomeEmailSqlAccess | null;
  reports?: WelcomeEmailReport[];
  dataFreshness?: string | null;
  nextAppointment?: WelcomeEmailAppointment | null;
  supportEmail: string;
  supportPhone?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function formatAppointmentTime(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function buildWelcomeEmail(customer: WelcomeEmailCustomer, options: WelcomeEmailOptions): RenderedEmail {
  const subject = `Welcome to your Fabric-based data service, ${customer.companyName}`;

  const textLines: string[] = [];
  const htmlSections: string[] = [];

  textLines.push(`Hi ${customer.contactFirstName},`, "", `Your Fabric-based data service for ${customer.companyName} is ready.`, "", `Service status: ${options.serviceStatus}`);
  htmlSections.push(
    `<p>Hi ${escapeHtml(customer.contactFirstName)},</p>`,
    `<p>Your Fabric-based data service for <strong>${escapeHtml(customer.companyName)}</strong> is ready.</p>`,
    `<h2>Service status</h2><p>${escapeHtml(options.serviceStatus)}</p>`,
  );

  // Available datasets (names only — never pipeline/notebook/lineage
  // internals, never a Fabric item id).
  textLines.push("", "Available datasets:");
  htmlSections.push("<h2>Available datasets</h2>");
  if (options.datasets.length > 0) {
    textLines.push(...options.datasets.map((d) => `  - ${d.name}`));
    htmlSections.push(`<ul>${options.datasets.map((d) => `<li>${escapeHtml(d.name)}</li>`).join("")}</ul>`);
  } else {
    textLines.push("  (none yet)");
    htmlSections.push("<p>(none yet)</p>");
  }

  if (options.sql) {
    textLines.push(
      "",
      "SQL self-service access:",
      `  Server: ${options.sql.server}`,
      `  Database: ${options.sql.database}`,
      "  Authentication method: Microsoft Entra ID (sign in with your work account)",
    );
    htmlSections.push(
      "<h2>SQL self-service access</h2>",
      "<ul>",
      `<li>Server: ${escapeHtml(options.sql.server)}</li>`,
      `<li>Database: ${escapeHtml(options.sql.database)}</li>`,
      "<li>Authentication method: Microsoft Entra ID (sign in with your work account)</li>",
      "</ul>",
    );
  }

  if (options.reports && options.reports.length > 0) {
    textLines.push("", "Reports:", ...options.reports.map((r) => `  - ${r.name}`));
    htmlSections.push("<h2>Reports</h2>", `<ul>${options.reports.map((r) => `<li>${escapeHtml(r.name)}</li>`).join("")}</ul>`);
  }

  if (options.dataFreshness) {
    textLines.push("", `Data freshness: ${options.dataFreshness}`);
    htmlSections.push("<h2>Data freshness</h2>", `<p>${escapeHtml(options.dataFreshness)}</p>`);
  }

  if (options.nextAppointment) {
    const when = formatAppointmentTime(options.nextAppointment.startTime);
    const withAgent = options.nextAppointment.agentName ? ` with ${options.nextAppointment.agentName}` : "";
    textLines.push("", `Your next service appointment: ${when}${withAgent}`);
    htmlSections.push("<h2>Your next service appointment</h2>", `<p>${escapeHtml(when)}${escapeHtml(withAgent)}</p>`);
  }

  textLines.push("", "Need help?", `  Email: ${options.supportEmail}`);
  htmlSections.push("<h2>Need help?</h2>", `<p>Email: ${escapeHtml(options.supportEmail)}</p>`);
  if (options.supportPhone) {
    textLines.push(`  Phone: ${options.supportPhone}`);
    htmlSections.push(`<p>Phone: ${escapeHtml(options.supportPhone)}</p>`);
  }

  const html = `<div>${htmlSections.join("")}</div>`;
  const text = textLines.join("\n");

  return { subject, html, text };
}
