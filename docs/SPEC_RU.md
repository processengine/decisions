# SPEC: `@processengine/decisions` v2

Status: draft for implementation  
Target: Flow 5 / `PROCESS/DATA` / `@processengine/dataflows` v1

---

## 1. Что нормативно определяется этим документом

Этот документ нормативно определяет `@processengine/decisions` v2 как Flow 5 decision runtime.

Нормативно фиксируются:

- назначение библиотеки;
- source artifact v2;
- prepared artifact v2;
- публичный API;
- condition operator semantics;
- runtime result contract;
- trace contract;
- diagnostics/errors;
- запреты на raw payload traversal;
- migration из v1 equality-engine;
- interop с `mappings v3`, `dataflows v1`, `CONTROL/ROUTE`;
- критерии готовности к релизу.

---

## 2. Назначение

`@processengine/decisions` v2 принимает решение по уже подготовленным facts.

```text
prepared decisions artifact + facts object -> { output: DecisionOutput, trace? }
```

Роль библиотеки:

```text
facts -> outcome
```

`decisions` не читает сырые массивы, payload, `context.input`, `context.effects` или `ProcessState`. Это работа предыдущих слоёв: `rules`, `mappings`, `dataflows`.

---

## 3. Non-goals

`@processengine/decisions` v2 не должен:

```text
- обходить массивы;
- иметь where/countWhere/existsAny по коллекциям;
- выполнять mappings;
- выполнять rules;
- строить patchPlan;
- маршрутизировать flow;
- знать CONTROL/ROUTE;
- читать ProcessState;
- работать с raw payload;
- иметь JS-like expression language;
- поддерживать nested boolean trees в v2;
- поддерживать patchPlanFrom из старой модели.
```

`patchPlanFrom` в Flow 5 decisions v2 запрещён как хвост старой модели. Если когда-нибудь понадобится patch planning, это отдельный artifact/runtime, а не часть decisions v2.

---

## 4. Breaking change относительно текущего decisions v1

Текущий decisions — equality-engine:

```text
definition.artifacts
artifact.type = decision-rule / decision-set
when = scalar equality object
compile(definition)
evaluate(compiled, entrypointId, facts)
run(...)
```

v2 переводится на семейный lifecycle:

```text
validateDecisions -> prepareDecisions -> executeDecisions
```

Это новая major/minor-модель для Flow 5. Если публично версия пакета ещё не была закреплена как stable, всё равно в документации должно быть ясно: v2 target model не является compatibility update поверх v1 API.

---

## 5. Public API

```ts
export function validateDecisions(
  source: DecisionsDefinitionV2,
  options?: ValidateDecisionsOptions
): ValidationResult;

export function prepareDecisions(
  source: DecisionsDefinitionV2,
  options?: PrepareDecisionsOptions
): PreparedDecisionsArtifact;

export function executeDecisions(
  artifact: PreparedDecisionsArtifact,
  facts: JsonObject,
  options?: ExecuteDecisionsOptions
): ExecuteDecisionsResult;

export function formatDecisionsDiagnostics(
  diagnostics: DecisionsDiagnostic[]
): string;

export function formatDecisionsRuntimeError(
  error: DecisionsRuntimeError
): string;
```

Lifecycle:

```text
validateDecisions -> prepareDecisions -> executeDecisions
```

Canonical v2 runtime entrypoint is **`executeDecisions`**.

Any adapter required by an external legacy registry belongs outside this specification and must not be documented as a supported decisions v2 API surface.

---

## 6. Source artifact v2

```ts
interface DecisionsDefinitionV2 {
  decisionSetId: string;
  version: string;
  title: string;
  description: string;
  cases: DecisionCaseV2[];
  default: DecisionThen;
  metadata?: Record<string, JsonValue>;
}
```

Обязательные поля:

```text
decisionSetId
version
title
description
cases
default
```

`cases` must be a non-empty array. A decisions artifact with no cases is not an explicit decision set; using `default` as the only behaviour is a modelling error for v2.

Запрещённые поля:

```text
artifacts
patchPlanFrom
patchPlan
entrypointId
```

### 6.1. Decision case

```ts
interface DecisionCaseV2 {
  id: string;
  title: string;
  description: string;
  when: Record<FactPath, DecisionCondition>;
  then: DecisionThen;
  metadata?: Record<string, JsonValue>;
}
```

