'use strict';

const { makeDiagnostic, hasErrors } = require('./errors');

const ALLOWED_TOP_LEVEL_FIELDS = new Set(['decisionSetId', 'version', 'title', 'description', 'cases', 'default', 'metadata']);
const ALLOWED_CASE_FIELDS = new Set(['id', 'title', 'description', 'when', 'then', 'metadata']);
const ALLOWED_THEN_FIELDS = new Set(['outcome', 'reason', 'metadata', 'tags']);
const FORBIDDEN_FIELDS = new Set(['artifacts', 'patchPlanFrom', 'patchPlan', 'entrypointId', 'rules']);
const SINGLE_OPERATOR_FORMS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'exists', 'missing', 'eqFact', 'neqFact', 'gtFact', 'gteFact', 'ltFact', 'lteFact']);
const NUMERIC_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const FACT_REF_OPS = new Set(['eqFact', 'neqFact', 'gtFact', 'gteFact', 'ltFact', 'lteFact']);
const SCALAR_TYPES = new Set(['string', 'number', 'boolean']);

function validateDecisionsSource(source) {
  const diagnostics = [];

  if (!isPlainObject(source)) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_SOURCE_INVALID', level: 'error', message: 'source must be a non-null plain object' }));
    return { ok: false, diagnostics };
  }

  for (const key of Object.keys(source)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      diagnostics.push(makeDiagnostic({ code: key === 'patchPlanFrom' || key === 'patchPlan' ? 'DECISIONS_PATCH_PLAN_FORBIDDEN' : 'DECISIONS_SOURCE_FORBIDDEN_FIELD', level: 'error', message: `Field "${key}" is not allowed in decisions v2 source`, path: key }));
    } else if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_SOURCE_FORBIDDEN_FIELD', level: 'error', message: `Unknown top-level field "${key}"`, path: key }));
    }
  }

  if (typeof source.decisionSetId !== 'string' || !source.decisionSetId.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_DECISION_SET_ID_MISSING', level: 'error', message: 'decisionSetId must be a non-empty string', path: 'decisionSetId' }));
  }
  if (typeof source.version !== 'string' || !source.version.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_VERSION_MISSING', level: 'error', message: 'version must be a non-empty string', path: 'version' }));
  }
  if (typeof source.title !== 'string' || !source.title.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_TITLE_MISSING', level: 'error', message: 'title must be a non-empty string', path: 'title' }));
  }
  if (typeof source.description !== 'string' || !source.description.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_DESCRIPTION_MISSING', level: 'error', message: 'description must be a non-empty string', path: 'description' }));
  }
  validateMetadata(source.metadata, 'metadata', diagnostics);

  if (!Array.isArray(source.cases) || source.cases.length === 0) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASES_MISSING', level: 'error', message: 'cases must be a non-empty array', path: 'cases' }));
  } else {
    const seenCaseIds = new Map();
    for (let i = 0; i < source.cases.length; i++) {
      const decisionCase = source.cases[i];
      validateCase(decisionCase, `cases[${i}]`, diagnostics);
      if (isPlainObject(decisionCase) && typeof decisionCase.id === 'string' && decisionCase.id.trim()) {
        const id = decisionCase.id.trim();
        if (seenCaseIds.has(id)) {
          diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_ID_DUPLICATE', level: 'error', message: `case.id must be unique within one decision set: ${id}`, path: `cases[${i}].id`, details: { id, firstPath: `cases[${seenCaseIds.get(id)}].id` } }));
        } else {
          seenCaseIds.set(id, i);
        }
      }
    }
  }

  if (!isPlainObject(source.default)) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_DEFAULT_MISSING', level: 'error', message: 'default must be an object with outcome', path: 'default' }));
  } else {
    validateThen(source.default, 'default', diagnostics);
  }

  return { ok: !hasErrors(diagnostics), diagnostics };
}

