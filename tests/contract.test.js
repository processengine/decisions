'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateDecisions,
  prepareDecisions,
  executeDecisions,
  DecisionsCompileError,
  DecisionsRuntimeError,
  formatDecisionsDiagnostics,
} = require('../index');

const { validSource } = require('./helpers');

function withCase(patch) {
  return { ...validSource, cases: [{ ...validSource.cases[0], ...patch }] };
}

test('validateDecisions: valid source returns ok=true', () => {
  const r = validateDecisions(validSource);
  assert.equal(r.ok, true, formatDecisionsDiagnostics(r.diagnostics));
});

test('validateDecisions: rejects null', () => {
  const r = validateDecisions(null);
  assert.equal(r.ok, false);
});

test('validateDecisions: rejects forbidden old fields', () => {
  for (const field of ['artifacts', 'rules', 'patchPlanFrom', 'patchPlan', 'entrypointId']) {
    const r = validateDecisions({ ...validSource, [field]: field === 'rules' ? [] : 'x' });
    assert.equal(r.ok, false, field);
  }
});

test('validateDecisions: rejects missing required top-level fields', () => {
  const checks = [
    ['decisionSetId', '', 'DECISIONS_DECISION_SET_ID_MISSING'],
    ['version', '', 'DECISIONS_VERSION_MISSING'],
    ['title', '', 'DECISIONS_TITLE_MISSING'],
    ['description', '', 'DECISIONS_DESCRIPTION_MISSING'],
  ];
  for (const [key, value, code] of checks) {
    const r = validateDecisions({ ...validSource, [key]: value });
    assert.equal(r.ok, false, key);
    assert.ok(r.diagnostics.some(d => d.code === code), code);
  }
});

test('validateDecisions: rejects empty cases array', () => {
  const r = validateDecisions({ ...validSource, cases: [] });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_CASES_MISSING'));
});

test('validateDecisions: rejects missing default/outcome', () => {
  const { default: _d, ...rest } = validSource;
  let r = validateDecisions(rest);
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_DEFAULT_MISSING'));

  r = validateDecisions({ ...validSource, default: { reason: 'x' } });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_OUTCOME_MISSING'));
});

test('validateDecisions: rejects invalid case fields', () => {
  const checks = [
    [{ id: '' }, 'DECISIONS_CASE_ID_MISSING'],
    [{ title: '' }, 'DECISIONS_CASE_TITLE_MISSING'],
    [{ description: '' }, 'DECISIONS_CASE_DESCRIPTION_MISSING'],
    [{ when: {} }, 'DECISIONS_CASE_WHEN_MISSING'],
    [{ then: {} }, 'DECISIONS_OUTCOME_MISSING'],
  ];
  for (const [patch, code] of checks) {
    const r = validateDecisions(withCase(patch));
    assert.equal(r.ok, false, code);
    assert.ok(r.diagnostics.some(d => d.code === code), code);
  }
});

test('validateDecisions: rejects raw payload paths and dangerous fact names', () => {
  let r = validateDecisions(withCase({ when: { '$.clients[*]': { eq: 1 } } }));
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_RAW_PATH_FORBIDDEN'));

  r = validateDecisions(withCase({ when: { '__proto__.x': 1 } }));
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_CONDITION_FACT_REF_INVALID'));
});

test('validateDecisions: validates condition operators', () => {
  const cases = [
    [{ count: { gt: 0, lt: 10 } }, 'DECISIONS_CONDITION_MULTIPLE_OPERATORS'],
    [{ count: { between: [0, 10] } }, 'DECISIONS_CONDITION_OPERATOR_INVALID'],
    [{ kind: { in: [] } }, 'DECISIONS_CONDITION_EMPTY_IN_SET'],
    [{ count: { gt: 'x' } }, 'DECISIONS_CONDITION_EXPECTED_TYPE_INVALID'],
    [{ a: { eqFact: '$.raw' } }, 'DECISIONS_CONDITION_FACT_REF_INVALID'],
    [{ a: { exists: false } }, 'DECISIONS_CONDITION_EXPECTED_TYPE_INVALID'],
  ];
  for (const [when, code] of cases) {
    const r = validateDecisions(withCase({ when }));
    assert.equal(r.ok, false, code);
    assert.ok(r.diagnostics.some(d => d.code === code), code);
  }
});


