import { randomUUID } from "node:crypto";
import { childLogger } from "@/lib/logger";
import { redactForPersistence } from "@/lib/redact";
import { getEnv } from "@/lib/env";
import type { AccessTokenProvider } from "@/lib/entra-client-credentials";
import type { MicrosoftGraphClient } from "./graph-client";
import { GraphApiException } from "./types";
import type {
  CreateCalendarEventInput,
  GraphApiError,
  GraphCalendarEvent,
  GraphFreeBusySlot,
  GraphGroup,
  GraphRequestOptions,
  GraphUser,
  InviteGuestUserInput,
  InviteGuestUserResult,
  SendMailInput,
} from "./types";

const log = childLogger({ module: "graph.client" });

const MAX_RETRIES = 3;
const DEFAULT_SELECT = "id,displayName,mail,userPrincipalName,userType";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Graph returns dateTime strings without a trailing offset when the
 * requested timeZone is UTC (e.g. "2026-09-01T09:00:00.0000000") — append
 * "Z" only when no offset/zone marker is already present. */
function parseGraphDateTime(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}

interface GraphUserResponse {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string;
  userType: string | null;
}

function toGraphUser(u: GraphUserResponse): GraphUser {
  return {
    id: u.id,
    displayName: u.displayName ?? u.userPrincipalName,
    mail: u.mail,
    userPrincipalName: u.userPrincipalName,
    userType: u.userType === "Guest" ? "Guest" : "Member",
  };
}

/**
 * Production Microsoft Graph client. Implements:
 *  - bearer auth via the injected AccessTokenProvider (app-only /
 *    client-credentials — see token-provider.ts)
 *  - correlation id propagation (client-request-id, Graph's convention)
 *  - basic retry with backoff on 429/5xx, honoring Retry-After — kept
 *    proportionate to what this codebase needs; no LRO polling since every
 *    Graph call used here is synchronous
 *
 * Every request/response captured for logging/redaction goes through
 * redactForPersistence before it is ever logged.
 */
