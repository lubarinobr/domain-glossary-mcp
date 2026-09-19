import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDatabase } from "../src/db.js";
import { createServer } from "../src/server.js";

let workDir: string;
let db: DatabaseSync;
let client: Client;

beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), "glossary-server-test-"));
  db = openDatabase(join(workDir, "glossary.db"));

  const server = createServer(db);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

afterEach(async () => {
  await client.close();
  db.close();
  rmSync(workDir, { recursive: true, force: true });
});

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

function firstText(result: ToolResult): string {
  return result.content[0]?.text ?? "";
}

test("tools/list exposes the 4 glossary tools", async () => {
  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["list_missing_terms", "lookup_term", "refresh_term", "save_term"],
  );

  const lookup = tools.find((tool) => tool.name === "lookup_term");
  assert.ok(lookup?.description?.includes("business definition"));
  assert.deepEqual(lookup?.inputSchema.required, ["project", "term"]);
});

test("lookup_term reports an unknown term as undocumented", async () => {
  const result = await call("lookup_term", {
    project: "pipeline",
    term: "Shipment",
  });

  assert.notEqual(result.isError, true);
  assert.match(firstText(result), /undocumented/i);
  assert.equal(result.structuredContent?.status, "undocumented");
});

test("save_term then lookup_term returns the definition", async () => {
  const saved = await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A customer request to produce goods.",
  });
  assert.equal(saved.structuredContent?.status, "created");

  const found = await call("lookup_term", { project: "pipeline", term: "Order" });
  assert.equal(found.structuredContent?.status, "documented");
  assert.match(firstText(found), /A customer request to produce goods\./);
});

test("lookup_term reports when a documented term was last updated", async () => {
  await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A customer request to produce goods.",
  });

  const found = await call("lookup_term", { project: "pipeline", term: "Order" });
  assert.match(firstText(found), /last updated/i);
  assert.ok(found.structuredContent?.updatedAt);
});

test("lookup_term warns when a definition is stale", async () => {
  await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A production order.",
  });
  db.prepare("UPDATE glossary SET updated_at = datetime('now', '-200 days')").run();

  const found = await call("lookup_term", { project: "pipeline", term: "Order" });
  assert.equal(found.structuredContent?.stale, true);
  assert.match(firstText(found), /stale/i);
  assert.match(firstText(found), /MAY be outdated/i);
});

test("lookup_term does not warn when a definition is fresh", async () => {
  await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A production order.",
  });

  const found = await call("lookup_term", { project: "pipeline", term: "Order" });
  assert.equal(found.structuredContent?.stale, false);
  assert.doesNotMatch(firstText(found), /stale/i);
});

test("save_term records a reference and lookup_term reports the source", async () => {
  const saved = await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A customer request to produce goods.",
    reference: "https://wiki/order",
  });
  assert.equal(saved.structuredContent?.reference, "https://wiki/order");
  assert.match(firstText(saved), /Source: https:\/\/wiki\/order/);

  const found = await call("lookup_term", { project: "pipeline", term: "Order" });
  assert.equal(found.structuredContent?.reference, "https://wiki/order");
  assert.match(firstText(found), /Source: https:\/\/wiki\/order/);
});

test("refresh_term marks a definition as current without a text change", async () => {
  await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A production order.",
  });

  const refreshed = await call("refresh_term", { project: "pipeline", term: "Order" });
  assert.notEqual(refreshed.isError, true);
  assert.match(firstText(refreshed), /current/i);

  const found = await call("lookup_term", { project: "pipeline", term: "Order" });
  assert.match(firstText(found), /A production order\./);
});

test("refresh_term on an unknown term comes back as a tool error", async () => {
  const result = await call("refresh_term", { project: "pipeline", term: "Ghost" });

  assert.equal(result.isError, true);
  assert.match(firstText(result), /no entry/i);
});

test("list_missing_terms returns the recorded gaps", async () => {
  await call("lookup_term", { project: "pipeline", term: "Shipment" });
  await call("lookup_term", { project: "billing", term: "Invoice" });
  await call("save_term", {
    project: "pipeline",
    term: "Order",
    description: "A production order.",
  });

  const all = await call("list_missing_terms", {});
  assert.equal(all.structuredContent?.count, 2);
  assert.match(firstText(all), /Shipment/);
  assert.match(firstText(all), /Invoice/);

  const filtered = await call("list_missing_terms", { project: "billing" });
  assert.equal(filtered.structuredContent?.count, 1);
});

test("list_missing_terms reports an empty glossary in plain words", async () => {
  const result = await call("list_missing_terms", {});
  assert.equal(result.structuredContent?.count, 0);
  assert.match(firstText(result), /has a definition/i);
});

test("a rejected term comes back as a tool error, not a protocol error", async () => {
  const result = await call("lookup_term", {
    project: "pipeline",
    term: "OrderDTO",
  });

  assert.equal(result.isError, true);
  assert.match(firstText(result), /domain term/i);
});

test("an empty term comes back as a tool error", async () => {
  const result = await call("save_term", {
    project: "pipeline",
    term: "   ",
    description: "Some text.",
  });

  assert.equal(result.isError, true);
  assert.match(firstText(result), /term.*empty/i);
});
