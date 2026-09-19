import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import envPaths from "env-paths";
import { logger } from "./logger.js";

/**
 * The glossary lives in one central SQLite file shared by every project.
 *
 * The file never lives inside node_modules, because npm deletes that content
 * on each reinstall.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS glossary (
  project     TEXT NOT NULL COLLATE NOCASE,
  term        TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  reference   TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project, term)
) STRICT;

CREATE INDEX IF NOT EXISTS glossary_missing_idx
  ON glossary (project) WHERE description IS NULL;
`;

/**
 * Adds columns that a newer version introduced to a database that an older
 * version created. CREATE TABLE IF NOT EXISTS never alters an existing table,
 * so a new column needs an explicit ALTER.
 */
function migrate(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(glossary)").all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("reference")) {
    db.exec("ALTER TABLE glossary ADD COLUMN reference TEXT");
    logger.debug("glossary schema migrated", { added: "reference" });
  }
}

/** Flags that carry the database path on the command line. */
const DB_FLAGS = ["--db", "--db-path"] as const;

/**
 * Resolves the database path.
 *
 * 1. The `--db <path>` argument, which belongs in the `args` array of the MCP
 *    client config.
 * 2. `GLOSSARY_DB_PATH`, which belongs in the `env` block of the same config.
 * 3. The per-user data directory from env-paths, the global glossary.
 *
 * The result is always an absolute path. A leading `~` becomes the home
 * directory, because a JSON config cannot rely on shell expansion.
 */
export function resolveDbPath(
  env: Record<string, string | undefined> = process.env,
  argv: string[] = process.argv.slice(2),
): string {
  const fromArgs = readDbFlag(argv);
  if (fromArgs) {
    return toAbsolute(fromArgs);
  }

  const fromEnv = env.GLOSSARY_DB_PATH?.trim();
  if (fromEnv) {
    return toAbsolute(fromEnv);
  }

  return join(envPaths("domain-glossary").data, "glossary.db");
}

/** Reads `--db <path>` or `--db=<path>`. Returns null when the value is absent. */
function readDbFlag(argv: string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    for (const flag of DB_FLAGS) {
      if (token === flag) {
        const value = argv[index + 1]?.trim();
        return value ? value : null;
      }
      if (token.startsWith(`${flag}=`)) {
        const value = token.slice(flag.length + 1).trim();
        return value ? value : null;
      }
    }
  }
  return null;
}

function toAbsolute(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return resolve(value);
}

/**
 * Opens the database, creates the parent directory, enables WAL mode and
 * applies the schema. Repeated calls are safe and keep existing rows.
 */
export function openDatabase(dbPath: string = resolveDbPath()): DatabaseSync {
  const parent = dirname(dbPath);

  try {
    mkdirSync(parent, { recursive: true });
  } catch (cause) {
    throw new Error(
      `Cannot create the directory ${parent} for the glossary database ${dbPath}. ` +
        `Check the write permissions, or point --db (or GLOSSARY_DB_PATH) at another location.`,
      { cause },
    );
  }

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath);
  } catch (cause) {
    throw new Error(
      `Cannot open the glossary database ${dbPath}. ` +
        `Check the write permissions, or point --db (or GLOSSARY_DB_PATH) at another location.`,
      { cause },
    );
  }

  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA);
    migrate(db);
  } catch (cause) {
    db.close();
    throw new Error(
      `Cannot open the glossary database ${dbPath} for writing. ` +
        `Check the write permissions, or point --db (or GLOSSARY_DB_PATH) at another location.`,
      { cause },
    );
  }

  logger.debug("glossary database ready", { dbPath });
  return db;
}

/** Names the origin of the resolved path. The startup log uses it. */
export function describeDbPathSource(
  env: Record<string, string | undefined> = process.env,
  argv: string[] = process.argv.slice(2),
): "argument" | "environment" | "default" {
  if (readDbFlag(argv)) {
    return "argument";
  }
  if (env.GLOSSARY_DB_PATH?.trim()) {
    return "environment";
  }
  return "default";
}
