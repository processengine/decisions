'use strict';

const { DecisionsRuntimeError } = require('./errors');
const { isJsonSafe, isPlainObject } = require('./validate');

const FACT_COMPARISON_OPS = new Set(['eqFact', 'neqFact', 'gtFact', 'gteFact', 'ltFact', 'lteFact']);
const SUPPORTED_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'exists', 'missing', 'eqFact', 'neqFact', 'gtFact', 'gteFact', 'ltFact', 'lteFact']);
const NUMERIC_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const FACT_REF_OPS = new Set(['eqFact', 'neqFact', 'gtFact', 'gteFact', 'ltFact', 'lteFact']);

function executeDecisionsArtifact(artifact, facts, options) {
  assertExecutionOptions(options);
  assertPreparedArtifact(artifact);
  if (!isPlainObject(facts) || !isJsonSafe(facts)) {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_INPUT_NOT_JSON_SAFE', message: 'facts must be a JSON-safe object' });
  }

  const traceMode = normalizeTraceMode(options === undefined ? undefined : options.trace);
  const trace = traceMode === 'off' ? undefined : [];

  for (const decisionCase of artifact.compiledCases) {
    const failedConditions = [];
    let allMatched = true;
    for (let i = 0; i < decisionCase.conditions.length; i++) {
      const condition = decisionCase.conditions[i];
      const result = evaluateCondition(condition, facts);
      if (!result.matched) {
        allMatched = false;
        failedConditions.push(toFailedCondition(condition, result, i));
      }
    }

    if (trace) {
      trace.push(makeTraceEvent({
        kind: 'DECISION_CASE_EVALUATED',
        artifactId: artifact.decisionSetId,
        step: `case:${decisionCase.id}`,
        outcome: allMatched ? 'matched' : 'not_matched',
        details: allMatched ? { caseId: decisionCase.id } : { caseId: decisionCase.id, failedConditions },
        traceMode,
        input: facts,
      }));
    }

    if (allMatched) {
      const output = makeOutput(artifact, decisionCase.then, decisionCase.id);
      assertJsonSafeOutput(output);
      const result = { output };
      if (trace) {
        trace.push(makeTraceEvent({
          kind: 'DECISION_CASE_MATCHED',
          artifactId: artifact.decisionSetId,
          step: `case:${decisionCase.id}`,
          outcome: 'matched',
          details: { caseId: decisionCase.id },
          traceMode,
          input: facts,
          output,
        }));
        result.trace = assertJsonSafeTrace(safeCleanJson(trace, 'DECISIONS_TRACE_NOT_JSON_SAFE', 'decision trace must be JSON-safe'));
      }
      return result;
    }
  }

  const output = makeOutput(artifact, artifact.default, undefined);
  assertJsonSafeOutput(output);
  const result = { output };
  if (trace) {
    trace.push(makeTraceEvent({
      kind: 'DECISION_DEFAULT_SELECTED',
      artifactId: artifact.decisionSetId,
      step: 'default',
      outcome: 'default_selected',
      details: { decisionSetId: artifact.decisionSetId },
      traceMode,
      input: facts,
      output,
    }));
    result.trace = assertJsonSafeTrace(safeCleanJson(trace, 'DECISIONS_TRACE_NOT_JSON_SAFE', 'decision trace must be JSON-safe'));
  }
  return result;
}




function assertExecutionOptions(options) {
  if (options === undefined) return;
  if (!isPlainObject(options)) {
    throw new DecisionsRuntimeError({
      code: 'DECISIONS_EXECUTION_OPTIONS_INVALID',
      message: 'executeDecisions options must be a plain object when provided'
    });
  }
  for (const key of Object.keys(options)) {
    if (key !== 'trace') {
      throw new DecisionsRuntimeError({
        code: 'DECISIONS_EXECUTION_OPTIONS_INVALID',
        message: `Unsupported executeDecisions option: ${key}`,
        details: { option: key }
      });
    }
  }
}

function assertPreparedArtifact(artifact) {
  if (!artifact || artifact.artifactType !== 'decisions' || artifact.version !== 'v2') {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_INVALID_ARTIFACT_VERSION', message: 'executeDecisions expects a prepared decisions v2 artifact from prepareDecisions().' });
  }
  if (typeof artifact.decisionSetId !== 'string' || !artifact.decisionSetId.trim() ||
      !Array.isArray(artifact.compiledCases) || artifact.compiledCases.length === 0 ||
      !isPlainObject(artifact.default)) {
    throwPreparedInvalid('prepared decisions artifact shape is invalid');
  }
  assertThenShape(artifact.default, 'default');
  for (let i = 0; i < artifact.compiledCases.length; i++) {
    const decisionCase = artifact.compiledCases[i];
    if (!isPlainObject(decisionCase) || typeof decisionCase.id !== 'string' || !decisionCase.id.trim() ||
        !Array.isArray(decisionCase.conditions) || decisionCase.conditions.length === 0 || !isPlainObject(decisionCase.then)) {
      throwPreparedInvalid('prepared decisions artifact has invalid compiled case shape', { caseIndex: i });
    }
    assertThenShape(decisionCase.then, `compiledCases[${i}].then`, { caseIndex: i });
    for (let j = 0; j < decisionCase.conditions.length; j++) {
      assertConditionShape(decisionCase.conditions[j], { caseIndex: i, conditionIndex: j });
    }
  }
}

