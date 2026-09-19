---
name: domain-glossary-mcp
description: How to connect and use the domain-glossary MCP server, which serves business definitions of domain terms from a SQLite file. Use when a repository needs the glossary server registered, when the glossary tools return errors, or when you must look up or record the meaning of a domain term such as Order or Shipment.
---

## Overview

`domain-glossary-mcp` is a stdio MCP server. It answers one question: what does
this domain term mean in this project? The answer is 2 or 3 lines, so the agent
never loads a javadoc or a README into the context window.

The data lives in a SQLite file. Each row has a project, a term and a
description.

Repository: <https://github.com/lubarinobr/domain-glossary-mcp>

## The gap tracking contract

This is the part that surprises people. When `lookup_term` receives a term with
no definition, the server does not only answer "unknown". It creates the row
with `description = NULL` and reports the term as undocumented.

That NULL is the record of the gap. `list_missing_terms` reads those rows, so
the team can see what still needs a definition. A lookup is therefore a write
operation.

## Install

Node 22.13 or later is mandatory. The server uses the built-in `node:sqlite`
module, so `npm install` never compiles native code.

```bash
npm install domain-glossary-mcp
```

From git, while the package is unpublished:

```bash
npm install git+https://github.com/lubarinobr/domain-glossary-mcp.git
```

For local development, run `npm link` in the package directory, or point the
config at `dist/src/index.js` with an absolute path.

## Register in Kiro

Two scopes exist. Prefer the workspace scope, because the glossary belongs to
the repository that uses it.

- Workspace: `<repo>/.kiro/settings/mcp.json`
- Global: `~/.kiro/settings/mcp.json`

Kiro merges the configs. The workspace entry wins over the global entry.

```json
{
  "mcpServers": {
    "domain-glossary": {
      "command": "npx",
      "args": [
        "-y",
        "domain-glossary-mcp",
        "--db",
        "/absolute/path/to/glossary.db"
      ],
      "disabled": false,
      "autoApprove": ["lookup_term", "list_missing_terms"]
    }
  }
}
```

The `--db` argument selects the database for that server entry. Leave it out to
use the global glossary in the per-user data directory:

```json
{
  "mcpServers": {
    "domain-glossary": {
      "command": "npx",
      "args": ["-y", "domain-glossary-mcp"]
    }
  }
}
```

A per-repository database and a shared one are therefore a config choice, not a
code change. Point the workspace config at a local file when the domain is
private to that repository. Leave the argument out when the team shares one
glossary across repositories.

During development, replace `command` and `args` with the built entry point:

```json
{
  "mcpServers": {
    "domain-glossary": {
      "command": "node",
      "args": [
        "/absolute/path/to/domain-glossary-mcp/dist/src/index.js",
        "--db",
        "/absolute/path/to/local.db"
      ]
    }
  }
}
```

Run `npm run build` first. The config points at compiled output, not at
TypeScript.

Keep `save_term` out of `autoApprove`. A write to a shared glossary deserves
one confirmation.

After a config change, reconnect the server from the MCP Server view in the
Kiro feature panel. A restart of the IDE is not necessary.

## Other MCP clients

The server speaks plain stdio, so any client works. Claude Code uses `.mcp.json`
at the repository root with the same shape.

## Database location

The server resolves the path in this order:

1. `--db <path>` in the `args` array of the config
2. `GLOSSARY_DB_PATH` in the `env` block of the config
3. The per-user data directory from `env-paths`, the global glossary:
   - macOS: `~/Library/Application Support/domain-glossary-nodejs/glossary.db`
   - Linux: `$XDG_DATA_HOME/domain-glossary-nodejs/glossary.db` or
     `~/.local/share/domain-glossary-nodejs/glossary.db`
   - Windows: `%LOCALAPPDATA%\domain-glossary-nodejs\Data\glossary.db`

Prefer `--db` over the environment variable. The argument sits next to the
command in the config, so the choice of database is visible in one place. Use
`GLOSSARY_DB_PATH` when a wrapper script or a CI job supplies the path.

`--db-path` is an alias of `--db`, and `--db=<path>` in one token works too. A
leading `~` becomes the home directory, and a relative path becomes absolute
against the working directory, because a JSON config cannot rely on shell
expansion.

The startup log reports the choice, which settles any doubt about precedence:

```json
{"level":"info","message":"domain-glossary MCP server ready","dbPath":"/tmp/team/glossary.db","dbPathSource":"argument"}
```

The value of `dbPathSource` is `argument`, `environment` or `default`.

