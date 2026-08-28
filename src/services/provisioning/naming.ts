/**
 * Naming convention resolution (brief section 41). Templates use
 * `{token}` placeholders; unresolved tokens are left as literal text
 * (surfaced to the user as an invalid-preview state rather than silently
 * dropped) so a typo'd token is visible before deployment, not after.
 */

export interface NamingContext {
  customer: string;
  environment: string;
  layer?: string;
  type?: string;
}

// Fabric display names: 1-256 chars, no leading/trailing whitespace, and
// (per the Items API reference) must not contain any of: " % & : \ / ? * ' < > | #
const FABRIC_INVALID_CHARS = /["%&:\\/?*'<>|#]/g;
const MAX_LENGTH = 256;

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveName(template: string, context: NamingContext): string {
  const tokens: Record<string, string> = {
    customer: slugify(context.customer),
    environment: context.environment.toLowerCase(),
    layer: context.layer ? slugify(context.layer) : "",
    type: context.type ? slugify(context.type) : "",
  };

  return template.replace(/\{(\w+)\}/g, (match, key: string) => tokens[key] ?? match);
}

export interface NameValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates a resolved (post-template) Fabric display name against
 * Fabric's documented display name constraints. */
export function validateFabricDisplayName(name: string): NameValidationResult {
  const errors: string[] = [];
  if (name.length === 0) errors.push("Name cannot be empty");
  if (name.length > MAX_LENGTH) errors.push(`Name exceeds ${MAX_LENGTH} characters`);
  if (name !== name.trim()) errors.push("Name cannot have leading or trailing whitespace");
  if (FABRIC_INVALID_CHARS.test(name)) errors.push(`Name contains characters not allowed by Fabric: " % & : \\ / ? * ' < > | #`);
  if (/\{(\w+)\}/.test(name)) errors.push("Name still contains an unresolved naming-template token");

  return { valid: errors.length === 0, errors };
}