function assertThenShape(then, path, baseDetails = {}) {
  if (!isPlainObject(then) || typeof then.outcome !== 'string' || !then.outcome.trim()) {
    throwPreparedInvalid('prepared decisions artifact has invalid then/default shape', { ...baseDetails, path });
  }
  if (then.reason !== undefined && typeof then.reason !== 'string') {
    throwPreparedInvalid('prepared decisions artifact then.reason must be a string when present', { ...baseDetails, path: `${path}.reason` });
  }
  if (then.metadata !== undefined && (!isPlainObject(then.metadata) || !isJsonSafe(then.metadata))) {
    throwPreparedInvalid('prepared decisions artifact then.metadata must be a JSON-safe plain object when present', { ...baseDetails, path: `${path}.metadata` });
  }
  if (then.tags !== undefined && (!Array.isArray(then.tags) || !then.tags.every(t => typeof t === 'string'))) {
    throwPreparedInvalid('prepared decisions artifact then.tags must be an array of strings when present', { ...baseDetails, path: `${path}.tags` });
  }
}

function assertConditionShape(condition, details) {
  if (!isPlainObject(condition) || typeof condition.factPath !== 'string' || !condition.factPath.trim() || typeof condition.operator !== 'string') {
    throwPreparedInvalid('prepared decisions artifact has invalid condition shape', details);
  }
  if (isForbiddenFactName(condition.factPath)) {
    throwPreparedInvalid('prepared decisions artifact has invalid condition factPath', { ...details, factPath: condition.factPath });
  }
  const { operator, expected } = condition;
  if (!SUPPORTED_OPS.has(operator)) {
    throwPreparedInvalid(`prepared decisions artifact has unsupported condition operator: ${operator}`, details);
  }
  if ((operator === 'eq' || operator === 'neq') && !isJsonScalar(expected)) {
    throwPreparedInvalid(`prepared condition ${operator} expects a JSON scalar`, details);
  }
  if (NUMERIC_OPS.has(operator) && (typeof expected !== 'number' || !Number.isFinite(expected))) {
    throwPreparedInvalid(`prepared condition ${operator} expects a number`, details);
  }
  if ((operator === 'in' || operator === 'notIn') && (!Array.isArray(expected) || expected.length === 0 || !expected.every(isJsonScalar))) {
    throwPreparedInvalid(`prepared condition ${operator} expects a non-empty array of JSON scalars`, details);
  }
  if ((operator === 'exists' || operator === 'missing') && expected !== true) {
    throwPreparedInvalid(`prepared condition ${operator} expects true`, details);
  }
  if (FACT_REF_OPS.has(operator) && (typeof expected !== 'string' || !expected.trim() || isForbiddenFactName(expected))) {
    throwPreparedInvalid(`prepared condition ${operator} expects a non-empty fact name string`, details);
  }
}

function isForbiddenFactName(name) {
  return name.startsWith('$.') || name.includes('[*]') || name.includes('__proto__') || name.includes('prototype') || name.includes('constructor');
}

function throwPreparedInvalid(message, details) {
  throw new DecisionsRuntimeError({ code: 'DECISIONS_PREPARED_ARTIFACT_INVALID', message, details });
}

function normalizeTraceMode(trace) {
  if (trace === undefined) return 'off';
  if (trace === 'off' || trace === 'basic' || trace === 'verbose') return trace;
  throw new DecisionsRuntimeError({
    code: 'DECISIONS_TRACE_MODE_INVALID',
    message: 'options.trace must be "off", "basic", or "verbose"',
    details: { trace }
  });
}

