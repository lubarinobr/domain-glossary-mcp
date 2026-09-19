# Tasks - Domain Glossary MCP

Implement with TDD. Run the tests after each task.

- [x] 1. Create the npm package skeleton
  - `package.json` with `bin`, `files` and `engines: node >= 22.13`
  - Dependencies pinned to exact versions: `@modelcontextprotocol/sdk`,
    `env-paths`
  - TypeScript with a `tsconfig.json`, a modern target and output in `dist/`
  - The `node:test` runner through `node --test`
  - One trivial test that passes, to prove the runner works
  - _Demo: `npm run build && npm test` green_

- [x] 2. Implement the SQLite access layer
  - `db.ts` resolves the path, creates the directory, enables WAL and applies
    the schema
  - Repeated calls are safe
  - _Tests: resolves `GLOSSARY_DB_PATH`; falls back to `env-paths`; creates the
    schema in a temporary path; a second call does not fail; a clear error when
    the directory denies write access_
  - _Demo: point `GLOSSARY_DB_PATH` at `/tmp` and read the created table_

- [x] 3. Implement `lookup_term`
  - The query, with the creation of the NULL placeholder
  - _Tests: a documented term returns the text; an unknown term returns
    "undocumented" and writes the NULL row; a row that is already NULL does not
    duplicate; `Order` and `order` reach the same entry; the same term in 2
    projects gives 2 independent entries; an empty name is rejected_
  - _Demo: call the function and read the NULL row in SQLite_

- [x] 4. Implement `save_term`
  - An upsert that fills a NULL entry or replaces an existing one
  - Moves `updated_at` forward
  - _Tests: stores a new term; fills the NULL placeholder; replaces an existing
    description; `updated_at` changes; an empty description is rejected_
  - _Demo: lookup returns "undocumented", then save, then lookup returns the
    definition_

- [x] 5. Implement `list_missing_terms`
  - Lists the entries with `description IS NULL`, with an optional project
    filter
  - _Tests: an empty list on a clean database; only the NULL rows appear; the
    project filter works; the order stays stable_
  - _Demo: create 3 gaps, fill 1, list the remaining 2_

- [x] 6. Wire everything into the MCP server
  - Register the 3 tools in the SDK with their input schemas
  - The stdio transport, with logs on stderr
  - The tool descriptions steer the agent toward domain terms only
  - _Test: an integration test with `tools/list` and one `tools/call` per tool_
  - _Demo: `npx domain-glossary-mcp` with a manual `tools/call`_

- [x] 7. Document the install and the registration
  - A README with `npm install` and the entry for `.mcp.json`
  - A `.gitignore` with `*.db`, `*.db-wal` and `*.db-shm`
  - _Demo: in the real repository, the agent reads the glossary and records the
    gap_
  - _Open: the check in the real repository stays open. The
    `production-data-pipeline` repository does not sit on this disk._

## Later additions

These changes arrived after the 7 tasks above.

- [x] 8. Accept the database path as a command line argument
  - `--db <path>`, with `--db-path` as an alias and `--db=<path>` in one token
  - The argument wins over `GLOSSARY_DB_PATH`, which wins over the per-user
    default
  - Expand a leading `~`, and turn a relative path into an absolute one
  - Report `dbPath` and `dbPathSource` in the startup log
  - _Tests: 10 cases on the precedence, the aliases, the expansion and the
    flag without a value_
  - _Demo: pass `--db` and `GLOSSARY_DB_PATH` together; the server opens the
    file from the argument_

- [x] 9. Prepare the package for the npm registry
  - Remove `private`, add `author`, `repository`, `homepage`, `bugs` and a
    `LICENSE` file
  - `prepublishOnly` runs the whole test suite
  - _Demo: `npm pack`, install the tarball in a temporary project and call
    `tools/list` through the installed binary_

- [x] 10. Ship the agent skills with the repository
  - `skills/domain-glossary-mcp` for anyone who uses the server
  - `skills/domain-glossary-mcp-dev` for anyone who changes this codebase
  - _Demo: copy a skill folder into `.kiro/skills/` and open a new session_
