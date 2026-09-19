import type { DatabaseSync } from "node:sqlite";
import { logger } from "./logger.js";
import { validateDescription, validateProject, validateTerm } from "./validation.js";

export interface LookupInput {
  project: unknown;
  term: unknown;
}

export interface LookupResult {
  project: string;
  term: string;
  status: "documented" | "undocumented";
  description: string | null;
  updatedAt: string | null;
}

interface GlossaryRow {
  project: string;
  term: string;
  description: string | null;
  updated_at: string;
}

/**
 * Reads the definition of one term in one project.
 *
 * When the term is absent, the function inserts a row with a NULL description.
 * That NULL marks the gap, so the missing definition stays visible instead of
 * disappearing after the call.
 */
export function lookupTerm(db: DatabaseSync, input: LookupInput): LookupResult {
  const project = validateProject(input.project);
  const term = validateTerm(input.term);

  const row = db
    .prepare(
      "SELECT project, term, description, updated_at FROM glossary WHERE project = ? AND term = ?",
    )
    .get(project, term) as GlossaryRow | undefined;

  if (row && row.description !== null) {
    logger.debug("glossary hit", { project: row.project, term: row.term });
    return {
      project: row.project,
      term: row.term,
      status: "documented",
      description: row.description,
      updatedAt: row.updated_at,
    };
  }

  if (!row) {
    db.prepare(
      "INSERT INTO glossary (project, term, description) VALUES (?, ?, NULL)",
    ).run(project, term);
    logger.info("glossary gap registered", { project, term });
  } else {
    logger.info("glossary gap already registered", { project, term });
  }

  return {
    project: row?.project ?? project,
    term: row?.term ?? term,
    status: "undocumented",
    description: null,
    updatedAt: row?.updated_at ?? null,
  };
}

export interface SaveInput {
  project: unknown;
  term: unknown;
  description: unknown;
}

export interface SaveResult {
  project: string;
  term: string;
  description: string;
  status: "created" | "updated";
}

/**
 * Writes the definition of one term. The call creates the entry, or fills a
 * gap that lookupTerm registered, or replaces the previous text.
 */
export function saveTerm(db: DatabaseSync, input: SaveInput): SaveResult {
  const project = validateProject(input.project);
  const term = validateTerm(input.term);
  const description = validateDescription(input.description);

  const existing = db
    .prepare("SELECT project, term FROM glossary WHERE project = ? AND term = ?")
    .get(project, term) as Pick<GlossaryRow, "project" | "term"> | undefined;

  db.prepare(
    `INSERT INTO glossary (project, term, description, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (project, term) DO UPDATE
       SET description = excluded.description,
           updated_at = excluded.updated_at`,
  ).run(project, term, description);

  const status = existing ? "updated" : "created";
  logger.info(`glossary entry ${status}`, { project, term });

  return {
    project: existing?.project ?? project,
    term: existing?.term ?? term,
    description,
    status,
  };
}

export interface TouchInput {
  project: unknown;
  term: unknown;
}

export interface TouchResult {
  project: string;
  term: string;
  updatedAt: string;
}

/**
 * Moves updated_at to now() without a change to the description.
 *
 * The agent calls this when the dev confirms that a definition is still
 * correct. The refresh marks the term as current, so a later lookup does not
 * treat the term as stale.
 */
export function touchTerm(db: DatabaseSync, input: TouchInput): TouchResult {
  const project = validateProject(input.project);
  const term = validateTerm(input.term);

  const row = db
    .prepare("SELECT description FROM glossary WHERE project = ? AND term = ?")
    .get(project, term) as Pick<GlossaryRow, "description"> | undefined;

  if (!row) {
    throw new Error(
      `"${term}" has no entry in ${project}. Call save_term to create the definition.`,
    );
  }
  if (row.description === null) {
    throw new Error(
      `"${term}" in ${project} has no definition yet. Call save_term instead of refresh_term.`,
    );
  }

  const updated = db
    .prepare(
      `UPDATE glossary SET updated_at = datetime('now')
       WHERE project = ? AND term = ?
       RETURNING project, term, updated_at`,
    )
    .get(project, term) as unknown as GlossaryRow;

  logger.info("glossary entry refreshed", { project, term });

  return {
    project: updated.project,
    term: updated.term,
    updatedAt: updated.updated_at,
  };
}

export interface ListMissingInput {
  /** Optional filter. When absent, the call covers every project. */
  project?: unknown;
}

export interface MissingEntry {
  project: string;
  term: string;
  registeredAt: string;
}

/**
 * Lists the terms with a NULL description. These are the gaps that lookupTerm
 * registered and nobody documented yet.
 */
export function listMissingTerms(
  db: DatabaseSync,
  input: ListMissingInput = {},
): MissingEntry[] {
  const hasFilter = input.project !== undefined && input.project !== null;
  const project = hasFilter ? validateProject(input.project) : null;

  const sql = `SELECT project, term, updated_at
     FROM glossary
     WHERE description IS NULL
       ${project === null ? "" : "AND project = ?"}
     ORDER BY project, term`;

  const statement = db.prepare(sql);
  const rows = (project === null
    ? statement.all()
    : statement.all(project)) as unknown as GlossaryRow[];

  return rows.map((row) => ({
    project: row.project,
    term: row.term,
    registeredAt: row.updated_at,
  }));
}
