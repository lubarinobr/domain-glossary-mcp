---
name: domain-glossary-mcp-dev
description: Conventions and traps of the domain-glossary-mcp codebase itself. Use when you write, modify, test or release code in this repository, not when you only consume the glossary tools.
---

## Scope

This skill covers work inside the `domain-glossary-mcp` repository. To connect
and use the server, read the `domain-glossary-mcp` skill instead.

## Layout

```
src/
  index.ts       bin entry, stdio transport, SIGINT and SIGTERM
  server.ts      McpServer and the 3 tool registrations
  db.ts          path resolution, connection, WAL, schema
  glossary.ts    lookupTerm, saveTerm, listMissingTerms
  validation.ts  trim and the rejected suffixes
  logger.ts      JSON lines on stderr
test/            one file per module, plus smoke.test.ts
```

Every function in `glossary.ts` takes the database connection as its first
parameter. No module holds a global connection. Each test therefore opens its
own file in a temporary directory, which keeps the suite free of shared state.

## Commands

```bash
npm install
npm run build    # tsc
npm test         # builds first, then runs the compiled tests
```

The tests run against the compiled output in `dist/test`, not against the
TypeScript sources.

## Traps

These cost time if you meet them without warning.

- **`node --test <dir>` fails on Node 22.** The runner treats the directory as a
  module and reports `MODULE_NOT_FOUND`. The `test` script therefore uses the
  glob `"dist/test/**/*.test.js"`. Keep the quotes, so Node expands the pattern
  and not the shell.
- **`node:sqlite` returns objects with a null prototype.** `assert.deepEqual`
  against a plain object literal fails on the prototype alone. Read the value
  with `.get()` and compare the fields, or cast through a typed interface.
- **Imports carry the `.js` extension**, even from a `.ts` file. The package is
  ESM with `moduleResolution: nodenext`, so `./db.js` is correct and `./db` is
  not.
- **A file permission test must restore the mode.** A directory left at `0o500`
  breaks the `rmSync` in `afterEach` with `EACCES`. Restore the mode in a
  `finally` block.
- **`node:sqlite` prints an experimental warning to stderr.** That is expected
  and harmless, because stderr carries the logs and stdout carries the
  transport.

## Rules that the design depends on

- **Nothing writes to stdout.** The MCP transport owns that stream. Use
  `logger` from `logger.ts`, which writes JSON lines to stderr. A single
  `console.log` breaks the protocol.
- **Case-insensitive matching lives in the schema.** The key columns carry
  `COLLATE NOCASE`, so the primary key treats `Order` and `order` as one row.
  Do not add a normalization step in code; it would duplicate the rule and the
  two copies would drift.
- **A tool returns a tool error, never a thrown error.** The `guard` helper in
  `server.ts` catches a validation failure and returns `isError: true` with the
  message. A thrown error reaches the client as a protocol error, which gives
  the agent nothing to correct.
- **A lookup of an unknown term writes a NULL row.** This is the product
  behaviour, not a side effect to clean up. Any change here changes the feature.
- **Dependencies stay pinned to exact versions**, and the runtime stays free of
  native addons. `node:sqlite` is built in, so `npm install` never compiles.

## Add a tool

1. Write the failing tests in `test/glossary.test.ts` for the pure function.
2. Implement the function in `glossary.ts`, with the connection as the first
   parameter.
3. Register the tool in `server.ts` with a zod `inputSchema`, and wrap the body
   in `guard`.
4. Add an integration test in `test/server.test.ts`, which drives the real
   server over `InMemoryTransport`.
5. Write the tool `description` for the agent, not for a human reader. State
   when to call the tool and what not to pass.

## Release

```bash
npm version patch      # or minor, major
git push --follow-tags
npm publish            # prepublishOnly runs the full test suite
```

The `files` array ships `dist/src`, the README and the LICENSE. The `bin` entry
points at `dist/src/index.js`, which keeps the shebang through the build.

Verify a release candidate without publishing:

```bash
npm pack
mkdir /tmp/probe && cd /tmp/probe && npm init -y
npm install /path/to/domain-glossary-mcp-<version>.tgz
./node_modules/.bin/domain-glossary-mcp --db /tmp/probe/g.db
```
