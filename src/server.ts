import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  listMissingTerms,
  lookupTerm,
  saveTerm,
  touchTerm,
  type LookupResult,
} from "./glossary.js";
import { logger } from "./logger.js";

const PROJECT_DESCRIPTION =
  "Name of the project or repository that owns the term, for example production-data-pipeline.";

const TERM_DESCRIPTION =
  "Name of the domain term. Use aggregate roots and entities, for example Order or Shipment. " +
  "Do not use DTOs, requests, responses, mappers or internal value objects.";

const REFERENCE_DESCRIPTION =
  "Optional source of the description, so a later reader can trace where it came from. " +
  "Use a URL for a document, \"user\" when a person gave the definition, or \"agent\" " +
  "when you wrote it from the code. Leave it out when the source is unknown.";

export interface ServerOptions {
  /**
   * The staleness threshold in days. lookup_term marks a definition as stale
   * when its age reaches this value. Defaults to the glossary default.
   */
  staleAfterDays?: number;
}

/**
 * Builds the MCP server with the 4 glossary tools.
 *
 * The caller owns the database connection, which keeps the tests free of
 * global state. The caller also passes the staleness threshold, so the same
 * value drives the log line and the tool result.
 */
export function createServer(
  db: DatabaseSync,
  options: ServerOptions = {},
): McpServer {
  const staleAfterDays = options.staleAfterDays;
  const server = new McpServer(
    { name: "domain-glossary", version: "0.1.0" },
    {
      instructions:
        "Use this glossary to get the business definition of a domain term before you read its source code. " +
        "Call lookup_term for aggregate roots and entities only. " +
        "When lookup_term reports an undocumented term, the gap is recorded; call save_term once you learn the definition.",
    },
  );

  server.registerTool(
    "lookup_term",
    {
      title: "Look up a domain term",
      description:
        "Returns the business definition of a domain term in a project, in 2 to 3 lines. " +
        "Call this instead of reading javadoc or a README when you need the meaning of an aggregate root or entity. " +
        "When the term has no definition yet, the server records the gap and reports the term as undocumented.",
      inputSchema: {
        project: z.string().describe(PROJECT_DESCRIPTION),
        term: z.string().describe(TERM_DESCRIPTION),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ project, term }) =>
      guard(() => {
        const result = lookupTerm(db, { project, term }, { staleAfterDays });
        const text =
          result.status === "documented"
            ? `${result.term}: ${result.description}` +
              (result.reference ? `\nSource: ${result.reference}.` : "") +
              staleLine(result)
            : `${result.term} is undocumented in ${result.project}. ` +
              `The gap is now recorded. Call save_term once you know the business definition.`;
        return { text, data: result };
      }),
  );

  server.registerTool(
    "save_term",
    {
      title: "Save a domain term",
      description:
        "Stores or replaces the business definition of a domain term in a project. " +
        "Keep the text to 2 or 3 lines and describe the business meaning, not the code structure.",
      inputSchema: {
        project: z.string().describe(PROJECT_DESCRIPTION),
        term: z.string().describe(TERM_DESCRIPTION),
        description: z
          .string()
          .describe("Business definition of the term, 2 to 3 lines."),
        reference: z.string().optional().describe(REFERENCE_DESCRIPTION),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ project, term, description, reference }) =>
      guard(() => {
        const result = saveTerm(db, { project, term, description, reference });
        return {
          text:
            `${result.term} in ${result.project} was ${result.status}.` +
            (result.reference ? ` Source: ${result.reference}.` : ""),
          data: result,
        };
      }),
  );

  server.registerTool(
    "refresh_term",
    {
      title: "Refresh a domain term",
      description:
        "Marks an existing definition as current by moving its updated_at to now, without a change to the text. " +
        "Call this when the dev confirms that a definition is still correct but looks stale. " +
        "To change the text, call save_term instead.",
      inputSchema: {
        project: z.string().describe(PROJECT_DESCRIPTION),
        term: z.string().describe(TERM_DESCRIPTION),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ project, term }) =>
      guard(() => {
        const result = touchTerm(db, { project, term });
        return {
          text: `${result.term} in ${result.project} is now current (updated ${result.updatedAt} UTC).`,
          data: result,
        };
      }),
  );

  server.registerTool(
    "list_missing_terms",
    {
      title: "List undocumented domain terms",
      description:
        "Lists the domain terms that have no definition yet. These gaps come from earlier lookup_term calls. " +
        "Pass a project to narrow the list.",
      inputSchema: {
        project: z.string().optional().describe(PROJECT_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ project }) =>
      guard(() => {
        const missing = listMissingTerms(db, { project });
        const text =
          missing.length === 0
            ? "Every known term has a definition."
            : missing.map((entry) => `${entry.project}: ${entry.term}`).join("\n");
        return { text, data: { count: missing.length, terms: missing } };
      }),
  );

  return server;
}

/**
 * Builds the age line for a documented term. A stale definition gets a clear
 * warning and a next step; a fresh one gets a short note. The server computes
 * the staleness, so the agent reads a signal instead of the raw date.
 */
function staleLine(result: LookupResult): string {
  if (!result.updatedAt || result.ageDays === null) {
    return "";
  }

  const age = `last updated ${result.updatedAt} UTC, ${result.ageDays} days ago`;

  if (result.stale) {
    return (
      `\n⚠️ This definition is stale (${age}, over the ${result.staleAfterDays}-day limit). ` +
      `It MAY be outdated. Ask the dev to confirm it. ` +
      `If it changed, call save_term with the new text. ` +
      `If it is still correct, call refresh_term to mark it current.`
    );
  }

  return `\n(${age}.)`;
}

/**
 * Runs a tool body and turns a validation error into a tool error result.
 * A thrown error would reach the client as a protocol error, which gives the
 * agent less to work with.
 */
function guard(body: () => { text: string; data: unknown }) {
  try {
    const { text, data } = body();
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: data as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("tool call rejected", { message });
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    };
  }
}
