'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDecisions, prepareDecisions, executeDecisions } = require('../index');
const { validSource } = require('./helpers');

test('dangerous key in DSL is rejected', () => {
  const r = validateDecisions({ ...validSource, cases: [{ ...validSource.cases[0], when: { '__proto__.x': 1 } }] });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_CONDITION_FACT_REF_INVALID'));
});

test('facts with dangerous prototype/cycles/non-json values are rejected', () => {
  const artifact = prepareDecisions(validSource);
  const unsafeProto = Object.create({ inherited: true });
  unsafeProto.a = 1;
  assert.throws(() => executeDecisions(artifact, unsafeProto), /facts must be a JSON-safe object|facts must be/);
  const cyclic = { a: 1 }; cyclic.self = cyclic;
  assert.throws(() => executeDecisions(artifact, cyclic), e => e.code === 'DECISIONS_INPUT_NOT_JSON_SAFE');
  assert.throws(() => executeDecisions(artifact, { a: NaN }), e => e.code === 'DECISIONS_INPUT_NOT_JSON_SAFE');
});

test('unexpected DSL fields are rejected', () => {
  const r = validateDecisions({ ...validSource, typoField: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === 'DECISIONS_SOURCE_FORBIDDEN_FIELD'));
});