export class RealMicrosoftGraphClient implements MicrosoftGraphClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: AccessTokenProvider,
  ) {}

  async getUserById(id: string, options?: GraphRequestOptions): Promise<GraphUser | null> {
    try {
      const user = await this.request<GraphUserResponse>("GET", `/users/${encodeURIComponent(id)}`, undefined, {
        ...options,
        query: { $select: DEFAULT_SELECT },
      });
      return toGraphUser(user);
    } catch (error) {
      if (error instanceof GraphApiException && error.status === 404) return null;
      throw error;
    }
  }

  async getUserByEmail(email: string, options?: GraphRequestOptions): Promise<GraphUser | null> {
    const filter = `mail eq '${email.replace(/'/g, "''")}' or userPrincipalName eq '${email.replace(/'/g, "''")}'`;
    const page = await this.request<{ value: GraphUserResponse[] }>("GET", "/users", undefined, {
      ...options,
      query: { $filter: filter, $select: DEFAULT_SELECT },
    });
    const found = page.value[0];
    return found ? toGraphUser(found) : null;
  }

  async inviteGuestUser(input: InviteGuestUserInput, options?: GraphRequestOptions): Promise<InviteGuestUserResult> {
    const body = {
      invitedUserEmailAddress: input.email,
      invitedUserDisplayName: input.displayName,
      inviteRedirectUrl: input.redirectUrl,
      sendInvitationMessage: true,
      ...(input.messageText
        ? { invitedUserMessageInfo: { customizedMessageBody: input.messageText } }
        : {}),
    };
    const response = await this.request<{
      invitedUser: { id: string };
      inviteRedeemUrl: string;
      status: string;
    }>("POST", "/invitations", body, options);

    return {
      invitedUser: {
        id: response.invitedUser.id,
        displayName: input.displayName ?? input.email,
        mail: input.email,
        userPrincipalName: input.email,
        userType: "Guest",
      },
      inviteRedeemUrl: response.inviteRedeemUrl,
      status: response.status === "Completed" ? "Completed" : "PendingAcceptance",
    };
  }

  async createSecurityGroup(displayName: string, mailNickname: string, options?: GraphRequestOptions): Promise<GraphGroup> {
    const body = {
      displayName,
      mailNickname,
      mailEnabled: false,
      securityEnabled: true,
      groupTypes: [],
    };
    const group = await this.request<{ id: string; displayName: string; mailNickname: string; securityEnabled: boolean }>(
      "POST",
      "/groups",
      body,
      options,
    );
    return { id: group.id, displayName: group.displayName, mailNickname: group.mailNickname, securityEnabled: group.securityEnabled };
  }

  async getSecurityGroupByName(displayName: string, options?: GraphRequestOptions): Promise<GraphGroup | null> {
    const filter = `displayName eq '${displayName.replace(/'/g, "''")}'`;
    const page = await this.request<{ value: { id: string; displayName: string; mailNickname: string; securityEnabled: boolean }[] }>(
      "GET",
      "/groups",
      undefined,
      { ...options, query: { $filter: filter } },
    );
    const found = page.value[0];
    return found ? { id: found.id, displayName: found.displayName, mailNickname: found.mailNickname, securityEnabled: found.securityEnabled } : null;
  }

  async addGroupMember(groupId: string, principalId: string, options?: GraphRequestOptions): Promise<void> {
    try {
      await this.request(
        "POST",
        `/groups/${encodeURIComponent(groupId)}/members/$ref`,
        { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${principalId}` },
        options,
      );
    } catch (error) {
      // Graph returns 400 "one or more added object references already
      // exist" when the principal is already a member — treat as success,
      // this call must be idempotent (customers can be re-granted access).
      if (error instanceof GraphApiException && error.status === 400 && /already exist/i.test(error.message)) {
        return;
      }
      throw error;
    }
  }

  async listGroupMembers(groupId: string, options?: GraphRequestOptions): Promise<GraphUser[]> {
    const page = await this.request<{ value: GraphUserResponse[] }>(
      "GET",
      `/groups/${encodeURIComponent(groupId)}/members`,
      undefined,
      { ...options, query: { $select: DEFAULT_SELECT } },
    );
    return page.value.map(toGraphUser);
  }

  async getFreeBusy(userIds: string[], start: Date, end: Date, options?: GraphRequestOptions): Promise<Map<string, GraphFreeBusySlot[]>> {
    if (userIds.length === 0) return new Map();
    const body = {
      schedules: userIds,
      startTime: { dateTime: start.toISOString(), timeZone: "UTC" },
      endTime: { dateTime: end.toISOString(), timeZone: "UTC" },
      availabilityViewInterval: 30,
    };
    const response = await this.request<{
      value: { scheduleId: string; scheduleItems: { status: string; start: { dateTime: string }; end: { dateTime: string } }[] }[];
    }>("POST", `/users/${encodeURIComponent(userIds[0])}/calendar/getSchedule`, body, options);

    const result = new Map<string, GraphFreeBusySlot[]>();
    for (const schedule of response.value) {
      result.set(
        schedule.scheduleId,
        schedule.scheduleItems.map((item) => ({
          start: parseGraphDateTime(item.start.dateTime),
          end: parseGraphDateTime(item.end.dateTime),
          status: normalizeFreeBusyStatus(item.status),
        })),
      );
    }
    return result;
  }

  async createCalendarEvent(calendarUserId: string, input: CreateCalendarEventInput, options?: GraphRequestOptions): Promise<GraphCalendarEvent> {
    const timeZone = input.timeZone ?? "UTC";
    const body = {
      subject: input.subject,
      start: { dateTime: input.start.toISOString(), timeZone },
      end: { dateTime: input.end.toISOString(), timeZone },
      body: { contentType: "HTML", content: input.body ?? "" },
      attendees: (input.attendeeEmails ?? []).map((email) => ({
        emailAddress: { address: email },
        type: "required",
      })),
      ...(input.location ? { location: { displayName: input.location } } : {}),
    };
    const event = await this.request<{
      id: string;
      subject: string;
      start: { dateTime: string };
      end: { dateTime: string };
      organizer?: { emailAddress?: { address?: string } };
      webLink?: string;
    }>("POST", `/users/${encodeURIComponent(calendarUserId)}/events`, body, options);

    return {
      id: event.id,
      subject: event.subject,
      start: parseGraphDateTime(event.start.dateTime),
      end: parseGraphDateTime(event.end.dateTime),
      organizerEmail: event.organizer?.emailAddress?.address ?? null,
      webLink: event.webLink,
    };
  }

  async listCalendarEvents(calendarUserId: string, start: Date, end: Date, options?: GraphRequestOptions): Promise<GraphCalendarEvent[]> {
    const page = await this.request<{
      value: { id: string; subject: string; start: { dateTime: string }; end: { dateTime: string }; organizer?: { emailAddress?: { address?: string } } }[];
    }>("GET", `/users/${encodeURIComponent(calendarUserId)}/calendarView`, undefined, {
      ...options,
      query: { startDateTime: start.toISOString(), endDateTime: end.toISOString() },
    });

    return page.value.map((event) => ({
      id: event.id,
      subject: event.subject,
      start: parseGraphDateTime(event.start.dateTime),
      end: parseGraphDateTime(event.end.dateTime),
      organizerEmail: event.organizer?.emailAddress?.address ?? null,
    }));
  }

  async cancelCalendarEvent(calendarUserId: string, eventId: string, options?: GraphRequestOptions): Promise<void> {
    await this.request("DELETE", `/users/${encodeURIComponent(calendarUserId)}/events/${encodeURIComponent(eventId)}`, undefined, options);
  }

  async sendMail(input: SendMailInput, options?: GraphRequestOptions): Promise<void> {
    const fromUser = getEnv().MAIL_FROM_ADDRESS;
    const body = {
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.html },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    };
    await this.request("POST", `/users/${encodeURIComponent(fromUser)}/sendMail`, body, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    options?: GraphRequestOptions,
    attempt = 1,
  ): Promise<T> {
    const correlationId = options?.correlationId ?? randomUUID();
    const token = await this.tokenProvider.getToken();
    const url = this.buildUrl(path, options?.query);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "client-request-id": correlationId,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if ((response.status === 429 || response.status >= 500) && attempt <= MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
      const backoffMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(500 * 2 ** attempt, 15_000);
      log.warn({ correlationId, status: response.status, attempt, backoffMs, path }, "Retrying Graph API call");
      await sleep(backoffMs + Math.random() * 250);
      return this.request<T>(method, path, body, { ...options, correlationId }, attempt + 1);
    }

    if (!response.ok) {
      throw new GraphApiException(await this.parseError(response, correlationId));
    }

    if (response.status === 204 || response.status === 202) {
      return undefined as T;
    }

    const result = (await response.json().catch(() => null)) as T;
    return result;
  }

  private async parseError(response: Response, correlationId: string): Promise<GraphApiError> {
    const raw = await response.json().catch(() => null);
    const inner = raw && typeof raw === "object" && "error" in raw ? (raw as { error: unknown }).error : raw;
    return {
      status: response.status,
      errorCode: inner && typeof inner === "object" && "code" in inner ? String((inner as { code: unknown }).code) : undefined,
      message:
        inner && typeof inner === "object" && "message" in inner
          ? String((inner as { message: unknown }).message)
          : `Graph API request failed with status ${response.status}`,
      requestId: response.headers.get("request-id") ?? correlationId,
      details: redactForPersistence(raw),
    };
  }

  private buildUrl(path: string, query?: GraphRequestOptions["query"]): string {
    const url = new URL(path.startsWith("http") ? path : `${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function normalizeFreeBusyStatus(status: string): GraphFreeBusySlot["status"] {
  switch (status) {
    case "free":
    case "busy":
    case "tentative":
    case "oof":
      return status === "oof" ? "outOfOffice" : (status as "free" | "busy" | "tentative");
    default:
      return "unknown";
  }
}