Never point the path inside `node_modules`. npm deletes that content on each
reinstall.

WAL mode is active, so the directory also holds `glossary.db-wal` and
`glossary.db-shm`. Add `*.db-wal` and `*.db-shm` to `.gitignore` if the path
sits inside a repository.

## Tools

| Tool | Input | Result |
|---|---|---|
| `lookup_term` | `project`, `term` | the definition, or the term marked undocumented and the gap recorded |
| `save_term` | `project`, `term`, `description` | creates or replaces the definition |
| `list_missing_terms` | `project` (optional) | the terms that have no definition |

`project` is the name of the repository, for example
`production-data-pipeline`. `term` is the name of the class.

## How to use the tools

Call `lookup_term` before you read the source of a domain class. The glossary
gives the business meaning; the code gives the structure.

Call it only for aggregate roots and entities, for example `Order`, `Shipment`
or `Invoice`. The server rejects names that end with `DTO`, `Request`,
`Response`, `Mapper` or `Config`. The glossary holds domain terms, not
transport objects.

When `lookup_term` reports an undocumented term, do not invent a definition.
Follow the steps in "When the term is not found" below. Ask the dev first, and
get a confirmation before you call `save_term`. If the meaning stays unclear,
leave the NULL in place. The gap is more useful than a wrong definition.

Keep every description to 2 or 3 lines. Describe the business meaning, not the
fields or the class hierarchy.

## When the term is not found

Follow these steps when `lookup_term` reports an undocumented term. Do one step
at a time.

1. Tell the dev that the glossary has no definition for the term.
2. Ask the dev if you must add the term now.
3. Read the answer:
   - If the answer agrees (for example "yes", "sure", "go ahead", "please do"),
     go to step 4.
   - If the answer refuses, stop. Keep the NULL in place. The gap stays useful.
4. Get the description:
   - If you know the business meaning from the code or the context, write a
     draft of 2 or 3 lines.
   - If the meaning is not clear, ask the dev for the description. Do not
     invent a definition.
5. Write the description in Simplified Technical English (ASD-STE100):
   - Use short sentences. Keep each sentence to 20 words or less.
   - Use active voice and simple verb tenses.
   - Use one idea per sentence.
   - Use approved, common words. Describe the business meaning, not the fields.
6. Show the draft description to the dev. Ask the dev to confirm the text.
7. Read the answer:
   - If the dev confirms, call `save_term` with the project, the term and the
     confirmed description.
   - If the dev asks for a change, edit the draft and go back to step 6.

Do not call `save_term` before the dev confirms the text. The write goes to a
shared glossary, so it needs one clear confirmation.

## Behaviour to expect

- The comparison of `project` and `term` ignores letter case. `Order` and
  `order` reach the same row. The server returns the stored spelling.
- The same term in 2 projects gives 2 independent rows.
- `save_term` is an upsert. A second call replaces the text and moves
  `updated_at` forward.
- Every field is trimmed before use.
- A validation failure comes back as a tool error with a readable message, not
  as a protocol error. Read the message and correct the input.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The server does not start | Node is older than 22.13. Check with `node --version`. |
| "Cannot create the directory ..." | The parent directory of the database is read-only. Choose another path. |
| "... is not a domain term" | The name ends with a rejected suffix. Use the aggregate root name. |
| "The term must not be empty." | The argument is empty or holds only whitespace. |
| The glossary looks empty | The server reads a different file than you expect. Read `dbPath` and `dbPathSource` in the startup log. A `--db` argument overrides `GLOSSARY_DB_PATH`. |
| The `--db` path is ignored | The flag carries no value, for example `["--db"]` with the path in the next entry missing. The server then falls back to the variable or the default. |
| The client reports a protocol error | Something writes to stdout. Only the transport may use stdout; logs go to stderr. |

Set `GLOSSARY_LOG_LEVEL=debug` in the `env` block for more detail. Logs are
JSON lines on stderr.

## Inspect the database directly

```bash
sqlite3 /absolute/path/to/glossary.db "SELECT project, term, description FROM glossary;"
sqlite3 /absolute/path/to/glossary.db "SELECT project, term FROM glossary WHERE description IS NULL;"
```

The second query lists the gaps. Use it in a review, or in a CI step, to keep
the pending definitions visible.

## Verify the connection by hand

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y domain-glossary-mcp --db /tmp/glossary-probe/glossary.db
```

The response must list the 3 tools. Delete `/tmp/glossary-probe` afterwards.