### 6.2. Decision then

```ts
interface DecisionThen {
  outcome: string;
  reason?: string;
  metadata?: Record<string, JsonValue>;
  tags?: string[];
}
```

`outcome` обязателен. Это canonical value для `CONTROL/ROUTE`.

---

## 7. Prepared artifact v2

```ts
interface PreparedDecisionsArtifact {
  readonly artifactType: 'decisions';
  readonly version: 'v2';
  readonly decisionSetId: string;
  readonly title: string;
  readonly description: string;
  readonly compiledCases: CompiledDecisionCase[];
  readonly default: CompiledDecisionThen;

  getDefinition(): DecisionsDefinitionV2;
}
```

Prepared artifact должен быть immutable с точки зрения публичного контракта.

---

## 8. Runtime input

`executeDecisions` принимает facts object.

```ts
executeDecisions(artifact, factsObject, options?)
```

Facts object — это output предыдущего `MAPPINGS kind=facts` или `RULES`/`MAPPINGS` цепочки внутри dataflow.

`decisions` не должен принимать `ProcessState`.

---

## 9. Runtime result

Canonical runtime result:

```ts
interface ExecuteDecisionsResult {
  output: DecisionOutput;
  trace?: DecisionTraceEvent[];
}

interface DecisionOutput {
  outcome: string;
  reason?: string;
  matchedCaseId?: string;
  decisionSetId: string;
  metadata?: Record<string, JsonValue>;
  tags?: string[];
}
```

Нормативно:

```text
- output.outcome обязателен;
- output.decision не используется в v2;
- output.status не используется в v2;
- matchedCaseId отсутствует, если выбран default;
- runtime result JSON-safe / transport-safe;
- trace optional;
- trace не включается по умолчанию;
- if trace is returned, every trace event must be JSON-safe / transport-safe;
- if verbose trace uses redaction, redaction output must also be JSON-safe.
```

`CONTROL/ROUTE` должен читать:

```text
$.context.data.decisions.<name>.outcome
```

---

## 10. Case matching semantics

Cases проверяются в порядке объявления.

```text
for case in prepared.cases:
  if all conditions match:
    return output from case.then
return output from default
```

Первое совпавшее правило побеждает.

Если ни одно правило не совпало, используется `default`.

`default` обязателен, чтобы runtime не создавал неявный fallback.

---

## 11. Condition grammar

Short equality form сохраняется:

```json
{
  "resultStatus": "SUCCESS"
}
```

Она эквивалентна:

```json
{
  "resultStatus": { "eq": "SUCCESS" }
}
```

Operator form:

```ts
type DecisionCondition =
  | JsonScalar
  | { eq: JsonScalar }
  | { neq: JsonScalar }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { in: JsonScalar[] }
  | { notIn: JsonScalar[] }
  | { exists: true }
  | { missing: true }
  | { eqFact: FactPath }
  | { neqFact: FactPath }
  | { gtFact: FactPath }
  | { gteFact: FactPath }
  | { ltFact: FactPath }
  | { lteFact: FactPath };
```

Condition object содержит ровно один operator.

Невалидно:

```json
{
  "clientMatchCount": {
    "gt": 0,
    "lt": 10
  }
}
```

Для диапазонов в v2 нужен derived fact или отдельный future operator, но не multiple operators in one condition.

---

## 12. Condition operators

### 12.1. `eq`

```json
{ "clientOriginKind": { "eq": "OWN_SERVICE" } }
```

### 12.2. `neq`

```json
{ "clientOriginKind": { "neq": "BANK_EMPLOYEE_OR_UNKNOWN" } }
```

### 12.3. `gt/gte/lt/lte`

```json
{ "criticalMismatchCount": { "gt": 0 } }
```

Works only with number facts and number expected values.

### 12.4. `in/notIn`

```json
{
  "clientOriginKind": {
    "in": ["OWN_SERVICE", "SYSTEM"]
  }
}
```

Works only with scalar facts.

`in/notIn` arrays must not be empty.

### 12.5. `exists/missing`

```json
{ "hasActiveProducts": { "exists": true } }
```

```json
{ "hasActiveProducts": { "missing": true } }
```

Checks path presence, not truthiness.

