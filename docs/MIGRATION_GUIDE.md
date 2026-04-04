# Migration guide

## From jsondecisions to @processengine/decisions

The first ProcessEngine release does not inherit the old package identity.

Main differences:

- package name is now `@processengine/decisions`
- compile-first contract is explicit and normative
- top-level input is `compile({ artifacts })`
- breaking change relative to the temporary 1.0.0 draft: `compile([...])` is no longer accepted; wrap artifacts into `{ artifacts: [...] }`
- runtime returns structured `MATCHED`, `DEFAULTED`, or `ABORT`
- diagnostics are structured and machine-readable
- DSL is strict and rejects unknown fields

## Recommended migration steps

1. validate old decision files against the new schema
2. run compile-time validation and inspect diagnostics
3. re-check rule refs and path safety
4. re-run contract tests for your decision catalog

## Rule for future updates

When updating across minor or major releases, revalidate decision definitions with both schema validation and `compile()`.
