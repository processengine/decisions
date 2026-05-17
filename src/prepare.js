'use strict';

const { validateDecisionsSource, isJsonSafe } = require('./validate');
const { hasErrors, DecisionsCompileError } = require('./errors');

function compileThen(then) {
  return deepFreeze({
    outcome: then.outcome,
    ...(then.reason != null ? { reason: then.reason } : {}),
    ...(then.metadata != null ? { metadata: cloneJson(then.metadata) } : {}),
    ...(then.tags != null ? { tags: [...then.tags] } : {}),
  });
}

function compileCondition(factPath, condition) {
  if (condition === null || typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
    return deepFreeze({ factPath, operator: 'eq', expected: condition });
  }
  const [op] = Object.keys(condition);
  return deepFreeze({ factPath, operator: op, expected: condition[op] });
}

function compileCase(decisionCase) {
  const compiledConditions = Object.entries(decisionCase.when).map(([factPath, condition]) => compileCondition(factPath, condition));
  return deepFreeze({
    id: decisionCase.id,
    title: decisionCase.title,
    description: decisionCase.description,
    conditions: compiledConditions,
    then: compileThen(decisionCase.then),
    ...(decisionCase.metadata != null ? { metadata: cloneJson(decisionCase.metadata) } : {}),
  });
}

function prepareDecisionsArtifact(source) {
  const validation = validateDecisionsSource(source);
  if (!validation.ok || hasErrors(validation.diagnostics)) {
    throw new DecisionsCompileError(validation.diagnostics);
  }
  const sourceSnapshot = deepFreeze(cloneJson(source));
  const artifact = {
    artifactType: 'decisions',
    version: 'v2',
    decisionSetId: source.decisionSetId,
    title: source.title,
    description: source.description,
    compiledCases: source.cases.map(compileCase),
    default: compileThen(source.default),
    getDefinition: () => sourceSnapshot,
  };
  return deepFreeze(artifact);
}

function cloneJson(value) {
  if (!isJsonSafe(value)) {
    throw new DecisionsCompileError([{ code: 'DECISIONS_SOURCE_NOT_JSON_SAFE', level: 'error', message: 'source must be JSON-safe' }]);
  }
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

module.exports = { prepareDecisionsArtifact };
