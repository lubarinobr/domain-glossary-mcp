/**
 * Structured logging for the glossary server.
 *
 * Every line goes to stderr. The stdout stream belongs to the MCP transport,
 * so a single stray write there breaks the protocol.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function activeLevel(): LogLevel {
  const raw = (process.env.GLOSSARY_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function write(level: LogLevel, message: string, fields: object = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) {
    return;
  }
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  debug: (message: string, fields?: object) => write("debug", message, fields),
  info: (message: string, fields?: object) => write("info", message, fields),
  warn: (message: string, fields?: object) => write("warn", message, fields),
  error: (message: string, fields?: object) => write("error", message, fields),
};
