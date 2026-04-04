'use strict';

const { CompilationError, makeDiagnostic } = require('./errors');
const { deepCloneJsonSafe, deepFreezeValue, createReadOnlyMap, assertSafePath } = require('./utils');

function compile(definition) {
  const diagnostics = [];
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new CompilationError([
      makeDiagnostic({
        severity: 'error',
        code: 'INVALID_DEFINITION',
        message: 'compile(definition) expects an object with artifacts array',
        phase: 'input_validation',
        path: '$',
      }),
    ]);
  }
  const keys = Object.keys(definition);
  if (keys.length !== 1 || !Array.isArray(definition.artifacts)) {
    throw new CompilationError([
      makeDiagnostic({
        severity: 'error',
        code: 'INVALID_DEFINITION',
        message: 'definition must contain only the "artifacts" array field',
        phase: 'input_validation',
        path: '$',
      }),
    ]);
  }

  let frozenArtifacts;
  try {
    frozenArtifacts = deepFreezeValue(deepCloneJsonSafe(definition.artifacts, '$.artifacts'));
  } catch (error) {
    throw new CompilationError([
      makeDiagnostic({
        severity: 'error',
        code: mapCloneErrorCode(error),
        message: error.message,
        phase: 'input_validation',
        path: '$.artifacts',
        details: { sourceCode: error.code || null, sourcePath: error.path || null },
      }),
    ]);
  }

  const registry = new Map();
  for (let index = 0; index < frozenArtifacts.length; index += 1) {
    const artifact = frozenArtifacts[index];
    validateArtifactShape(artifact, index, diagnostics);
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || typeof artifact.id !== 'string' || !artifact.id) continue;
    if (registry.has(artifact.id)) {
      diagnostics.push(makeDiagnostic({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: 'Duplicate artifact id: ' + artifact.id,
        phase: 'registry',
        path: '$.artifacts[' + index + '].id',
        artifactId: artifact.id,
      }));
      continue;
    }
    registry.set(artifact.id, artifact);
  }
  throwIfErrors(diagnostics);

  validateArtifactContent([...registry.values()], diagnostics);
  throwIfErrors(diagnostics);

  const entrypoints = new Map();
  for (const artifact of registry.values()) {
    if (artifact.type !== 'decision-set') continue;
    const compiledRules = [];
    for (let i = 0; i < artifact.rules.length; i += 1) {
      const ref = artifact.rules[i];
      const absId = resolveRuleRef(ref, artifact.id);
      const target = registry.get(absId);
      if (!target) {
        diagnostics.push(makeDiagnostic({
          severity: 'error',
          code: 'UNRESOLVED_RULE_REF',
          message: 'Rule ref "' + ref + '" resolves to missing id "' + absId + '"',
          phase: 'reference_validation',
          path: '$.artifacts[' + findArtifactIndex(frozenArtifacts, artifact.id) + '].rules[' + i + ']',
          artifactId: artifact.id,
          entrypointId: artifact.id,
          details: { ref, resolvedRuleId: absId },
        }));
        continue;
      }
      if (target.type !== 'decision-rule') {
        diagnostics.push(makeDiagnostic({
          severity: 'error',
          code: 'REF_TARGET_WRONG_TYPE',
          message: 'Rule ref "' + ref + '" resolves to non-rule artifact "' + absId + '"',
          phase: 'reference_validation',
          path: '$.artifacts[' + findArtifactIndex(frozenArtifacts, artifact.id) + '].rules[' + i + ']',
          artifactId: artifact.id,
          entrypointId: artifact.id,
          details: { ref, resolvedRuleId: absId, targetType: target.type },
        }));
        continue;
      }
      compiledRules.push(deepFreezeValue({
        ruleId: absId,
        conditions: Object.freeze(Object.entries(target.when).map(([path, expected]) => deepFreezeValue({ path, expected }))),
        then: deepFreezeValue({
          decision: target.then.decision,
          reason: target.then.reason,
          patchPlanFrom: target.then.patchPlanFrom || null,
          metadata: target.then.metadata ? deepCloneJsonSafe(target.then.metadata, '$metadata') : Object.create(null),
          tags: Object.freeze(target.then.tags ? [...target.then.tags] : []),
        }),
      }));
    }
    entrypoints.set(artifact.id, deepFreezeValue({
      id: artifact.id,
      version: artifact.version,
      mode: 'first_match_wins',
      missingFactPolicy: artifact.missingFactPolicy || 'false',
      requiredFacts: Object.freeze(artifact.requiredFacts ? [...artifact.requiredFacts] : []),
      strict: artifact.strict === true,
      defaultDecision: deepFreezeValue({
        decision: artifact.defaultDecision.decision,
        reason: artifact.defaultDecision.reason,
      }),
      rules: Object.freeze(compiledRules),
    }));
  }

  analyzeEntrypoints(entrypoints, diagnostics);
  throwIfErrors(diagnostics);

  const warnings = Object.freeze(diagnostics.filter((d) => d.severity === 'warning'));
  return Object.freeze({
    kind: 'compiled-decisions',
    registry: createReadOnlyMap(new Map([...registry.entries()])),
    entrypoints: createReadOnlyMap(new Map([...entrypoints.entries()])),
    warnings,
  });
}