test('validateDecisions: metadata must be a JSON-safe plain object', () => {
  for (const patch of [
    { metadata: 'x' },
    { cases: [{ ...validSource.cases[0], metadata: [] }] },
    { cases: [{ ...validSource.cases[0], then: { ...validSource.cases[0].then, metadata: 1 } }] },
    { default: { ...validSource.default, metadata: [] } },
  ]) {
    const r = validateDecisions({ ...validSource, ...patch });
    assert.equal(r.ok, false);
    assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_METADATA_INVALID'));
  }
});

test('validateDecisions: rejects duplicate case ids', () => {
  const r = validateDecisions({ ...validSource, cases: [validSource.cases[0], { ...validSource.cases[1], id: validSource.cases[0].id }] });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_CASE_ID_DUPLICATE'));
});

test('validateDecisions: accepts short equality form', () => {
  const r = validateDecisions(withCase({ when: { status: 'SUCCESS' } }));
  assert.equal(r.ok, true, formatDecisionsDiagnostics(r.diagnostics));
});

test('prepareDecisions: returns immutable artifact with cases', () => {
  const a = prepareDecisions(validSource);
  assert.equal(a.artifactType, 'decisions');
  assert.equal(a.version, 'v2');
  assert.equal(a.decisionSetId, validSource.decisionSetId);
  assert.ok(Array.isArray(a.compiledCases));
  assert.equal(a.compiledCases.length, validSource.cases.length);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.compiledCases));
  assert.deepEqual(a.getDefinition(), validSource);
});

test('prepareDecisions: throws DecisionsCompileError on invalid source', () => {
  assert.throws(() => prepareDecisions({ ...validSource, cases: [] }), e => e instanceof DecisionsCompileError && e.code === 'DECISIONS_COMPILE_ERROR');
});

test('executeDecisions: matches first matching case', () => {
  const a = prepareDecisions(validSource);
  const r = executeDecisions(a, { ownServiceClientCount: 1, clientMatchCount: 2 });
  assert.equal(r.output.outcome, 'FOUND_OWN_SERVICE');
  assert.equal(r.output.matchedCaseId, 'single_own_service_client');
  assert.equal(r.output.decisionSetId, validSource.decisionSetId);
});

test('executeDecisions: falls through to later cases and default', () => {
  const a = prepareDecisions(validSource);
  assert.equal(executeDecisions(a, { clientMatchCount: 3, ownServiceClientCount: 0 }).output.outcome, 'AMBIGUOUS');
  assert.equal(executeDecisions(a, { clientMatchCount: 0 }).output.outcome, 'NOT_FOUND');
  const d = executeDecisions(a, { clientMatchCount: 1, ownServiceClientCount: 0 });
  assert.equal(d.output.outcome, 'TECHNICAL_ERROR');
  assert.equal(d.output.matchedCaseId, undefined);
});

test('executeDecisions: supports condition operators', () => {
  const source = {
    ...validSource,
    cases: [
      { id: 'ops', title: 'ops', description: 'ops', when: {
        gt: { gt: 1 }, gte: { gte: 2 }, lt: { lt: 3 }, lte: { lte: 2 },
        kind: { in: ['A', 'B'] }, other: { notIn: ['X'] },
        presentNull: { exists: true }, missingValue: { missing: true },
        softCount: { eqFact: 'warningCount' }, critical: { ltFact: 'warningCount' }
      }, then: { outcome: 'OPS' } },
    ],
  };
  const a = prepareDecisions(source);
  const r = executeDecisions(a, { gt: 2, gte: 2, lt: 2, lte: 2, kind: 'A', other: 'Y', presentNull: null, softCount: 4, warningCount: 4, critical: 1 });
  assert.equal(r.output.outcome, 'OPS');
});

test('executeDecisions: exists treats null/false/0/empty string as present', () => {
  const source = { ...validSource, cases: [{ id: 'exists', title: 'exists', description: 'exists', when: { a: { exists: true }, b: { exists: true }, c: { exists: true }, d: { exists: true } }, then: { outcome: 'EXISTS' } }] };
  const r = executeDecisions(prepareDecisions(source), { a: null, b: false, c: 0, d: '' });
  assert.equal(r.output.outcome, 'EXISTS');
});

