# Changelog

## 1.0.0 - 2026-04-04

First public release of `@processengine/decisions`.

- full rename from historical `jsondecisions`
- compile-first public contract
- immutable compiled artifact
- structured compile diagnostics and runtime errors
- strict DSL with schema and unknown-field rejection
- hostile-input protections for dangerous keys, cycles, and non-JSON-safe values
- stable trace contract
- contract, determinism, and hostile-input tests

- compile(definition) now requires the normative wrapper object `{ artifacts: [...] }`
