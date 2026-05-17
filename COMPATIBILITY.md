# Compatibility

## Runtime

`@processengine/decisions` v2 requires Node.js `>=20.19.0`.

## API compatibility

The canonical v2 API is:

```text
validateDecisions
prepareDecisions
executeDecisions
formatDecisionsDiagnostics
formatDecisionsRuntimeError
```

The v1 `compile/evaluate/run` API is not part of the v2 canonical contract.

## Source compatibility

v2 source artifacts use:

```text
decisionSetId
version
title
description
cases
default
```

v1 `definition.artifacts`, `decision-rule`, `decision-set`, `defaultDecision`, `patchPlanFrom`, `then.decision` and the rejected interim `rules` field are incompatible with v2.

## Prepared artifact compatibility

Prepared artifacts are runtime-ready and immutable by public contract. Consumers must not manually construct them or depend on internal compiled case shape.

## Runtime result compatibility

`ExecuteDecisionsResult` is JSON-safe / transport-safe and has canonical shape:

```ts
{ output: { outcome, decisionSetId, matchedCaseId?, reason?, metadata?, tags? }, trace? }
```

This result can be passed through `@processengine/dataflows` without host-side cleanup.

## Trace compatibility

Trace is optional and disabled by default. When returned, it is JSON-safe / transport-safe. Trace shape is public, but additional JSON-safe `details` fields may be added in minor releases.

`executeDecisions` supports only `trace?: 'off' | 'basic' | 'verbose'`. Boolean aliases such as `false` are not supported and are rejected with `DECISIONS_TRACE_MODE_INVALID`.

## Runtime boundary compatibility

Public runtime failures are surfaced as typed `DecisionsRuntimeError` instances with stable machine-readable codes. Malformed prepared artifacts, malformed facts, invalid runtime options and trace serialization failures must not leak raw `TypeError`, `RangeError`, `SyntaxError` or other built-in JavaScript errors from the public API.
