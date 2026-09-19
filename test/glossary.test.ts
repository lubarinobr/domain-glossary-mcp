import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/db.js";
import { listMissingTerms, lookupTerm, saveTerm } from "../src/glossary.js";

let workDir: string;
let db: DatabaseSync;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "glossary-test-"));
  db = openDatabase(join(workDir, "glossary.db"));
});

afterEach(() => {
  db.close();
  rmSync(workDir, { recursive: true, force: true });
});

function countRows(): number {
  const row = db.prepare("SELECT count(*) AS total FROM glossary").get() as {
    total: number;
  };
  return row.total;
}

test("lookupTerm returns the description of a documented term", () => {
  db.prepare(
    "INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)",
  ).run("pipeline", "Order", "A customer request to produce goods.");

  const result = lookupTerm(db, {
    project: "pipeline",
    term: "Order",
  });

  assert.equal(result.status, "documented");
  assert.equal(result.description, "A customer request to produce goods.");
  assert.equal(result.term, "Order");
  assert.equal(result.project, "pipeline");
});

test("lookupTerm registers a gap when the term is unknown", () => {
  const result = lookupTerm(db, { project: "pipeline", term: "Shipment" });

  assert.equal(result.status, "undocumented");
  assert.equal(result.description, null);

  const row = db
    .prepare("SELECT project, term, description FROM glossary WHERE term = ?")
    .get("Shipment") as {
    project: string;
    term: string;
    description: string | null;
  };
  assert.equal(row.project, "pipeline");
  assert.equal(row.term, "Shipment");
  assert.equal(row.description, null);
});

test("lookupTerm does not duplicate an existing gap", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });
  const second = lookupTerm(db, { project: "pipeline", term: "Shipment" });

  assert.equal(second.status, "undocumented");
  assert.equal(countRows(), 1);
});

test("lookupTerm matches the term without regard to letter case", () => {
  db.prepare(
    "INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)",
  ).run("pipeline", "Order", "A customer request to produce goods.");

  const result = lookupTerm(db, { project: "PIPELINE", term: "order" });

  assert.equal(result.status, "documented");
  assert.equal(result.description, "A customer request to produce goods.");
  assert.equal(result.term, "Order", "the stored spelling comes back");
  assert.equal(countRows(), 1);
});

test("lookupTerm keeps the same term in two projects as separate entries", () => {
  db.prepare(
    "INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)",
  ).run("pipeline", "Order", "A production order.");
  db.prepare(
    "INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)",
  ).run("billing", "Order", "A billable purchase.");

  assert.equal(
    lookupTerm(db, { project: "pipeline", term: "Order" }).description,
    "A production order.",
  );
  assert.equal(
    lookupTerm(db, { project: "billing", term: "Order" }).description,
    "A billable purchase.",
  );
});

test("lookupTerm trims the input before it searches", () => {
  db.prepare(
    "INSERT INTO glossary (project, term, description) VALUES (?, ?, ?)",
  ).run("pipeline", "Order", "A production order.");

  const result = lookupTerm(db, { project: " pipeline ", term: "  Order  " });

  assert.equal(result.status, "documented");
  assert.equal(countRows(), 1);
});

test("lookupTerm rejects an empty term and writes nothing", () => {
  assert.throws(() => lookupTerm(db, { project: "pipeline", term: "   " }), /term.*empty/i);
  assert.equal(countRows(), 0);
});

test("lookupTerm rejects an empty project", () => {
  assert.throws(() => lookupTerm(db, { project: "", term: "Order" }), /project.*empty/i);
  assert.equal(countRows(), 0);
});

test("lookupTerm rejects a name that is not a domain term", () => {
  assert.throws(
    () => lookupTerm(db, { project: "pipeline", term: "OrderResponse" }),
    /domain term/i,
  );
  assert.equal(countRows(), 0);
});

test("saveTerm stores a new term", () => {
  const result = saveTerm(db, {
    project: "pipeline",
    term: "Shipment",
    description: "A batch of goods that moves to one destination.",
  });

  assert.equal(result.status, "created");
  assert.equal(result.description, "A batch of goods that moves to one destination.");

  const row = db
    .prepare("SELECT description FROM glossary WHERE term = ?")
    .get("Shipment") as { description: string };
  assert.equal(row.description, "A batch of goods that moves to one destination.");
});

test("saveTerm fills a gap that lookupTerm created", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });

  const result = saveTerm(db, {
    project: "pipeline",
    term: "Shipment",
    description: "A batch of goods.",
  });

  assert.equal(result.status, "updated");
  assert.equal(countRows(), 1);
  assert.equal(
    lookupTerm(db, { project: "pipeline", term: "Shipment" }).status,
    "documented",
  );
});