function validateArtifactShape(artifact, index, diagnostics) {
  const basePath = '$.artifacts[' + index + ']';
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_ARTIFACT', message: 'Artifact must be a non-null object', phase: 'schema_validation', path: basePath }));
    return;
  }
  for (const key of Object.keys(artifact)) {
    if (!['id', 'type', 'description', 'when', 'then', 'version', 'mode', 'strict', 'missingFactPolicy', 'requiredFacts', 'rules', 'defaultDecision'].includes(key)) {
      diagnostics.push(makeDiagnostic({ severity: 'error', code: 'UNKNOWN_FIELD', message: 'Unexpected field "' + key + '"', phase: 'schema_validation', path: basePath + '.' + key, artifactId: typeof artifact.id === 'string' ? artifact.id : null }));
    }
  }
  if (typeof artifact.id !== 'string' || artifact.id.length === 0) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_ID', message: 'Artifact must have a non-empty string id', phase: 'schema_validation', path: basePath + '.id' }));
  if (typeof artifact.type !== 'string') diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_TYPE', message: 'Artifact must have a string type', phase: 'schema_validation', path: basePath + '.type', artifactId: artifact.id || null }));
  if (typeof artifact.description !== 'string' || artifact.description.length === 0) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_DESCRIPTION', message: 'Artifact must have a non-empty description', phase: 'schema_validation', path: basePath + '.description', artifactId: artifact.id || null }));
}

function validateArtifactContent(artifacts, diagnostics) {
  for (const artifact of artifacts) {
    if (artifact.type === 'decision-rule') validateRule(artifact, diagnostics);
    else if (artifact.type === 'decision-set') validateDecisionSet(artifact, diagnostics);
    else diagnostics.push(makeDiagnostic({ severity: 'error', code: 'UNSUPPORTED_TYPE', message: 'Unsupported artifact type: ' + artifact.type, phase: 'schema_validation', artifactId: artifact.id, path: '$artifact:' + artifact.id + '.type' }));
  }
}

