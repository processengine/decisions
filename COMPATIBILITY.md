# Compatibility policy

## Public API

The public API consists of:

- `compile(definition)`
- `evaluate(compiled, entrypointId, facts, options?)`
- `run(definition, entrypointId, facts, options?)`
- `CompilationError`
- exported TypeScript types
- schema subpath `@processengine/decisions/schema`

## Breaking changes

The following require a major version bump:

- shape of `DecisionResult`
- runtime error codes or phases
- compile diagnostic shape or codes
- trace shape or ordering
- compile-first contract
- semantics of `first_match_wins`
- exported TypeScript API
- schema shape and field semantics

## Internal implementation

The internal file layout, helper names, and algorithmic details are not public API.

## Notes on compilation errors

When `compile()` throws `CompilationError`, `error.diagnostics` contains the full collected diagnostics, including warnings accumulated before the throwing error set was finalized.
