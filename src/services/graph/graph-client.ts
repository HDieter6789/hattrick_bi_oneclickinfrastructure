import type {
  CreateCalendarEventInput,
  GraphCalendarEvent,
  GraphFreeBusySlot,
  GraphGroup,
  GraphRequestOptions,
  GraphUser,
  InviteGuestUserInput,
  InviteGuestUserResult,
  SendMailInput,
} from "./types";

/**
 * The only interface the rest of the application is allowed to use to talk
 * to Microsoft Graph. Deliberately separate from `FabricApiClient` — no
 * component, server action, or provisioning step ever issues a raw
 * `fetch` against graph.microsoft.com, and Graph logic is never mixed into
 * the Fabric client (brief section 23). Covers exactly what this codebase
 * needs: B2B guest invites, security group management for the customer
 * access boundary, calendar free/busy + booking for the appointment
 * scheduler, and mail sending for `GraphMailService`.
 */
export interface MicrosoftGraphClient {
  getUserById(id: string, options?: GraphRequestOptions): Promise<GraphUser | null>;
  getUserByEmail(email: string, options?: GraphRequestOptions): Promise<GraphUser | null>;
  inviteGuestUser(input: InviteGuestUserInput, options?: GraphRequestOptions): Promise<InviteGuestUserResult>;

  createSecurityGroup(displayName: string, mailNickname: string, options?: GraphRequestOptions): Promise<GraphGroup>;
  getSecurityGroupByName(displayName: string, options?: GraphRequestOptions): Promise<GraphGroup | null>;
  addGroupMember(groupId: string, principalId: string, options?: GraphRequestOptions): Promise<void>;
  listGroupMembers(groupId: string, options?: GraphRequestOptions): Promise<GraphUser[]>;

  /** Free/busy for one or more users' calendars over a window — backs
   * available-slot computation in GraphCalendarService. */
  getFreeBusy(userIds: string[], start: Date, end: Date, options?: GraphRequestOptions): Promise<Map<string, GraphFreeBusySlot[]>>;
  createCalendarEvent(calendarUserId: string, input: CreateCalendarEventInput, options?: GraphRequestOptions): Promise<GraphCalendarEvent>;
  listCalendarEvents(calendarUserId: string, start: Date, end: Date, options?: GraphRequestOptions): Promise<GraphCalendarEvent[]>;
  cancelCalendarEvent(calendarUserId: string, eventId: string, options?: GraphRequestOptions): Promise<void>;

  sendMail(input: SendMailInput, options?: GraphRequestOptions): Promise<void>;
}