function validateCase(decisionCase, path, diagnostics) {
  if (!isPlainObject(decisionCase)) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_ID_MISSING', level: 'error', message: 'case must be an object', path }));
    return;
  }
  for (const key of Object.keys(decisionCase)) {
    if (key === 'patchPlanFrom' || key === 'patchPlan') {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_PATCH_PLAN_FORBIDDEN', level: 'error', message: `Field "${key}" is not allowed in decision case`, path: `${path}.${key}` }));
    } else if (!ALLOWED_CASE_FIELDS.has(key)) {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_SOURCE_FORBIDDEN_FIELD', level: 'error', message: `Unknown case field "${key}"`, path: `${path}.${key}` }));
    }
  }
  if (typeof decisionCase.id !== 'string' || !decisionCase.id.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_ID_MISSING', level: 'error', message: 'case.id must be a non-empty string', path: `${path}.id` }));
  }
  if (typeof decisionCase.title !== 'string' || !decisionCase.title.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_TITLE_MISSING', level: 'error', message: 'case.title must be a non-empty string', path: `${path}.title` }));
  }
  if (typeof decisionCase.description !== 'string' || !decisionCase.description.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_DESCRIPTION_MISSING', level: 'error', message: 'case.description must be a non-empty string', path: `${path}.description` }));
  }
  if (!isPlainObject(decisionCase.when) || Object.keys(decisionCase.when).length === 0) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_WHEN_MISSING', level: 'error', message: 'case.when must be a non-empty object', path: `${path}.when` }));
  } else {
    for (const [factPath, condition] of Object.entries(decisionCase.when)) {
      validateFactPath(factPath, `${path}.when.${factPath}`, diagnostics);
      validateCondition(condition, factPath, `${path}.when.${factPath}`, diagnostics);
    }
  }
  if (!isPlainObject(decisionCase.then)) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CASE_THEN_MISSING', level: 'error', message: 'case.then must be an object', path: `${path}.then` }));
  } else {
    validateThen(decisionCase.then, `${path}.then`, diagnostics);
  }
  validateMetadata(decisionCase.metadata, `${path}.metadata`, diagnostics);
}

function validateFactPath(factPath, path, diagnostics) {
  if (typeof factPath !== 'string' || !factPath.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_FACT_REF_INVALID', level: 'error', message: 'fact path must be a non-empty string', path }));
    return;
  }
  if (factPath.startsWith('$.') || factPath.includes('[*]')) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_RAW_PATH_FORBIDDEN', level: 'error', message: `Condition key "${factPath}" looks like a raw path. decisions v2 conditions must use fact names, not ProcessState/raw payload paths.`, path }));
  }
  if (factPath.includes('__proto__') || factPath.includes('prototype') || factPath.includes('constructor')) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_FACT_REF_INVALID', level: 'error', message: `Condition fact path "${factPath}" is forbidden`, path }));
  }
}

