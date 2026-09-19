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

test("tools/list exposes the 3 glossary tools", async () => {
  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["list_missing_terms", "lookup_term", "save_term"],
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
