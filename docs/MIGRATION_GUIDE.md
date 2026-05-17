# Migration guide: decisions v1 equality engine -> decisions v2 Flow 5 model

## Summary

v2 is not a compatibility update over v1. It is the Flow 5 decision runtime.

Old model:

```text
compile(definition)
evaluate(compiled, entrypointId, facts)
run(...)
definition.artifacts
decision-rule / decision-set
then.decision
```

New model:

```text
validateDecisions(source)
prepareDecisions(source)
executeDecisions(artifact, facts)
source.cases
then.outcome
```

## Source conversion

### v1

```json
{
  "artifacts": [
    {
      "id": "validation.has_errors",
      "type": "decision-rule",
      "description": "Has errors",
      "when": { "hasErrors": true },
      "then": { "decision": "REJECT", "reason": "VALIDATION_ERROR" }
    },
    {
      "id": "validation.route",
      "type": "decision-set",
      "version": "1.0.0",
      "description": "Validation route",
      "rules": ["validation.has_errors"],
      "defaultDecision": { "decision": "CONTINUE" }
    }
  ]
}
```

### v2

```json
{
  "decisionSetId": "validation.route",
  "version": "2.0.0",
  "title": "Выбрать маршрут после валидации",
  "description": "Определяет дальнейший ход процесса по фактам валидации.",
  "cases": [
    {
      "id": "validation.has_errors",
      "title": "Есть блокирующие ошибки",
      "description": "Отклоняет заявку, если есть ошибки.",
      "when": { "errorCount": { "gt": 0 } },
      "then": { "outcome": "REJECT", "reason": "VALIDATION_ERROR" }
    }
  ],
  "default": { "outcome": "CONTINUE" }
}
```

## Recommended rewrites

```text
hasErrors: true -> errorCount: { gt: 0 }
hasWarnings: true -> warningCount: { gt: 0 }
hasMultipleClientCandidates: true -> clientMatchCount: { gte: 2 }
hasCriticalMismatches: true -> criticalMismatchCount: { gt: 0 }
hasPatchableEmptyFields: true -> patchableEmptyFieldCount: { gt: 0 }
allWarningsAreSoft -> warningCount > 0 AND softContactWarningCount == warningCount
```

Keep `has*` boolean facts only when they are stable semantic facts, not duplicates of count comparisons.

## Removed concepts

```text
artifacts
entrypointId
decision-rule / decision-set artifact types
then.decision
patchPlanFrom / patchPlan
requiredFacts
missingFactPolicy
strict default abort
MATCHED / DEFAULTED / ABORT result statuses
```

## Runtime caller migration

```js
// v1
const compiled = compile(definition);
const result = evaluate(compiled, 'route.main', facts);

// v2
const validation = validateDecisions(source);
if (!validation.ok) throw new Error(formatDecisionsDiagnostics(validation.diagnostics));
const artifact = prepareDecisions(source);
const result = executeDecisions(artifact, facts);
```

## Flow 5 interop

Write `result.output` to `$.context.data.decisions.<name>` and route by:

```text
$.context.data.decisions.<name>.outcome
```
