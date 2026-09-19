# Requirements - Domain Glossary MCP

## Problem

The coding agent needs the business definition of a domain term, for example
Order or Shipment, without loading a javadoc or a README into the context
window. The answer must hold 2 or 3 lines and arrive on demand.

## Functional requirements

1. The system exposes an MCP server over the stdio transport.
2. The system installs through `npm install` and exposes an executable binary.
3. The system stores the data in SQLite, in one file that several projects
   share.
4. The tool `lookup_term` takes `project` and `term` and returns the
   `description`.
5. When the term is absent, `lookup_term` creates the entry with
   `description = NULL` and reports the term as undocumented. The gap stays
   recorded.
6. The tool `save_term` takes `project`, `term` and `description` and performs
   an upsert.
7. The tool `list_missing_terms` lists the entries with `description IS NULL`.
   The `project` filter is optional.
8. The comparison of `project` and `term` ignores letter case. The system keeps
   the original spelling.
9. The system rejects input that is empty or that holds only whitespace.
10. The system rejects terms with suffixes that fall outside the domain model:
    `DTO`, `Request`, `Response`, `Mapper`, `Config`.

## Non-functional requirements

1. No native dependencies. `npm install` never compiles C++ code.
2. Structured logs on stderr. The stdout stream belongs to the MCP transport.
3. Node 22.13 or later, because `node:sqlite` needs that version to run without
   a flag.
4. Dependencies pinned to exact versions.

## Out of scope

These points stay out by explicit decision:

- An allowlist of entities in an `entities.json` file
- A CI gate for NULL entries
- Version control of the `.db` file in git
- A text file as the source of truth, with a build step for the database
- A manual seed phase for the known aggregate roots
