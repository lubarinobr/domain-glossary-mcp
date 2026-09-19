import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

test("the test runner works", () => {
  assert.equal(1 + 1, 2);
});

test("node:sqlite is available in this runtime", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY) STRICT");
  const row = db.prepare("SELECT count(*) AS total FROM probe").get() as {
    total: number;
  };
  assert.equal(row.total, 0);
  db.close();
});
