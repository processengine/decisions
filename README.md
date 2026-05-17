# @processengine/decisions

Flow 5 decision runtime for selecting an `outcome` from already prepared JSON-safe facts.

## Role

```text
facts object -> decision output
```

`@processengine/decisions` does one job: it evaluates ordered business decision cases against a facts object and returns a transport-safe runtime result.

It does not read `ProcessState`, traverse raw payload arrays, execute mappings/rules, build patch plans, route a flow, perform side effects, or call infrastructure.

## Install

```bash
npm install @processengine/decisions
```

Node.js `>=20.19.0` is required.

## Public API

```js
const {
  validateDecisions,
  prepareDecisions,
  executeDecisions,
  formatDecisionsDiagnostics,
  formatDecisionsRuntimeError,
  DecisionsCompileError,
  DecisionsRuntimeError
} = require('@processengine/decisions');
```

Canonical lifecycle:

```text
validateDecisions -> prepareDecisions -> executeDecisions
```

The old `compile/evaluate/run` API is not canonical in v2.

## Quick start

```js
const { validateDecisions, prepareDecisions, executeDecisions } = require('@processengine/decisions');

const source = {
  decisionSetId: 'decisions.validation.route',
  version: '2.0.0',
  title: 'Choose validation route',
  description: 'Selects whether processing can continue after validation.',
  cases: [
    {
      id: 'validation.has_errors',
      title: 'Has blocking errors',
      description: 'Rejects the request when validation produced at least one error.',
      when: { errorCount: { gt: 0 } },
      then: { outcome: 'REJECT_VALIDATION', reason: 'VALIDATION_ERROR' }
    }
  ],
  default: { outcome: 'CONTINUE', reason: 'VALIDATION_OK' }
};

const validation = validateDecisions(source);
if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics, null, 2));

const artifact = prepareDecisions(source);
const result = executeDecisions(artifact, { errorCount: 2 });

console.log(result.output.outcome); // REJECT_VALIDATION
```

## Source artifact

```ts
interface DecisionsDefinitionV2 {
  decisionSetId: string;
  version: string;
  title: string;
  description: string;
  cases: DecisionCaseV2[];
  default: DecisionThen;
  metadata?: JsonObject;
}
```

`cases` must be a non-empty array. The first matching case wins. If no case matches, `default` is selected.

## Conditions

Short equality form:

```json
{ "resultStatus": "SUCCESS" }
```

Operator form:

```json
{
  "errorCount": { "gt": 0 },
  "warningCount": { "eqFact": "softContactWarningCount" },
  "clientOriginKind": { "in": ["OWN_SERVICE", "SYSTEM"] },
  "optionalSignal": { "missing": true }
}
```

Supported operators:

```text
eq / neq
gt / gte / lt / lte
in / notIn
exists / missing
eqFact / neqFact
gtFact / gteFact / ltFact / lteFact
```

`exists` and `missing` check path presence, not truthiness:

```text
value null -> exists = true
value false -> exists = true
value 0 -> exists = true
absent fact -> missing = true
```

## Runtime result

```ts
interface ExecuteDecisionsResult {
  output: {
    outcome: string;
    reason?: string;
    matchedCaseId?: string;
    decisionSetId: string;
    metadata?: JsonObject;
    tags?: string[];
  };
  trace?: DecisionTraceEvent[];
}
```

The result and trace are JSON-safe / transport-safe. `metadata` fields must be JSON-safe plain objects, case ids must be unique, and scalar condition operators reject object/array facts instead of guessing. This means the result can be written by `@processengine/dataflows` into `$.context.data.decisions.*` and then read by Flow 5 `CONTROL/ROUTE` at `.outcome` without host-side cleanup.

## Trace

Trace is disabled by default. The only supported values are `'off'`, `'basic'`, and `'verbose'`. Other values are rejected with `DECISIONS_TRACE_MODE_INVALID`.

```js
executeDecisions(artifact, facts);                 // trace off by default
executeDecisions(artifact, facts, { trace: 'off' });
executeDecisions(artifact, facts, { trace: 'basic' });
executeDecisions(artifact, facts, { trace: 'verbose' });
```

`verbose` trace includes JSON-safe input/output snapshots. Invalid execution options are rejected with typed `DecisionsRuntimeError`; no raw JavaScript error is allowed to escape the public runtime boundary.

## Flow 5 interop

Typical dataflow chain:

```text
MAPPINGS kind=facts -> DECISIONS -> write $.context.data.decisions.<name>
CONTROL/ROUTE reads $.context.data.decisions.<name>.outcome
```

## Documentation

- [`docs/SPEC_RU.md`](./docs/SPEC_RU.md) — normative Russian specification.
- [`docs/MIGRATION_GUIDE.md`](./docs/MIGRATION_GUIDE.md) — migration from v1 equality engine.
- [`COMPATIBILITY.md`](./COMPATIBILITY.md) — compatibility guarantees.
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes.