Normative null semantics:

```text
path exists with value null -> exists = true, missing = false
path is absent                -> exists = false, missing = true
```

`false`, `0`, empty string and empty array are existing values.

### 12.6. `eqFact` and fact-to-fact comparisons

```json
{
  "softContactWarningCount": {
    "eqFact": "warningCount"
  }
}
```

Both facts must exist unless operator is `missing`.

Supported:

```text
eqFact
neqFact
gtFact
gteFact
ltFact
lteFact
```

---

## 13. Запрещённые condition forms

Запрещено:

```text
array traversal
where
countWhere
existsAny over raw arrays
all/any over collections
expression language
JS-like expressions
nested boolean trees
patchPlanFrom
```

Плохо:

```json
{
  "when": {
    "$.clients[*]": {
      "countWhere": {
        "field": "createSrc",
        "equals": "NOMINAL_BENEFICIARY_SERVICE",
        "gte": 2
      }
    }
  }
}
```

Правильно:

```json
{
  "when": {
    "ownServiceClientCount": { "gte": 2 }
  }
}
```

`ownServiceClientCount` должен быть заранее подготовлен facts mapping-ом.

---

## 14. Examples

### 14.1. Validation route

```json
{
  "decisionSetId": "decisions.validation.route",
  "version": "2.0.0",
  "title": "Выбрать маршрут после валидации заявки",
  "description": "Определяет, можно ли продолжать обработку заявки или нужно завершить процесс отказом.",
  "cases": [
    {
      "id": "validation.has_exceptions",
      "title": "Есть регуляторные исключения",
      "description": "Отклоняет заявку, если проверки вернули хотя бы одно исключение.",
      "when": {
        "exceptionCount": { "gt": 0 }
      },
      "then": {
        "outcome": "REJECT_COMPLIANCE",
        "reason": "REGULATORY_REJECT"
      }
    },
    {
      "id": "validation.has_errors",
      "title": "Есть блокирующие ошибки",
      "description": "Отклоняет заявку, если проверки вернули хотя бы одну ошибку.",
      "when": {
        "errorCount": { "gt": 0 }
      },
      "then": {
        "outcome": "REJECT_VALIDATION",
        "reason": "VALIDATION_ERROR"
      }
    }
  ],
  "default": {
    "outcome": "CONTINUE",
    "reason": "VALIDATION_OK"
  }
}
```

### 14.2. Soft warnings

```json
{
  "id": "validation.only_soft_warnings",
  "title": "Есть только мягкие предупреждения",
  "description": "Разрешает продолжить процесс, если все предупреждения относятся к мягким контактным полям.",
  "when": {
    "warningCount": { "gt": 0 },
    "softContactWarningCount": { "eqFact": "warningCount" },
    "errorCount": 0,
    "exceptionCount": 0
  },
  "then": {
    "outcome": "CONTINUE",
    "reason": "VALIDATION_WARNING"
  }
}
```

---

## 15. Diagnostics and errors

Validation diagnostics:

```text
DECISIONS_SOURCE_FORBIDDEN_FIELD
DECISIONS_DECISION_SET_ID_MISSING
DECISIONS_VERSION_MISSING
DECISIONS_TITLE_MISSING
DECISIONS_DESCRIPTION_MISSING
DECISIONS_CASES_MISSING
DECISIONS_CASE_ID_MISSING
DECISIONS_CASE_ID_DUPLICATE
DECISIONS_CASE_TITLE_MISSING
DECISIONS_CASE_DESCRIPTION_MISSING
DECISIONS_CASE_WHEN_MISSING
DECISIONS_CASE_THEN_MISSING
DECISIONS_DEFAULT_MISSING
DECISIONS_OUTCOME_MISSING
DECISIONS_CONDITION_OPERATOR_INVALID
DECISIONS_CONDITION_MULTIPLE_OPERATORS
DECISIONS_CONDITION_EXPECTED_TYPE_INVALID
DECISIONS_CONDITION_FACT_REF_INVALID
DECISIONS_CONDITION_EMPTY_IN_SET
DECISIONS_PATCH_PLAN_FORBIDDEN
DECISIONS_RAW_PATH_FORBIDDEN
```

Runtime errors:

