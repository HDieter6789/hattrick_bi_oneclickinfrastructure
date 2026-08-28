import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { getCalendarService } from "@/services/calendar";
import type { ServiceAgent } from "@/generated/prisma/client";
import type { ServiceSkill } from "@/generated/prisma/enums";

const log = childLogger({ module: "appointments.auto-assign" });

export interface AutoAssignOptions {
  requiredSkill?: ServiceSkill;
  requiredLanguage?: string;
}

/**
 * Automatic service-agent assignment (brief section 26): pick an active
 * agent matching the required skill + language with real availability in
 * the near term, falling back in stages rather than returning nothing:
 *
 *  1. skill AND language match, with at least one open slot
 *  2. skill match only (any language), with at least one open slot
 *  3. skill match only, ignoring availability (still routes to the right
 *     specialist even if their calendar looks fully booked right now)
 *  4. any active agent at all
 *
 * `customerId` is accepted (and logged) for future preference-aware
 * matching (e.g. a customer's own language/tenant) and for the audit
 * trail, even though today's matching only looks at skill/language.
 */
export async function autoAssignServiceAgent(customerId: string, options: AutoAssignOptions = {}): Promise<ServiceAgent | null> {
  const { requiredSkill, requiredLanguage } = options;

  const bySkillAndLanguage = await findActiveAgents({ requiredSkill, requiredLanguage });
  const withAvailability = await firstWithAvailability(bySkillAndLanguage);
  if (withAvailability) return logResult(customerId, withAvailability, "skill+language+availability");

  if (requiredLanguage) {
    const bySkillOnly = await findActiveAgents({ requiredSkill });
    const anyAvailable = await firstWithAvailability(bySkillOnly);
    if (anyAvailable) return logResult(customerId, anyAvailable, "skill+availability");
    if (bySkillOnly.length > 0) return logResult(customerId, bySkillOnly[0], "skill-only, no confirmed availability");
  } else if (bySkillAndLanguage.length > 0) {
    return logResult(customerId, bySkillAndLanguage[0], "skill-only, no confirmed availability");
  }

  const anyActive = await findActiveAgents({});
  if (anyActive.length > 0) return logResult(customerId, anyActive[0], "any active agent — no skill/language match found");

  log.warn({ customerId, requiredSkill, requiredLanguage }, "No active service agents available for auto-assignment");
  return null;
}

function logResult(customerId: string, agent: ServiceAgent, tier: string): ServiceAgent {
  log.info({ customerId, serviceAgentId: agent.id, tier }, "Auto-assigned service agent");
  return agent;
}

async function findActiveAgents(filter: { requiredSkill?: ServiceSkill; requiredLanguage?: string }): Promise<ServiceAgent[]> {
  return prisma.serviceAgent.findMany({
    where: {
      active: true,
      ...(filter.requiredSkill ? { skills: { has: filter.requiredSkill } } : {}),
      ...(filter.requiredLanguage ? { language: filter.requiredLanguage } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

async function firstWithAvailability(candidates: ServiceAgent[]): Promise<ServiceAgent | null> {
  if (candidates.length === 0) return null;
  const calendar = getCalendarService();
  for (const candidate of candidates) {
    try {
      const slots = await calendar.getAvailableSlots(candidate.id);
      if (slots.length > 0) return candidate;
    } catch (error) {
      log.warn({ err: error, serviceAgentId: candidate.id }, "Failed to check availability for auto-assignment candidate");
    }
  }
  return null;
}