function validateCondition(condition, factPath, path, diagnostics) {
  if (isJsonScalar(condition)) {
    return;
  }

  if (!isPlainObject(condition)) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_OPERATOR_INVALID', level: 'error', message: `Condition for "${factPath}" must be a scalar or operator object`, path }));
    return;
  }

  const keys = Object.keys(condition);
  const ops = keys.filter(k => SINGLE_OPERATOR_FORMS.has(k));
  const unknownOps = keys.filter(k => !SINGLE_OPERATOR_FORMS.has(k));

  if (unknownOps.length > 0) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_OPERATOR_INVALID', level: 'error', message: `Unknown condition operator(s): ${unknownOps.join(', ')}`, path, details: { unknown: unknownOps } }));
  }
  if (ops.length > 1) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_MULTIPLE_OPERATORS', level: 'error', message: `Condition for "${factPath}" must contain exactly one operator, found: ${ops.join(', ')}`, path, details: { operators: ops } }));
  }
  if (ops.length === 0 && unknownOps.length === 0) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_OPERATOR_INVALID', level: 'error', message: `Condition for "${factPath}" is an empty object`, path }));
  }

  for (const op of ops) {
    const val = condition[op];
    if ((op === 'exists' || op === 'missing') && val !== true) {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_EXPECTED_TYPE_INVALID', level: 'error', message: `Operator "${op}" expects true`, path, details: { operator: op } }));
    }
    if (NUMERIC_OPS.has(op) && typeof val !== 'number') {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_EXPECTED_TYPE_INVALID', level: 'error', message: `Operator "${op}" expects a number`, path, details: { operator: op, expected: 'number', got: typeof val } }));
    }
    if (FACT_REF_OPS.has(op)) {
      if (typeof val !== 'string' || !val.trim() || val.startsWith('$.') || val.includes('[*]')) {
        diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_FACT_REF_INVALID', level: 'error', message: `Operator "${op}" expects a non-empty fact name string`, path, details: { operator: op } }));
      }
    }
    if (op === 'in' || op === 'notIn') {
      if (!Array.isArray(val) || val.length === 0) {
        diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_EMPTY_IN_SET', level: 'error', message: `Operator "${op}" expects a non-empty array`, path, details: { operator: op } }));
      } else if (!val.every(isJsonScalar)) {
        diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_EXPECTED_TYPE_INVALID', level: 'error', message: `Operator "${op}" expects an array of JSON scalar values`, path, details: { operator: op } }));
      }
    }
    if ((op === 'eq' || op === 'neq') && !isJsonScalar(val)) {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_CONDITION_EXPECTED_TYPE_INVALID', level: 'error', message: `Operator "${op}" expects a JSON scalar`, path, details: { operator: op } }));
    }
  }
}

function validateThen(then, path, diagnostics) {
  for (const key of Object.keys(then)) {
    if (key === 'patchPlanFrom' || key === 'patchPlan') {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_PATCH_PLAN_FORBIDDEN', level: 'error', message: `Field "${key}" is not allowed in DecisionThen`, path: `${path}.${key}` }));
    } else if (!ALLOWED_THEN_FIELDS.has(key)) {
      diagnostics.push(makeDiagnostic({ code: 'DECISIONS_SOURCE_FORBIDDEN_FIELD', level: 'error', message: `Unknown then field "${key}"`, path: `${path}.${key}` }));
    }
  }
  if (typeof then.outcome !== 'string' || !then.outcome.trim()) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_OUTCOME_MISSING', level: 'error', message: 'then.outcome must be a non-empty string', path: `${path}.outcome` }));
  }
  if (then.reason !== undefined && typeof then.reason !== 'string') {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_THEN_INVALID', level: 'error', message: 'then.reason must be a string when present', path: `${path}.reason` }));
  }
  validateMetadata(then.metadata, `${path}.metadata`, diagnostics);
  if (then.tags !== undefined && (!Array.isArray(then.tags) || !then.tags.every(t => typeof t === 'string'))) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_THEN_INVALID', level: 'error', message: 'then.tags must be an array of strings when present', path: `${path}.tags` }));
  }
}


function validateMetadata(metadata, path, diagnostics) {
  if (metadata === undefined) return;
  if (!isPlainObject(metadata) || !isJsonSafe(metadata)) {
    diagnostics.push(makeDiagnostic({ code: 'DECISIONS_METADATA_INVALID', level: 'error', message: 'metadata must be a JSON-safe plain object', path }));
  }
}

function isJsonScalar(value) {
  return value === null || SCALAR_TYPES.has(typeof value) && (typeof value !== 'number' || Number.isFinite(value));
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJsonSafe(value) {
  const seen = new WeakSet();
  function check(v) {
    if (v === null) return true;
    const t = typeof v;
    if (t === 'string' || t === 'boolean') return true;
    if (t === 'number') return Number.isFinite(v);
    if (t !== 'object') return false;
    if (seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.every(check);
    if (!isPlainObject(v)) return false;
    return Object.entries(v).every(([k, child]) => typeof k === 'string' && check(child));
  }
  return check(value);
}

module.exports = { validateDecisionsSource, isJsonSafe, isPlainObject };