function validateRule(rule, diagnostics) {
  if (!isObject(rule.when)) {
    diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_WHEN', message: 'when must be an object', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.when' }));
  } else {
    for (const [path, expected] of Object.entries(rule.when)) {
      try { assertSafePath(path, '$rule:' + rule.id + '.when'); } catch (error) {
        diagnostics.push(makeDiagnostic({ severity: 'error', code: 'DANGEROUS_DSL_PATH', message: error.message, phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.when.' + path }));
      }
      if (!isJsonScalar(expected)) {
        diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_CONDITION_VALUE', message: 'Condition expected value must be string, number, boolean, or null', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.when.' + path }));
      }
    }
  }
  if (!isObject(rule.then)) {
    diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_THEN', message: 'then must be an object', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then' }));
    return;
  }
  const allowedThenKeys = new Set(['decision', 'reason', 'patchPlanFrom', 'metadata', 'tags']);
  for (const key of Object.keys(rule.then)) {
    if (!allowedThenKeys.has(key)) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'UNKNOWN_FIELD', message: 'Unexpected field "' + key + '"', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.' + key }));
  }
  if (typeof rule.then.decision !== 'string' || !rule.then.decision) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_DECISION', message: 'then.decision must be a non-empty string', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.decision' }));
  if (typeof rule.then.reason !== 'string' || !rule.then.reason) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_REASON', message: 'then.reason must be a non-empty string', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.reason' }));
  if (rule.then.patchPlanFrom !== undefined) {
    if (typeof rule.then.patchPlanFrom !== 'string' || !rule.then.patchPlanFrom) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_PATCH_PLAN_FROM', message: 'then.patchPlanFrom must be a non-empty string', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.patchPlanFrom' }));
    else {
      try { assertSafePath(rule.then.patchPlanFrom, '$rule:' + rule.id + '.then.patchPlanFrom'); } catch (error) {
        diagnostics.push(makeDiagnostic({ severity: 'error', code: 'DANGEROUS_DSL_PATH', message: error.message, phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.patchPlanFrom' }));
      }
    }
  }
  if (rule.then.metadata !== undefined) {
    try { deepCloneJsonSafe(rule.then.metadata, '$rule:' + rule.id + '.then.metadata'); } catch (error) {
      diagnostics.push(makeDiagnostic({ severity: 'error', code: mapCloneErrorCode(error), message: error.message, phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.metadata' }));
    }
  }
  if (rule.then.tags !== undefined) {
    if (!Array.isArray(rule.then.tags) || rule.then.tags.some((tag) => typeof tag !== 'string')) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_TAGS', message: 'then.tags must be an array of strings', phase: 'schema_validation', artifactId: rule.id, ruleId: rule.id, path: '$rule:' + rule.id + '.then.tags' }));
  }
}

function validateDecisionSet(ds, diagnostics) {
  const allowedKeys = new Set(['id', 'type', 'description', 'version', 'mode', 'strict', 'missingFactPolicy', 'requiredFacts', 'rules', 'defaultDecision']);
  for (const key of Object.keys(ds)) {
    if (!allowedKeys.has(key)) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'UNKNOWN_FIELD', message: 'Unexpected field "' + key + '"', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.' + key }));
  }
  if (typeof ds.version !== 'string' || !ds.version) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_VERSION', message: 'decision-set.version must be a non-empty string', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.version' }));
  if (ds.mode !== 'first_match_wins') diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_MODE', message: 'decision-set.mode must be "first_match_wins"', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.mode' }));
  if (ds.missingFactPolicy !== undefined && ds.missingFactPolicy !== 'false' && ds.missingFactPolicy !== 'error') diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_MISSING_FACT_POLICY', message: 'missingFactPolicy must be "false" or "error"', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.missingFactPolicy' }));
  if (ds.requiredFacts !== undefined) {
    if (!Array.isArray(ds.requiredFacts) || ds.requiredFacts.some((fact) => typeof fact !== 'string' || !fact)) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_REQUIRED_FACTS', message: 'requiredFacts must be an array of non-empty strings', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.requiredFacts' }));
    else {
      ds.requiredFacts.forEach((fact, i) => {
        try { assertSafePath(fact, '$decisionSet:' + ds.id + '.requiredFacts'); } catch (error) {
          diagnostics.push(makeDiagnostic({ severity: 'error', code: 'DANGEROUS_DSL_PATH', message: error.message, phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.requiredFacts[' + i + ']' }));
        }
      });
    }
  }
  if (!Array.isArray(ds.rules) || ds.rules.some((ref) => typeof ref !== 'string' || !ref)) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_RULE_REFS', message: 'rules must be an array of non-empty strings', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.rules' }));
  if (!isObject(ds.defaultDecision)) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'INVALID_DEFAULT_DECISION', message: 'defaultDecision must be an object', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.defaultDecision' }));
  else {
    if (typeof ds.defaultDecision.decision !== 'string' || !ds.defaultDecision.decision) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_DEFAULT_DECISION', message: 'defaultDecision.decision must be a non-empty string', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.defaultDecision.decision' }));
    if (typeof ds.defaultDecision.reason !== 'string' || !ds.defaultDecision.reason) diagnostics.push(makeDiagnostic({ severity: 'error', code: 'MISSING_DEFAULT_REASON', message: 'defaultDecision.reason must be a non-empty string', phase: 'schema_validation', artifactId: ds.id, entrypointId: ds.id, path: '$decisionSet:' + ds.id + '.defaultDecision.reason' }));
  }
}

function analyzeEntrypoints(entrypoints, diagnostics) {
  for (const ds of entrypoints.values()) {
    for (let j = 1; j < ds.rules.length; j += 1) {
      const candidate = ds.rules[j];
      const candidateMap = new Map(candidate.conditions.map((c) => [c.path, c.expected]));
      for (let i = 0; i < j; i += 1) {
        const earlier = ds.rules[i];
        const subsumes = earlier.conditions.every((condition) => candidateMap.has(condition.path) && candidateMap.get(condition.path) === condition.expected);
        if (subsumes) {
          diagnostics.push(makeDiagnostic({
            severity: 'warning',
            code: 'UNREACHABLE_RULE',
            message: 'Rule "' + candidate.ruleId + '" is unreachable because earlier rule "' + earlier.ruleId + '" already subsumes it',
            phase: 'analysis',
            artifactId: ds.id,
            entrypointId: ds.id,
            ruleId: candidate.ruleId,
            details: { earlierRuleId: earlier.ruleId, earlierIndex: i, candidateIndex: j },
          }));
          break;
        }
      }
    }
  }
}

function resolveRuleRef(ref, decisionSetId) {
  if (ref.includes('.')) return ref;
  return decisionSetId + '.' + ref;
}

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isJsonScalar(value) { return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'; }
function throwIfErrors(diagnostics) { if (diagnostics.some((d) => d.severity === 'error')) throw new CompilationError(diagnostics); }
function mapCloneErrorCode(error) { if (error.code === 'CYCLE_DETECTED') return 'CYCLE_DETECTED'; if (error.code === 'DANGEROUS_KEY') return 'DANGEROUS_KEY'; return 'NON_JSON_SAFE'; }
function findArtifactIndex(artifacts, id) { return artifacts.findIndex((a) => a && a.id === id); }

module.exports = { compile, resolveRuleRef };
