'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDecisions, prepareDecisions, executeDecisions, DecisionsRuntimeError } = require('../index');
const { validSource } = require('./helpers');

test('invalid prepared artifact is rejected defensively', () => {
  assert.throws(() => executeDecisions({ artifactType: 'decisions', version: 'v1' }, {}), e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_INVALID_ARTIFACT_VERSION');
  assert.throws(() => executeDecisions({ artifactType: 'decisions', version: 'v2', decisionSetId: 'd', compiledCases: [{}], default: { outcome: 'D' } }, {}), e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_PREPARED_ARTIFACT_INVALID');
  assert.throws(() => executeDecisions({ artifactType: 'decisions', version: 'v2', decisionSetId: 'd', compiledCases: [], default: null }, {}), e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_PREPARED_ARTIFACT_INVALID');
});

test('default is selected when no case matches', () => {
  const result = executeDecisions(prepareDecisions(validSource), { clientMatchCount: 1, ownServiceClientCount: 0 });
  assert.equal(result.output.outcome, validSource.default.outcome);
});

test('empty cases is a compile error, not an always-default shortcut', () => {
  const r = validateDecisions({ ...validSource, cases: [] });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_CASES_MISSING'));
});

test('executeDecisions: invalid execution options throw typed runtime errors', () => {
  const a = prepareDecisions(validSource);
  for (const options of [null, [], 'x', 1, true]) {
    assert.throws(
      () => executeDecisions(a, { clientMatchCount: 0 }, options),
      e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_EXECUTION_OPTIONS_INVALID',
      `options=${String(options)}`
    );
  }
  assert.throws(
    () => executeDecisions(a, { clientMatchCount: 0 }, { trace: 'off', future: true }),
    e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_EXECUTION_OPTIONS_INVALID'
  );
});

test('executeDecisions: malformed prepared artifact then/default/condition shapes are rejected', () => {
  const base = {
    artifactType: 'decisions',
    version: 'v2',
    decisionSetId: 'd',
    compiledCases: [{
      id: 'c',
      conditions: [{ factPath: 'ok', operator: 'eq', expected: true }],
      then: { outcome: 'Y' }
    }],
    default: { outcome: 'N' }
  };
  const badArtifacts = [
    { ...base, compiledCases: [{ ...base.compiledCases[0], conditions: [] }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], then: { outcome: 'Y', tags: 'oops' } }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], then: { outcome: 'Y', metadata: [] } }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], then: { outcome: 'Y', reason: 1 } }] },
    { ...base, default: { outcome: 'N', tags: 'oops' } },
    { ...base, default: { outcome: 'N', metadata: [] } },
    { ...base, compiledCases: [{ ...base.compiledCases[0], conditions: [{ factPath: 'ok', operator: 'in', expected: 'not-array' }] }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], conditions: [{ factPath: '$.raw', operator: 'eq', expected: true }] }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], conditions: [{ factPath: 'ok', operator: 'gt', expected: Number.NaN }] }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], conditions: [{ factPath: 'ok', operator: 'exists', expected: false }] }] },
    { ...base, compiledCases: [{ ...base.compiledCases[0], conditions: [{ factPath: 'ok', operator: 'eqFact', expected: '$.raw' }] }] },
  ];
  for (const artifact of badArtifacts) {
    assert.throws(
      () => executeDecisions(artifact, { ok: true }, { trace: 'verbose' }),
      e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_PREPARED_ARTIFACT_INVALID'
    );
  }
});

test('executeDecisions: verbose trace never leaks raw JSON serialization errors', () => {
  const artifact = {
    artifactType: 'decisions',
    version: 'v2',
    decisionSetId: 'd',
    compiledCases: [{
      id: 'c',
      conditions: [{ factPath: 'ok', operator: 'eq', expected: true }],
      then: { outcome: 'Y', metadata: { x: 1n } }
    }],
    default: { outcome: 'N' }
  };
  assert.throws(
    () => executeDecisions(artifact, { ok: true }, { trace: 'verbose' }),
    e => e instanceof DecisionsRuntimeError && e.code === 'DECISIONS_PREPARED_ARTIFACT_INVALID'
  );
});

test('public runtime boundary does not leak raw built-in errors for known hostile inputs', () => {
  const a = prepareDecisions(validSource);
  const cyclic = {}; cyclic.self = cyclic;
  const calls = [
    () => executeDecisions(a, cyclic),
    () => executeDecisions(a, { clientMatchCount: 0 }, null),
    () => executeDecisions({ artifactType: 'decisions', version: 'v2', decisionSetId: 'd', compiledCases: [{ id: 'c', conditions: [], then: { outcome: 'Y' } }], default: { outcome: 'N' } }, {}),
    () => executeDecisions(a, { clientMatchCount: 0 }, { trace: 'verbose', unsupported: true }),
  ];
  for (const call of calls) {
    assert.throws(call, e => {
      assert.ok(e instanceof DecisionsRuntimeError, `expected DecisionsRuntimeError, got ${e && e.name}`);
      assert.notEqual(e.name, 'TypeError');
      assert.notEqual(e.name, 'RangeError');
      assert.notEqual(e.name, 'SyntaxError');
      return true;
    });
  }
});
