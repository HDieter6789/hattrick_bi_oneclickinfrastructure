import { randomUUID } from "node:crypto";
import { childLogger } from "@/lib/logger";
import type { MicrosoftGraphClient } from "./graph-client";
import type {
  CreateCalendarEventInput,
  GraphCalendarEvent,
  GraphFreeBusySlot,
  GraphGroup,
  GraphUser,
  InviteGuestUserInput,
  InviteGuestUserResult,
  SendMailInput,
} from "./types";

const log = childLogger({ module: "graph.mock-client" });

interface MockGroup extends GraphGroup {
  memberIds: Set<string>;
}

/**
 * In-memory Microsoft Graph simulation used when DEMO_MODE=true. Behaves
 * like a real directory: users can be looked up, guest invitations create
 * a real (mock) guest user record, groups persist membership, and calendar
 * events are tracked per calendar user so free/busy reflects what was
 * actually booked. Never used in production — see services/graph/index.ts.
 */
export class MockMicrosoftGraphClient implements MicrosoftGraphClient {
  private readonly usersById = new Map<string, GraphUser>();
  private readonly usersByEmail = new Map<string, GraphUser>();
  private readonly groupsById = new Map<string, MockGroup>();
  private readonly groupsByName = new Map<string, string>();
  private readonly eventsByCalendarUser = new Map<string, GraphCalendarEvent[]>();
  readonly sentMail: SendMailInput[] = [];

  constructor(seedUsers: GraphUser[] = defaultSeedUsers()) {
    for (const user of seedUsers) this.registerUser(user);
  }

  private registerUser(user: GraphUser): void {
    this.usersById.set(user.id, user);
    if (user.mail) this.usersByEmail.set(user.mail.toLowerCase(), user);
    this.usersByEmail.set(user.userPrincipalName.toLowerCase(), user);
  }

  async getUserById(id: string): Promise<GraphUser | null> {
    return this.usersById.get(id) ?? null;
  }

  async getUserByEmail(email: string): Promise<GraphUser | null> {
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }

  async inviteGuestUser(input: InviteGuestUserInput): Promise<InviteGuestUserResult> {
    const existing = await this.getUserByEmail(input.email);
    if (existing) {
      return { invitedUser: existing, inviteRedeemUrl: `${input.redirectUrl}?mockInvite=already-member`, status: "Completed" };
    }
    const user: GraphUser = {
      id: `mock-guest-${randomUUID()}`,
      displayName: input.displayName ?? input.email,
      mail: input.email,
      userPrincipalName: input.email,
      userType: "Guest",
    };
    this.registerUser(user);
    log.debug({ email: input.email, id: user.id }, "Mock guest invitation created");
    return { invitedUser: user, inviteRedeemUrl: `${input.redirectUrl}?mockInvite=${user.id}`, status: "PendingAcceptance" };
  }

  async createSecurityGroup(displayName: string, mailNickname: string): Promise<GraphGroup> {
    const existingId = this.groupsByName.get(displayName.toLowerCase());
    if (existingId) return this.stripMembers(this.groupsById.get(existingId)!);

    const group: MockGroup = {
      id: `mock-group-${randomUUID()}`,
      displayName,
      mailNickname,
      securityEnabled: true,
      memberIds: new Set(),
    };
    this.groupsById.set(group.id, group);
    this.groupsByName.set(displayName.toLowerCase(), group.id);
    log.debug({ displayName, id: group.id }, "Mock security group created");
    return this.stripMembers(group);
  }

  async getSecurityGroupByName(displayName: string): Promise<GraphGroup | null> {
    const id = this.groupsByName.get(displayName.toLowerCase());
    if (!id) return null;
    return this.stripMembers(this.groupsById.get(id)!);
  }

  async addGroupMember(groupId: string, principalId: string): Promise<void> {
    const group = this.groupsById.get(groupId);
    if (!group) {
      const err = new Error(`Mock Graph group not found: ${groupId}`) as Error & { status: number };
      err.status = 404;
      throw err;
    }
    group.memberIds.add(principalId);
  }

  async listGroupMembers(groupId: string): Promise<GraphUser[]> {
    const group = this.groupsById.get(groupId);
    if (!group) return [];
    return [...group.memberIds].map((id) => this.usersById.get(id)).filter((u): u is GraphUser => Boolean(u));
  }

  async getFreeBusy(userIds: string[], start: Date, end: Date): Promise<Map<string, GraphFreeBusySlot[]>> {
    const result = new Map<string, GraphFreeBusySlot[]>();
    for (const userId of userIds) {
      const events = (this.eventsByCalendarUser.get(userId) ?? []).filter((e) => e.start < end && e.end > start);
      result.set(
        userId,
        events.map((e) => ({ start: e.start, end: e.end, status: "busy" as const })),
      );
    }
    return result;
  }

  async createCalendarEvent(calendarUserId: string, input: CreateCalendarEventInput): Promise<GraphCalendarEvent> {
    await simulateLatency();
    const event: GraphCalendarEvent = {
      id: `mock-evt-${randomUUID()}`,
      subject: input.subject,
      start: input.start,
      end: input.end,
      organizerEmail: this.usersById.get(calendarUserId)?.mail ?? null,
    };
    const events = this.eventsByCalendarUser.get(calendarUserId) ?? [];
    events.push(event);
    this.eventsByCalendarUser.set(calendarUserId, events);
    log.debug({ calendarUserId, eventId: event.id }, "Mock calendar event created");
    return event;
  }

  async listCalendarEvents(calendarUserId: string, start: Date, end: Date): Promise<GraphCalendarEvent[]> {
    return (this.eventsByCalendarUser.get(calendarUserId) ?? []).filter((e) => e.start < end && e.end > start);
  }

  async cancelCalendarEvent(calendarUserId: string, eventId: string): Promise<void> {
    const events = this.eventsByCalendarUser.get(calendarUserId) ?? [];
    this.eventsByCalendarUser.set(
      calendarUserId,
      events.filter((e) => e.id !== eventId),
    );
  }

  async sendMail(input: SendMailInput): Promise<void> {
    this.sentMail.push(input);
    log.info({ to: input.to, subject: input.subject }, "Mock Graph mail send");
  }

  private stripMembers(group: MockGroup): GraphGroup {
    return { id: group.id, displayName: group.displayName, mailNickname: group.mailNickname, securityEnabled: group.securityEnabled };
  }
}

function defaultSeedUsers(): GraphUser[] {
  return [
    { id: "mock-user-agent", displayName: "Fabric Consultant", mail: "agent@oneclick-fabric.example", userPrincipalName: "agent@oneclick-fabric.example", userType: "Member" },
    { id: "mock-user-admin", displayName: "Platform Admin", mail: "admin@oneclick-fabric.example", userPrincipalName: "admin@oneclick-fabric.example", userType: "Member" },
    { id: "mock-user-customer", displayName: "Jamie Contoso", mail: "jamie@contoso.example", userPrincipalName: "jamie@contoso.example", userType: "Member" },
  ];
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60));
}
