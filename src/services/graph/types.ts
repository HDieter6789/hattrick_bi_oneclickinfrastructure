/** Shared types for the Microsoft Graph service layer. Kept framework-free
 * so they can be imported from both server actions and background job
 * runners. Mirrors the shape of services/fabric/types.ts, but this module
 * is never imported by anything under services/fabric and vice versa —
 * Graph and Fabric logic are never mixed (brief section 23). */

export interface GraphRequestOptions {
  correlationId?: string;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface GraphApiError {
  status: number;
  errorCode?: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export class GraphApiException extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(error: GraphApiError) {
    super(error.message);
    this.name = "GraphApiException";
    this.status = error.status;
    this.errorCode = error.errorCode;
    this.requestId = error.requestId;
    this.details = error.details;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export type GraphUserType = "Member" | "Guest";

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  userType: GraphUserType;
}

export interface GraphGroup {
  id: string;
  displayName: string;
  mailNickname: string;
  securityEnabled: boolean;
}

export interface InviteGuestUserInput {
  email: string;
  displayName?: string;
  /** Where the invited guest lands after redeeming the invitation — the
   * customer portal sign-in page in practice. */
  redirectUrl: string;
  messageText?: string;
}

export interface InviteGuestUserResult {
  invitedUser: GraphUser;
  /** The redemption URL the invitee must open to accept the B2B invite. */
  inviteRedeemUrl: string;
  status: "PendingAcceptance" | "Completed";
}

export interface GraphFreeBusySlot {
  start: Date;
  end: Date;
  status: "free" | "busy" | "tentative" | "outOfOffice" | "unknown";
}

export interface CreateCalendarEventInput {
  subject: string;
  start: Date;
  end: Date;
  /** IANA/Windows timezone name Graph expects — kept simple, UTC unless
   * the caller supplies one. */
  timeZone?: string;
  body?: string;
  attendeeEmails?: string[];
  location?: string;
}

export interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: Date;
  end: Date;
  organizerEmail: string | null;
  webLink?: string;
}

export interface SendMailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
  cc?: string[];
}