```text
DECISIONS_INPUT_NOT_JSON_SAFE
DECISIONS_OUTPUT_NOT_JSON_SAFE
DECISIONS_INVALID_ARTIFACT_VERSION
DECISIONS_CONDITION_TYPE_MISMATCH
DECISIONS_CONDITION_FACT_REF_MISSING
DECISIONS_RUNTIME_ERROR
```

---

## 16. Trace

Trace mode:

```ts
type TraceMode = 'off' | 'basic' | 'verbose';
```

Trace event shape:

```ts
interface DecisionTraceEvent {
  kind: 'DECISION_CASE_EVALUATED' | 'DECISION_CASE_MATCHED' | 'DECISION_DEFAULT_SELECTED';
  artifactType: 'decisions';
  artifactId: string;
  step: string;
  at: string;
  outcome: 'matched' | 'not_matched' | 'default_selected';
  details?: Record<string, JsonValue>;
  input?: JsonValue;  // verbose only
  output?: JsonValue; // verbose only
}
```

Failed condition example:

```json
{
  "kind": "DECISION_CASE_EVALUATED",
  "artifactType": "decisions",
  "artifactId": "decisions.abs.find_client",
  "step": "case:find_client.multiple_external_clients_ambiguous",
  "at": "2026-05-17T10:00:00Z",
  "outcome": "not_matched",
  "details": {
    "caseId": "find_client.multiple_external_clients_ambiguous",
    "failedConditions": [
      {
        "fact": "clientMatchCount",
        "operator": "gte",
        "expected": 2,
        "actual": 1,
        "conditionIndex": 1
      }
    ]
  }
}
```

---

## 17. Interop with dataflows v1

`dataflows` expects canonical runtime result:

```ts
{ output: JsonValue, trace?: TraceEvent[] }
```

`executeDecisions` returns:

```ts
{
  output: {
    outcome: string,
    reason?: string,
    matchedCaseId?: string,
    decisionSetId: string,
    metadata?: Record<string, JsonValue>,
    tags?: string[]
  },
  trace?: DecisionTraceEvent[]
}
```

Dataflow item writes this output to:

```text
$.context.data.decisions.<name>
```

Then `CONTROL/ROUTE` reads:

```text
$.context.data.decisions.<name>.outcome
```

---

## 18. Migration from v1 equality-engine

Migration steps:

```text
1. Convert definition.artifacts to cases/default shape.
2. Convert decision-rule artifacts to DecisionCaseV2.
3. Convert decision-set entrypoint to DecisionsDefinitionV2.
4. Replace then.decision with then.outcome.
5. Remove patchPlanFrom/patchPlan.
6. Keep scalar equality when enough.
7. Replace boolean duplicate facts with count/operator conditions where useful.
8. Update runtime callers to executeDecisions(...).
9. Update dataflows registry adapters.
10. Update tests and examples.
```

Examples:

```text
hasErrors: true -> errorCount: { gt: 0 }
hasWarnings: true -> warningCount: { gt: 0 }
hasMultipleClientCandidates: true -> clientMatchCount: { gte: 2 }
hasCriticalMismatches: true -> criticalMismatchCount: { gt: 0 }
hasPatchableEmptyFields: true -> patchableEmptyFieldCount: { gt: 0 }
allWarningsAreSoft -> warningCount > 0 AND softContactWarningCount == warningCount
```

---

## 19. Definition of Done

```text
- validate/prepare/execute lifecycle реализован;
- old compile/evaluate/run API не является canonical v2 API;
- canonical output shape зафиксирован и протестирован;
- cases non-empty validation реализована;
- duplicate case ids rejected;
- patchPlanFrom запрещён;
- condition operators реализованы;
- raw payload traversal запрещён;
- output JSON-safe;
- trace содержит operator в failedConditions;
- trace JSON-safe / transport-safe, включая verbose/redacted fields;
- mappings facts output -> decisions input interop test есть;
- decisions output -> dataflows write.value interop test есть;
- CONTROL/ROUTE can read output.outcome fixture есть;
- npm test проходит;
- npm run test:pack проходит;
- npm pack проходит;
- pack/install smoke проходит;
- ESM import smoke проходит;
- examples попадают в npm tarball;
- CI workflow не вызывает старые команды;
- README/SPEC/COMPATIBILITY/MIGRATION/CHANGELOG синхронизированы.
```
