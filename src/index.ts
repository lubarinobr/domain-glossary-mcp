#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  describeDbPathSource,
  describeStaleAfterDaysSource,
  openDatabase,
  resolveDbPath,
  resolveStaleAfterDays,
} from "./db.js";
import { createServer } from "./server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  const dbPathSource = describeDbPathSource();
  const staleAfterDays = resolveStaleAfterDays();
  const staleAfterDaysSource = describeStaleAfterDaysSource();
  const db = openDatabase(dbPath);
  const server = createServer(db, { staleAfterDays });

  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await server.connect(new StdioServerTransport());
  logger.info("domain-glossary MCP server ready", {
    dbPath,
    dbPathSource,
    staleAfterDays,
    staleAfterDaysSource,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("domain-glossary MCP server failed to start", { message });
  process.exit(1);
});
