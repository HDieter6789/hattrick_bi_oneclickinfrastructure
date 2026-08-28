import { getEnv, isDemoMode } from "@/lib/env";
import type { MicrosoftGraphClient } from "./graph-client";
import { RealMicrosoftGraphClient } from "./real-graph-client";
import { MockMicrosoftGraphClient } from "./mock-graph-client";
import { createGraphTokenProvider } from "./token-provider";

let cached: MicrosoftGraphClient | null = null;

/** Factory — the only place `DEMO_MODE` is checked for the Graph client.
 * Every caller depends on the `MicrosoftGraphClient` interface only, the
 * same pattern as services/fabric/index.ts. */
export function getGraphClient(): MicrosoftGraphClient {
  if (cached) return cached;
  if (isDemoMode()) {
    cached = new MockMicrosoftGraphClient();
  } else {
    const env = getEnv();
    cached = new RealMicrosoftGraphClient(env.GRAPH_API_BASE_URL, createGraphTokenProvider());
  }
  return cached;
}

export type { MicrosoftGraphClient } from "./graph-client";
export { GraphApiException } from "./types";
export type {
  CreateCalendarEventInput,
  GraphApiError,
  GraphCalendarEvent,
  GraphFreeBusySlot,
  GraphGroup,
  GraphRequestOptions,
  GraphUser,
  GraphUserType,
  InviteGuestUserInput,
  InviteGuestUserResult,
  SendMailInput,
} from "./types";
