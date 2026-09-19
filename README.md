# domain-glossary-mcp

MCP server that serves the business definition of a domain term on demand. The
coding agent asks for one term and receives 2 or 3 lines, instead of loading a
javadoc or a README into the context window.

The data lives in one central SQLite file shared by every project. Each entry
has a project, a term and a description.

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

Add this entry to the client config, for example `.mcp.json` in the target
repository:

```json
{
  "mcpServers": {
    "domain-glossary": {
      "command": "npx",
      "args": ["-y", "domain-glossary-mcp", "--db", "/absolute/path/to/glossary.db"],
      "env": {}
    }
  }
}
```

For Kiro, use `.kiro/settings/mcp.json` with the same shape.

Leave out the `--db` argument to use the global glossary in the per-user data
directory.

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
{"level":"info","message":"domain-glossary MCP server ready","dbPath":"/tmp/team/glossary.db","dbPathSource":"argument"}
```

The value of `dbPathSource` is `argument`, `environment` or `default`.

## Tools

| Tool | Input | Result |
|---|---|---|
| `lookup_term` | `project`, `term` | the definition, or the term marked undocumented and the gap recorded |
| `save_term` | `project`, `term`, `description` | creates or replaces the definition |
| `list_missing_terms` | `project` (optional) | the terms that have no definition |

The comparison of `project` and `term` ignores letter case. The server keeps
the original spelling of the stored entry.

The server rejects names that end with `DTO`, `Request`, `Response`, `Mapper`
or `Config`. The glossary holds aggregate roots and entities, not transport
objects.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GLOSSARY_DB_PATH` | per-user data directory | path of the SQLite file, below `--db` in precedence |
| `GLOSSARY_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

## Command line arguments

| Argument | Purpose |
|---|---|
| `--db <path>` | path of the SQLite file. Wins over `GLOSSARY_DB_PATH`. |
| `--db-path <path>` | alias of `--db` |

Logs are JSON lines on stderr. The stdout stream belongs to the MCP transport.

## Development

```bash
npm install
npm run build
npm test
```

## Inspect the database

```bash
sqlite3 "$GLOSSARY_DB_PATH" "SELECT project, term, description FROM glossary;"
sqlite3 "$GLOSSARY_DB_PATH" "SELECT project, term FROM glossary WHERE description IS NULL;"
```
