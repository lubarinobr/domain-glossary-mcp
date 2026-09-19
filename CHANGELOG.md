# Changelog

All notable changes to this project appear in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-09-19

### Changed

- The server checkpoints the WAL after every write, so `glossary.db` holds each
  new row at once. A separate reader, such as a `git` commit, sees the row
  without a disconnect or a manual `PRAGMA wal_checkpoint`.

## [0.2.0] - 2026-09-19

### Added

- `refresh_term` tool. It moves the update time to now and keeps the text, for
  a definition that the dev confirms is still correct.
- A `reference` column that records the source of a description, for example a
  URL, `user` or `agent`. `save_term` accepts an optional `reference`, and
  `lookup_term` reports the source.
- Staleness signal on `lookup_term`. The result carries `ageDays`, `stale` and
  `staleAfterDays`, so the agent reads a flag instead of the raw date. A stale
  definition also gets a warning in the text.
- A configurable staleness threshold. Set `--stale-days <n>` in the config
  `args`, or `GLOSSARY_STALE_DAYS` in the `env`. The default is 180 days.
- The startup log reports `staleAfterDays` and `staleAfterDaysSource`.

### Changed

- A clean shutdown checkpoints the WAL and removes the `-wal` and `-shm` side
  files, so only `glossary.db` remains.
- `save_term` moves the update time forward on every write.

### Fixed

- An older database gains the `reference` column through a migration, so an
  upgrade keeps the existing rows.

## [0.1.0]

### Added

- Initial release. The `lookup_term`, `save_term` and `list_missing_terms`
  tools, a central SQLite store, gap tracking for undocumented terms, and a
  configurable database path.

[0.2.1]: https://github.com/lubarinobr/domain-glossary-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/lubarinobr/domain-glossary-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lubarinobr/domain-glossary-mcp/releases/tag/v0.1.0
