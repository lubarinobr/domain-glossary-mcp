# domain-glossary-mcp

MCP server that serves the business definition of a domain term on demand. The
coding agent asks for one term and receives 2 or 3 lines, instead of loading a
javadoc or a README into the context window.

The data lives in one central SQLite file shared by every project. Each entry
has a project, a term, a description, an optional reference to the source and
the time of the last update.

## How the gap tracking works

When the agent asks for a term that has no definition, the server creates the
entry with `description = NULL` and reports the term as undocumented. The gap
stays recorded, so `list_missing_terms` shows what the team still needs to
write.

## Requirements

Node 22.13 or later. The server uses the built-in `node:sqlite` module, so
`npm install` never compiles native code.

## Install

From a private registry:

```bash
npm install domain-glossary-mcp
```

From a git repository:

```bash
npm install git+ssh://git@your-host/your-org/domain-glossary-mcp.git
```

The package exposes the `domain-glossary-mcp` binary.

## Register in an MCP client

Add an entry to the client config, for example `.mcp.json` in the target
repository. For Kiro, use `.kiro/settings/mcp.json` with the same shape.

Only `command` and `args` are required. Every parameter below is optional and
has a default, so the shortest config runs the server against the global
glossary:

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

This full config sets every parameter. Use it as a template, then remove the
lines you do not need:

```json
{
  "mcpServers": {
    "domain-glossary": {
      "command": "npx",
      "args": [
        "-y",
        "domain-glossary-mcp",
        "--db", "/absolute/path/to/glossary.db",
        "--stale-days", "180"
      ],
      "env": {
        "GLOSSARY_DB_PATH": "/absolute/path/to/glossary.db",
        "GLOSSARY_STALE_DAYS": "180",
        "GLOSSARY_LOG_LEVEL": "info"
      },
      "disabled": false,
      "autoApprove": ["lookup_term", "list_missing_terms"]
    }
  }
}
```

### Parameters

| Parameter | Required | Default | Purpose |
|---|---|---|---|
| `command` | yes | — | the runner, for example `npx` or `node` |
| `args` | yes | — | the package name plus the flags below |
| `--db <path>` | no | per-user data directory | path of the SQLite file |
| `--stale-days <n>` | no | `180` | age in days before `lookup_term` marks a definition stale |
| `GLOSSARY_DB_PATH` | no | per-user data directory | path of the SQLite file, below `--db` in precedence |
| `GLOSSARY_STALE_DAYS` | no | `180` | staleness threshold, below `--stale-days` in precedence |
| `GLOSSARY_LOG_LEVEL` | no | `info` | `debug`, `info`, `warn` or `error` |
| `disabled` | no | `false` | turns the server off without removing the entry |
| `autoApprove` | no | `[]` | tool names the client runs without a prompt |

A flag wins over the matching environment variable. Set the path or the
threshold once, in the `args` or in the `env`, not in both.

Keep `save_term` and `refresh_term` out of `autoApprove`. A write to a shared
glossary deserves one confirmation.

Leave out `--db` to use the global glossary in the per-user data directory.

## Database location

The server resolves the path in this order:

1. The `--db <path>` argument in the `args` array
2. `GLOSSARY_DB_PATH` in the `env` block
3. The per-user data directory, the global glossary:
   - macOS: `~/Library/Application Support/domain-glossary-nodejs/glossary.db`
   - Linux: `$XDG_DATA_HOME/domain-glossary-nodejs/glossary.db` or
     `~/.local/share/domain-glossary-nodejs/glossary.db`
   - Windows: `%LOCALAPPDATA%\domain-glossary-nodejs\Data\glossary.db`

The server creates the directory when it is absent and enables WAL mode. Never
point the path inside `node_modules`, because npm deletes that content on each
reinstall.

The `--db-path` spelling works as an alias of `--db`, and `--db=<path>` in one
token works too. A leading `~` becomes the home directory, and a relative path
becomes absolute against the working directory. A JSON config cannot rely on
shell expansion, so the server does it.

The startup log line reports the chosen path and its origin:

```json
{"level":"info","message":"domain-glossary MCP server ready","dbPath":"/tmp/team/glossary.db","dbPathSource":"argument","staleAfterDays":180,"staleAfterDaysSource":"default"}
```