function evaluateCondition(condition, facts) {
  const actualInfo = getFactValue(facts, condition.factPath);
  const actual = actualInfo.value;
  const exists = actualInfo.exists;
  const expected = condition.expected;
  let matched = false;
  let expectedValue = expected;

  switch (condition.operator) {
    case 'eq': assertScalarConditionValue(condition, actual, exists); matched = exists && actual === expected; break;
    case 'neq': assertScalarConditionValue(condition, actual, exists); matched = exists && actual !== expected; break;
    case 'gt': matched = exists && typeof actual === 'number' && actual > expected; break;
    case 'gte': matched = exists && typeof actual === 'number' && actual >= expected; break;
    case 'lt': matched = exists && typeof actual === 'number' && actual < expected; break;
    case 'lte': matched = exists && typeof actual === 'number' && actual <= expected; break;
    case 'in': assertScalarConditionValue(condition, actual, exists); matched = exists && Array.isArray(expected) && expected.includes(actual); break;
    case 'notIn': assertScalarConditionValue(condition, actual, exists); matched = exists && Array.isArray(expected) && !expected.includes(actual); break;
    case 'exists': matched = exists; break;
    case 'missing': matched = !exists; break;
    case 'eqFact':
    case 'neqFact':
    case 'gtFact':
    case 'gteFact':
    case 'ltFact':
    case 'lteFact': {
      const other = getFactValue(facts, expected);
      expectedValue = other.value;
      if (!exists || !other.exists) {
        throw new DecisionsRuntimeError({ code: 'DECISIONS_CONDITION_FACT_REF_MISSING', message: `Fact comparison requires both facts to exist: ${condition.factPath}, ${expected}`, details: { fact: condition.factPath, factRef: expected } });
      }
      switch (condition.operator) {
        case 'eqFact': assertScalarFactComparisonValues(condition, actual, other.value); matched = actual === other.value; break;
        case 'neqFact': assertScalarFactComparisonValues(condition, actual, other.value); matched = actual !== other.value; break;
        case 'gtFact': matched = assertNumbers(condition, actual, other.value) && actual > other.value; break;
        case 'gteFact': matched = assertNumbers(condition, actual, other.value) && actual >= other.value; break;
        case 'ltFact': matched = assertNumbers(condition, actual, other.value) && actual < other.value; break;
        case 'lteFact': matched = assertNumbers(condition, actual, other.value) && actual <= other.value; break;
      }
      break;
    }
    default:
      throw new DecisionsRuntimeError({ code: 'DECISIONS_CONDITION_OPERATOR_INVALID', message: `Unsupported condition operator: ${condition.operator}` });
  }

  if (['gt', 'gte', 'lt', 'lte'].includes(condition.operator) && exists && typeof actual !== 'number') {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_CONDITION_TYPE_MISMATCH', message: `Operator ${condition.operator} expects number fact`, details: { fact: condition.factPath, actualType: typeof actual } });
  }

  return { matched, actual, expected: expectedValue, exists };
}


function assertScalarConditionValue(condition, actual, exists) {
  if (!exists) return;
  if (!isJsonScalar(actual)) {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_CONDITION_TYPE_MISMATCH', message: `Operator ${condition.operator} expects scalar fact`, details: { fact: condition.factPath, actualType: Array.isArray(actual) ? 'array' : typeof actual } });
  }
}

function assertScalarFactComparisonValues(condition, actual, expected) {
  if (!isJsonScalar(actual) || !isJsonScalar(expected)) {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_CONDITION_TYPE_MISMATCH', message: `Operator ${condition.operator} expects scalar facts`, details: { fact: condition.factPath, factRef: condition.expected } });
  }
}

function isJsonScalar(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function assertNumbers(condition, actual, expected) {
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_CONDITION_TYPE_MISMATCH', message: `Operator ${condition.operator} expects numeric facts`, details: { fact: condition.factPath, factRef: condition.expected } });
  }
  return true;
}

function getFactValue(facts, factPath) {
  if (Object.prototype.hasOwnProperty.call(facts, factPath)) {
    return { exists: true, value: facts[factPath] };
  }
  return { exists: false, value: undefined };
}

function toFailedCondition(condition, result, index) {
  const entry = { fact: condition.factPath, operator: condition.operator, actual: result.exists ? result.actual : null, conditionIndex: index };
  if (FACT_COMPARISON_OPS.has(condition.operator)) {
    entry.factRef = condition.expected;
    entry.expected = result.expected === undefined ? null : result.expected;
  } else if (!['exists', 'missing'].includes(condition.operator)) {
    entry.expected = condition.expected;
  }
  return entry;
}

function makeOutput(artifact, then, matchedCaseId) {
  return {
    outcome: then.outcome,
    decisionSetId: artifact.decisionSetId,
    ...(matchedCaseId ? { matchedCaseId } : {}),
    ...(then.reason != null ? { reason: then.reason } : {}),
    ...(then.metadata != null ? { metadata: then.metadata } : {}),
    ...(then.tags != null ? { tags: then.tags } : {}),
  };
}

function makeTraceEvent({ kind, artifactId, step, outcome, details, traceMode, input, output }) {
  const event = { kind, artifactType: 'decisions', artifactId, step, at: new Date().toISOString(), outcome };
  if (details) event.details = details;
  if (traceMode === 'verbose') {
    if (input !== undefined) event.input = input;
    if (output !== undefined) event.output = output;
  }
  return event;
}

function safeCleanJson(value, code, message) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (cause) {
    throw new DecisionsRuntimeError({ code, message, cause });
  }
}

function assertJsonSafeOutput(output) {
  if (!isJsonSafe(output)) {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_OUTPUT_NOT_JSON_SAFE', message: 'decision output must be JSON-safe' });
  }
}

function assertJsonSafeTrace(trace) {
  if (!isJsonSafe(trace)) {
    throw new DecisionsRuntimeError({ code: 'DECISIONS_TRACE_NOT_JSON_SAFE', message: 'decision trace must be JSON-safe' });
  }
  return trace;
}

module.exports = { executeDecisionsArtifact };
