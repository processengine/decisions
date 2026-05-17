# Changelog

## [2.0.0] - 2026-05-17

### Changed
- Reworked package into Flow 5 decisions v2 runtime.
- Replaced old `compile/evaluate/run` contract with `validateDecisions/prepareDecisions/executeDecisions`.
- Replaced v1 artifact collection model with a single decision set source using `cases` and `default`.
- Replaced `then.decision` with canonical `then.outcome`.
- Runtime result is now `{ output: { outcome, decisionSetId, matchedCaseId?, ... }, trace? }`.

### Added
- Condition operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `exists`, `missing`, and fact-to-fact comparisons.
- JSON-safe / transport-safe output and trace checks.
- Flow 5 interop docs and examples.
- Pack/install smoke test.

### Removed
- v1 `definition.artifacts` model.
- v1 `decision-rule` / `decision-set` artifact types.
- v1 `defaultDecision`, `patchPlanFrom`, `patchPlan`, `requiredFacts`, `missingFactPolicy`, `strict` model and the rejected interim `rules` source field.

### Hardening after review
- Trace option is now the strict family enum `off | basic | verbose`; invalid values throw `DECISIONS_TRACE_MODE_INVALID`.
- Runtime rejects malformed prepared artifacts with `DECISIONS_PREPARED_ARTIFACT_INVALID`.
- Validator rejects duplicate case ids and non-object metadata.
- Scalar condition operators reject object/array facts with `DECISIONS_CONDITION_TYPE_MISMATCH`.
- Added production-ready runtime boundary gate: malformed options, facts, prepared artifacts and trace paths throw typed `DecisionsRuntimeError`, with no raw JavaScript errors escaping public runtime API.