test("saveTerm overwrites an existing description", () => {
  saveTerm(db, { project: "pipeline", term: "Order", description: "First text." });
  const result = saveTerm(db, {
    project: "pipeline",
    term: "Order",
    description: "Second text.",
  });

  assert.equal(result.status, "updated");
  assert.equal(countRows(), 1);
  assert.equal(
    lookupTerm(db, { project: "pipeline", term: "Order" }).description,
    "Second text.",
  );
});

test("saveTerm matches an existing entry without regard to letter case", () => {
  saveTerm(db, { project: "pipeline", term: "Order", description: "First text." });
  saveTerm(db, { project: "PIPELINE", term: "order", description: "Second text." });

  assert.equal(countRows(), 1);
  assert.equal(
    lookupTerm(db, { project: "pipeline", term: "Order" }).description,
    "Second text.",
  );
});

test("saveTerm moves updated_at forward", () => {
  saveTerm(db, { project: "pipeline", term: "Order", description: "First text." });
  db.prepare("UPDATE glossary SET updated_at = '2000-01-01 00:00:00'").run();

  saveTerm(db, { project: "pipeline", term: "Order", description: "Second text." });

  const row = db
    .prepare("SELECT updated_at FROM glossary WHERE term = ?")
    .get("Order") as { updated_at: string };
  assert.notEqual(row.updated_at, "2000-01-01 00:00:00");
});

test("saveTerm rejects an empty description", () => {
  assert.throws(
    () => saveTerm(db, { project: "pipeline", term: "Order", description: "  " }),
    /description.*empty/i,
  );
  assert.equal(countRows(), 0);
});

test("saveTerm rejects a name that is not a domain term", () => {
  assert.throws(
    () =>
      saveTerm(db, {
        project: "pipeline",
        term: "OrderDTO",
        description: "Some text.",
      }),
    /domain term/i,
  );
  assert.equal(countRows(), 0);
});

test("saveTerm trims every field", () => {
  saveTerm(db, {
    project: " pipeline ",
    term: " Order ",
    description: "  A production order.  ",
  });

  const row = db
    .prepare("SELECT project, term, description FROM glossary")
    .get() as { project: string; term: string; description: string };
  assert.equal(row.project, "pipeline");
  assert.equal(row.term, "Order");
  assert.equal(row.description, "A production order.");
});

test("listMissingTerms returns an empty list on a clean database", () => {
  assert.deepEqual(listMissingTerms(db, {}), []);
});

test("listMissingTerms returns only the entries without a description", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });
  lookupTerm(db, { project: "pipeline", term: "Batch" });
  saveTerm(db, { project: "pipeline", term: "Order", description: "A production order." });

  const missing = listMissingTerms(db, {});

  assert.deepEqual(
    missing.map((entry) => entry.term),
    ["Batch", "Shipment"],
  );
});

test("listMissingTerms filters by project", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });
  lookupTerm(db, { project: "billing", term: "Invoice" });

  const missing = listMissingTerms(db, { project: "billing" });

  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.term, "Invoice");
  assert.equal(missing[0]?.project, "billing");
});

test("listMissingTerms filters by project without regard to letter case", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });

  const missing = listMissingTerms(db, { project: "PIPELINE" });

  assert.equal(missing.length, 1);
});

test("listMissingTerms keeps a stable order across calls", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });
  lookupTerm(db, { project: "billing", term: "Invoice" });
  lookupTerm(db, { project: "billing", term: "Account" });

  const first = listMissingTerms(db, {});
  const second = listMissingTerms(db, {});

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((entry) => `${entry.project}.${entry.term}`),
    ["billing.Account", "billing.Invoice", "pipeline.Shipment"],
  );
});

test("listMissingTerms drops an entry after saveTerm fills it", () => {
  lookupTerm(db, { project: "pipeline", term: "Shipment" });
  lookupTerm(db, { project: "pipeline", term: "Batch" });
  lookupTerm(db, { project: "pipeline", term: "Lot" });
  saveTerm(db, { project: "pipeline", term: "Batch", description: "A group of lots." });

  assert.deepEqual(
    listMissingTerms(db, {}).map((entry) => entry.term),
    ["Lot", "Shipment"],
  );
});

test("listMissingTerms rejects an empty project filter", () => {
  assert.throws(() => listMissingTerms(db, { project: "   " }), /project.*empty/i);
});
