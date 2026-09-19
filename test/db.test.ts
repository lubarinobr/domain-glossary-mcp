import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, chmodSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import envPaths from "env-paths";
import { resolveDbPath, openDatabase, describeDbPathSource } from "../src/db.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "glossary-db-test-"));
});

afterEach(() => {
  try {
    chmodSync(workDir, 0o700);
  } catch {
    // The directory may already be gone.
  }
  rmSync(workDir, { recursive: true, force: true });
});

test("resolveDbPath uses GLOSSARY_DB_PATH when it is set", () => {
  const expected = join(workDir, "custom", "glossary.db");
  assert.equal(resolveDbPath({ GLOSSARY_DB_PATH: expected }), expected);
});

test("resolveDbPath ignores GLOSSARY_DB_PATH when it is only whitespace", () => {
  const fallback = join(envPaths("domain-glossary").data, "glossary.db");
  assert.equal(resolveDbPath({ GLOSSARY_DB_PATH: "   " }), fallback);
});

test("resolveDbPath falls back to the env-paths data directory", () => {
  const expected = join(envPaths("domain-glossary").data, "glossary.db");
  assert.equal(resolveDbPath({}), expected);
});

test("openDatabase creates the parent directory and the database file", () => {
  const dbPath = join(workDir, "nested", "deeper", "glossary.db");
  const db = openDatabase(dbPath);
  try {
    assert.ok(existsSync(dbPath), "the database file must exist on disk");
  } finally {
    db.close();
  }
});

test("openDatabase applies the glossary schema", () => {
  const db = openDatabase(join(workDir, "glossary.db"));
  try {
    const columns = db.prepare("PRAGMA table_info(glossary)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    const names = columns.map((column) => column.name);
    assert.deepEqual(names, [
      "project",
      "term",
      "description",
      "reference",
      "updated_at",
    ]);

    const description = columns.find((column) => column.name === "description");
    assert.equal(description?.notnull, 0, "description must accept NULL");

    const reference = columns.find((column) => column.name === "reference");
    assert.equal(reference?.notnull, 0, "reference must accept NULL");
  } finally {
    db.close();
  }
});

test("openDatabase adds the reference column to a legacy database", () => {
  const dbPath = join(workDir, "legacy.db");

  const legacy = openDatabase(dbPath);
  legacy.exec("DROP TABLE glossary");
  legacy.exec(
    `CREATE TABLE glossary (
       project     TEXT NOT NULL COLLATE NOCASE,
       term        TEXT NOT NULL COLLATE NOCASE,
       description TEXT,
       updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (project, term)
     ) STRICT`,
  );
  legacy
    .prepare("INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)")
    .run("pipeline", "Order", "A production order.");
  legacy.close();

  const migrated = openDatabase(dbPath);
  try {
    const names = (
      migrated.prepare("PRAGMA table_info(glossary)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    assert.ok(names.includes("reference"), "the migration adds the column");

    const row = migrated
      .prepare("SELECT description, reference FROM glossary WHERE term = ?")
      .get("Order") as { description: string; reference: string | null };
    assert.equal(row.description, "A production order.", "the old row survives");
    assert.equal(row.reference, null, "the new column is NULL for old rows");
  } finally {
    migrated.close();
  }
});

test("openDatabase enables WAL journal mode", () => {
  const db = openDatabase(join(workDir, "glossary.db"));
  try {
    const row = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    assert.equal(row.journal_mode, "wal");
  } finally {
    db.close();
  }
});

test("openDatabase is idempotent and keeps existing rows", () => {
  const dbPath = join(workDir, "glossary.db");

  const first = openDatabase(dbPath);
  first
    .prepare("INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)")
    .run("pipeline", "Order", "A customer purchase request.");
  first.close();

  const second = openDatabase(dbPath);
  try {
    const row = second
      .prepare("SELECT description FROM glossary WHERE term = ?")
      .get("Order") as { description: string };
    assert.equal(row.description, "A customer purchase request.");
  } finally {
    second.close();
  }
});

test("the primary key treats project and term as case-insensitive", () => {
  const db = openDatabase(join(workDir, "glossary.db"));
  try {
    db.prepare("INSERT INTO glossary (project, term) VALUES (?, ?)").run(
      "pipeline",
      "Order",
    );
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO glossary (project, term) VALUES (?, ?)")
          .run("PIPELINE", "order"),
      /UNIQUE constraint failed|constraint/i,
    );
  } finally {
    db.close();
  }
});

test("openDatabase reports a clear error when the directory is read-only", () => {
  const readOnly = join(workDir, "locked");
  const db = openDatabase(join(readOnly, "glossary.db"));
  db.close();
  chmodSync(readOnly, 0o500);

  try {
    assert.throws(
      () => openDatabase(join(readOnly, "sub", "glossary.db")),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /cannot (create|open)/i);
        assert.match(error.message, /glossary\.db/);
        return true;
      },
    );
  } finally {
    chmodSync(readOnly, 0o700);
  }
});

test("resolveDbPath prefers the --db argument over the environment", () => {
  const fromArgs = join(workDir, "from-args", "glossary.db");
  const fromEnv = join(workDir, "from-env", "glossary.db");

  assert.equal(
    resolveDbPath({ GLOSSARY_DB_PATH: fromEnv }, ["--db", fromArgs]),
    fromArgs,
  );
});

test("resolveDbPath accepts --db=<path> in one token", () => {
  const expected = join(workDir, "inline", "glossary.db");
  assert.equal(resolveDbPath({}, [`--db=${expected}`]), expected);
});

test("resolveDbPath accepts the --db-path alias", () => {
  const expected = join(workDir, "alias", "glossary.db");
  assert.equal(resolveDbPath({}, ["--db-path", expected]), expected);
});

test("resolveDbPath expands a leading tilde in the --db argument", () => {
  const resolved = resolveDbPath({}, ["--db", "~/glossary/team.db"]);
  assert.equal(resolved, join(homedir(), "glossary", "team.db"));
});

test("resolveDbPath turns a relative --db argument into an absolute path", () => {
  const resolved = resolveDbPath({}, ["--db", "data/glossary.db"]);
  assert.equal(resolved, join(process.cwd(), "data", "glossary.db"));
});

test("resolveDbPath ignores a --db argument without a value", () => {
  const fromEnv = join(workDir, "from-env", "glossary.db");
  assert.equal(resolveDbPath({ GLOSSARY_DB_PATH: fromEnv }, ["--db"]), fromEnv);
});

test("resolveDbPath ignores an empty --db value", () => {
  const fallback = join(envPaths("domain-glossary").data, "glossary.db");
  assert.equal(resolveDbPath({}, ["--db", "   "]), fallback);
});

test("resolveDbPath falls back to env-paths when no argument and no variable exist", () => {
  const fallback = join(envPaths("domain-glossary").data, "glossary.db");
  assert.equal(resolveDbPath({}, []), fallback);
});

test("resolveDbPath expands a leading tilde in GLOSSARY_DB_PATH", () => {
  assert.equal(
    resolveDbPath({ GLOSSARY_DB_PATH: "~/glossary/team.db" }, []),
    join(homedir(), "glossary", "team.db"),
  );
});

test("describeDbPathSource names the origin of the path", () => {
  assert.equal(describeDbPathSource({}, ["--db", "/tmp/a.db"]), "argument");
  assert.equal(
    describeDbPathSource({ GLOSSARY_DB_PATH: "/tmp/b.db" }, []),
    "environment",
  );
  assert.equal(describeDbPathSource({}, []), "default");
});
