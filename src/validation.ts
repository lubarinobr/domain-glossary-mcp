/**
 * Light input validation.
 *
 * The server holds business definitions of domain terms, so it rejects names
 * that clearly belong to another layer. An allowlist file would need manual
 * maintenance and goes out of sync with the code in a few weeks.
 */

/** Suffixes that mark a class outside the domain model. */
const REJECTED_SUFFIXES = [
  "DTO",
  "Request",
  "Response",
  "Mapper",
  "Config",
] as const;

export function validateProject(value: unknown): string {
  const project = asTrimmedString(value);
  if (project.length === 0) {
    throw new Error("The project must not be empty.");
  }
  return project;
}

export function validateTerm(value: unknown): string {
  const term = asTrimmedString(value);
  if (term.length === 0) {
    throw new Error("The term must not be empty.");
  }

  const lower = term.toLowerCase();
  for (const suffix of REJECTED_SUFFIXES) {
    if (lower.endsWith(suffix.toLowerCase())) {
      throw new Error(
        `"${term}" ends with "${suffix}", so it is not a domain term. ` +
          `Use the name of an aggregate root or an entity, for example Order or Shipment.`,
      );
    }
  }

  return term;
}

export function validateDescription(value: unknown): string {
  const description = asTrimmedString(value);
  if (description.length === 0) {
    throw new Error("The description must not be empty.");
  }
  return description;
}

/**
 * Validates the optional reference, the source of a description.
 *
 * The value names where the definition came from, for example a URL, "user"
 * or "agent". The field is optional. An absent value, or a value that holds
 * only whitespace, becomes null.
 */
export function validateReference(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const reference = asTrimmedString(value);
  return reference.length === 0 ? null : reference;
}

function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}
