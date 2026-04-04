'use strict';

const { compile } = require('./compiler');
const { makeRuntimeError } = require('./errors');
const { isPlainObject, deepCloneJsonSafe, flattenFacts, detectFlatNestedConflict, getPath } = require('./utils');

function evaluate(compiled, entrypointId, facts, options) {
  const traceEnabled = !options || options.trace !== false;
  const trace = traceEnabled ? [] : [];

  if (!compiled || compiled.kind !== 'compiled-decisions' || !compiled.entrypoints || typeof compiled.entrypoints.get !== 'function') {
    return abort(null, trace, makeRuntimeError({
      code: 'INVALID_COMPILED_ARTIFACT',
      message: 'evaluate() expects a compiled artifact produced by compile()',
      phase: 'input_validation',
      entrypointId: typeof entrypointId === 'string' ? entrypointId : null,
    }));
  }
  if (typeof entrypointId !== 'string' || !entrypointId) {
    return abort(null, trace, makeRuntimeError({ code: 'INVALID_ENTRYPOINT_ID', message: 'entrypointId must be a non-empty string', phase: 'input_validation' }));
  }
  const entrypoint = compiled.entrypoints.get(entrypointId);
  if (!entrypoint) {
    return abort(null, trace, makeRuntimeError({
      code: 'ENTRYPOINT_NOT_FOUND',
      message: 'Entrypoint not found: ' + entrypointId,
      phase: 'entrypoint_lookup',
      entrypointId,
      details: { availableEntrypoints: [...compiled.entrypoints.keys()] },
    }));
  }
  const normalizedFacts = facts == null ? Object.create(null) : facts;
  if (!isPlainObject(normalizedFacts)) {
    return abort(entrypoint.version, trace, makeRuntimeError({ code: 'INVALID_FACTS_TYPE', message: 'facts must be a plain object', phase: 'input_validation', entrypointId }));
  }
  let safeFacts;
  try {
    safeFacts = deepCloneJsonSafe(normalizedFacts, '$facts');
  } catch (error) {
    return abort(entrypoint.version, trace, makeRuntimeError({
      code: error.code === 'CYCLE_DETECTED' ? 'FACTS_CYCLE_DETECTED' : error.code === 'DANGEROUS_KEY' ? 'DANGEROUS_FACT_KEY' : 'FACTS_NOT_JSON_SAFE',
      message: error.message,
      phase: 'input_validation',
      entrypointId,
      details: { sourceCode: error.code || null, sourcePath: error.path || null },
    }));
  }
  const conflictKey = detectFlatNestedConflict(safeFacts);
  if (conflictKey) {
    return abort(entrypoint.version, trace, makeRuntimeError({ code: 'CONFLICTING_FACT_PATHS', message: 'facts contains both flat and nested representations for path ' + conflictKey, phase: 'input_validation', entrypointId, details: { fact: conflictKey } }));
  }
  const flatFacts = flattenFacts(safeFacts);

  for (const factPath of entrypoint.requiredFacts) {
    const found = getPath(flatFacts, factPath).found;
    if (!found) {
      return abort(entrypoint.version, trace, makeRuntimeError({ code: 'REQUIRED_FACT_MISSING', message: 'Required fact is absent: ' + factPath, phase: 'required_facts', entrypointId, details: { fact: factPath } }));
    }
  }

  for (const rule of entrypoint.rules) {
    const failedConditions = [];
    let abortError = null;
    for (let index = 0; index < rule.conditions.length; index += 1) {
      const condition = rule.conditions[index];
      const { found, value } = getPath(flatFacts, condition.path);
      if (!found) {
        if (entrypoint.missingFactPolicy === 'error') {
          abortError = makeRuntimeError({ code: 'MISSING_FACT', message: 'Fact path is absent in when condition: ' + condition.path, phase: 'rule_evaluation', entrypointId, ruleId: rule.ruleId, conditionIndex: index, details: { fact: condition.path, expected: condition.expected } });
          break;
        }
        failedConditions.push({ fact: condition.path, expected: condition.expected, actual: '__MISSING__', conditionIndex: index });
        continue;
      }
      if (value !== condition.expected) {
        failedConditions.push({ fact: condition.path, expected: condition.expected, actual: value, conditionIndex: index });
      }
    }
    if (abortError) return abort(entrypoint.version, trace, abortError);
    const matched = failedConditions.length === 0;
    if (traceEnabled) trace.push(matched ? { ruleId: rule.ruleId, matched: true } : { ruleId: rule.ruleId, matched: false, failedConditions });
    if (!matched) continue;

    let patchPlan = null;
    if (rule.then.patchPlanFrom) {
      const patchPlanResult = getPath(flatFacts, rule.then.patchPlanFrom);
      patchPlan = patchPlanResult.found ? deepCloneJsonSafe(patchPlanResult.value, '$patchPlan') : null;
    }
    return {
      status: 'MATCHED',
      decision: rule.then.decision,
      reason: rule.then.reason,
      matchedRuleId: rule.ruleId,
      decisionSetVersion: entrypoint.version,
      patchPlan,
      metadata: deepCloneJsonSafe(rule.then.metadata, '$metadata'),
      tags: [...rule.then.tags],
      trace,
    };
  }

  if (entrypoint.strict) {
    return abort(entrypoint.version, trace, makeRuntimeError({ code: 'DEFAULT_REACHED_IN_STRICT_MODE', message: 'No rule matched and strict mode prohibits default decision', phase: 'default_resolution', entrypointId, details: { traceBeforeDefault: trace } }));
  }

  return {
    status: 'DEFAULTED',
    decision: entrypoint.defaultDecision.decision,
    reason: entrypoint.defaultDecision.reason,
    matchedRuleId: null,
    decisionSetVersion: entrypoint.version,
    patchPlan: null,
    metadata: Object.create(null),
    tags: [],
    trace,
  };
}

function run(definition, entrypointId, facts, options) {
  const compiled = compile(definition);
  return evaluate(compiled, entrypointId, facts, options);
}

function abort(version, trace, error) {
  return {
    status: 'ABORT',
    decision: null,
    reason: null,
    matchedRuleId: null,
    decisionSetVersion: version,
    patchPlan: null,
    metadata: Object.create(null),
    tags: [],
    trace,
    error,
  };
}

module.exports = { evaluate, run };