The value of `dbPathSource` is `argument`, `environment` or `default`. The
`staleAfterDays` field reports the threshold, and `staleAfterDaysSource`
reports its origin with the same 3 values.

### WAL files and version control

WAL mode is active. While the server runs, a `glossary.db-wal` and a
`glossary.db-shm` file sit next to `glossary.db`. The server checkpoints the
WAL after every write, so `glossary.db` holds each new row at once. A separate
reader, such as a `git` commit, sees the row without a wait; there is no need
to disconnect the server or run a manual `PRAGMA wal_checkpoint`. A clean
shutdown also empties the side files, so only `glossary.db` remains. A crash
may leave the side files in place; the next start reads the data from them, so
no data is lost.

Do not commit any of the 3 files when the path sits inside a repository. The
`-wal` and the `-shm` files are transient. The `.db` file is a live database,
and a commit of it causes merge conflicts and races between writers. Add these
lines to the `.gitignore` of the consuming repository:

```gitignore
*.db
*.db-wal
*.db-shm
```

The simplest way to avoid this is to keep the database out of the repository:
leave `--db` unset to use the per-user data directory, or point it at a path
outside the working tree.

## Tools

| Tool | Input | Result |
|---|---|---|
| `lookup_term` | `project`, `term` | the definition, its age and a `stale` flag, or the term marked undocumented and the gap recorded |
| `save_term` | `project`, `term`, `description`, `reference` (optional) | creates or replaces the definition, records the source and sets the update time to now |
| `refresh_term` | `project`, `term` | moves the update time to now, keeps the text |
| `list_missing_terms` | `project` (optional) | the terms that have no definition |

The optional `reference` on `save_term` records where a definition came from: a
URL, `user` when a person gave it, or `agent` when the model wrote it from the
code. `lookup_term` reports the source on a later read.

The comparison of `project` and `term` ignores letter case. The server keeps
the original spelling of the stored entry.

The server rejects names that end with `DTO`, `Request`, `Response`, `Mapper`
or `Config`. The glossary holds aggregate roots and entities, not transport
objects.

## Staleness

The server judges whether a definition is old, so the agent does not do the
date math. `lookup_term` returns 3 extra fields on a documented term:

- `ageDays`: the age of the definition in whole days.
- `stale`: `true` when the age reaches the threshold, `false` otherwise.
- `staleAfterDays`: the threshold in effect.

When `stale` is `true`, the text of the result carries a warning that the
definition may be outdated and suggests the next step: confirm with the dev,
then `save_term` for a change or `refresh_term` to mark it current.

The threshold is 180 days (about 6 months) by default. Set `--stale-days <n>`
in the `args`, or `GLOSSARY_STALE_DAYS` in the `env`, to change it. A value
that is not a positive integer falls through to the next source, so a typo
keeps the default.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GLOSSARY_DB_PATH` | per-user data directory | path of the SQLite file, below `--db` in precedence |
| `GLOSSARY_STALE_DAYS` | `180` | staleness threshold in days, below `--stale-days` in precedence |
| `GLOSSARY_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

## Command line arguments

| Argument | Default | Purpose |
|---|---|---|
| `--db <path>` | per-user data directory | path of the SQLite file. Wins over `GLOSSARY_DB_PATH`. |
| `--db-path <path>` | — | alias of `--db` |
| `--stale-days <n>` | `180` | staleness threshold in days. Wins over `GLOSSARY_STALE_DAYS`. |

Logs are JSON lines on stderr. The stdout stream belongs to the MCP transport.

## Agent skills

The `skills/` folder holds 2 skills for coding agents:

- `domain-glossary-mcp` explains how to connect the server and use the tools
- `domain-glossary-mcp-dev` explains the conventions of this codebase

Copy the folder you need into `<repo>/.kiro/skills/` or `~/.kiro/skills/`. See
`skills/README.md`.

## Development

```bash
npm install
npm run build
npm test
```

## Inspect the database

```bash
sqlite3 "$GLOSSARY_DB_PATH" "SELECT project, term, description, reference, updated_at FROM glossary;"
sqlite3 "$GLOSSARY_DB_PATH" "SELECT project, term FROM glossary WHERE description IS NULL;"
```