test('executeDecisions: throws typed runtime errors for invalid runtime inputs', () => {
  const a = prepareDecisions(validSource);
  assert.throws(() => executeDecisions({}, {}), e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_INVALID_ARTIFACT_VERSION');
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => executeDecisions(a, cyclic), e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_INPUT_NOT_JSON_SAFE');
});

test('executeDecisions: missing fact refs and type mismatch throw typed errors', () => {
  const a = prepareDecisions({ ...validSource, cases: [{ id: 'bad', title: 'bad', description: 'bad', when: { a: { gtFact: 'b' } }, then: { outcome: 'BAD' } }] });
  assert.throws(() => executeDecisions(a, { a: 1 }), e => e.code === 'DECISIONS_CONDITION_FACT_REF_MISSING');
  assert.throws(() => executeDecisions(a, { a: '1', b: 2 }), e => e.code === 'DECISIONS_CONDITION_TYPE_MISMATCH');
});


test('executeDecisions: scalar operators reject object and array facts', () => {
  const scalarOps = [
    ['eq', { eq: 'X' }],
    ['neq', { neq: 'X' }],
    ['in', { in: ['X'] }],
    ['notIn', { notIn: ['X'] }],
  ];
  for (const [name, condition] of scalarOps) {
    const a = prepareDecisions({ ...validSource, cases: [{ id: `case_${name}`, title: name, description: name, when: { fact: condition }, then: { outcome: 'MATCH' } }] });
    assert.throws(() => executeDecisions(a, { fact: { value: 'X' } }), e => e.code === 'DECISIONS_CONDITION_TYPE_MISMATCH', name);
    assert.throws(() => executeDecisions(a, { fact: ['X'] }), e => e.code === 'DECISIONS_CONDITION_TYPE_MISMATCH', name);
  }
});

test('executeDecisions: scalar fact comparisons reject object and array facts', () => {
  const a = prepareDecisions({ ...validSource, cases: [{ id: 'eq_fact', title: 'eq fact', description: 'eq fact', when: { a: { eqFact: 'b' } }, then: { outcome: 'MATCH' } }] });
  assert.throws(() => executeDecisions(a, { a: { value: 1 }, b: 1 }), e => e.code === 'DECISIONS_CONDITION_TYPE_MISMATCH');
  assert.throws(() => executeDecisions(a, { a: 1, b: [1] }), e => e.code === 'DECISIONS_CONDITION_TYPE_MISMATCH');
});

test('executeDecisions: trace is optional, JSON-safe, and contains operator details', () => {
  const a = prepareDecisions(validSource);
  assert.equal(executeDecisions(a, { clientMatchCount: 0 }).trace, undefined);
  assert.equal(executeDecisions(a, { clientMatchCount: 0 }, { trace: 'off' }).trace, undefined);
  const r = executeDecisions(a, { ownServiceClientCount: 0, clientMatchCount: 0 }, { trace: 'basic' });
  assert.ok(Array.isArray(r.trace));
  assert.ok(r.trace.some(e => e.kind === 'DECISION_CASE_EVALUATED'));
  const failed = r.trace.find(e => e.details && Array.isArray(e.details.failedConditions));
  assert.ok(failed.details.failedConditions.some(c => c.operator === 'eq' || c.operator === 'gte'));
  JSON.stringify(r.trace);
});


test('executeDecisions: rejects invalid trace mode instead of guessing', () => {
  const a = prepareDecisions(validSource);
  for (const trace of [false, true, 'bad', null, 1, {}]) {
    assert.throws(
      () => executeDecisions(a, { clientMatchCount: 0 }, { trace }),
      e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_TRACE_MODE_INVALID',
      `trace=${String(trace)}`
    );
  }
});

test('executeDecisions: verbose trace includes input/output', () => {
  const a = prepareDecisions(validSource);
  const r = executeDecisions(a, { clientMatchCount: 0 }, { trace: 'verbose' });
  assert.ok(r.trace.some(e => e.input));
  assert.ok(r.trace.some(e => e.output));
});
