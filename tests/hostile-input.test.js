'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, evaluate } = require('../index');
const { makeDefinition } = require('./helpers');

test('dangerous key in DSL is rejected', () => {
  const definition = { artifacts: [{ id: 'r', type: 'decision-rule', description: 'r', when: { '__proto__.x': 1 }, then: { decision: 'A', reason: 'a' } }] };
  assert.throws(() => compile(definition), /DANGEROUS_DSL_PATH/);
});



test('dangerous top-level key in facts returns ABORT instead of throw', () => {
  const compiled = compile(makeDefinition());
  const facts = Object.create(null);
  Object.defineProperty(facts, '__proto__', { value: Object.create(null), enumerable: true, configurable: true });
  const result = evaluate(compiled, 'route.main', facts);
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'DANGEROUS_FACT_KEY');
});

test('dangerous key in facts returns dedicated runtime code', () => {
  const compiled = compile(makeDefinition());
  const facts = Object.create(null);
  facts.request = Object.create(null);
  facts.request.channel = 'web';
  Object.defineProperty(facts.request, '__proto__', { value: 'x', enumerable: true, configurable: true });
  const result = evaluate(compiled, 'route.main', facts);
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'DANGEROUS_FACT_KEY');
});

test('cycle in facts is rejected safely', () => {
  const compiled = compile(makeDefinition());
  const facts = { request: { channel: 'web' } };
  facts.request.self = facts.request;
  const result = evaluate(compiled, 'route.main', facts);
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'FACTS_CYCLE_DETECTED');
});

test('non json safe facts are rejected safely', () => {
  const compiled = compile(makeDefinition());
  const result = evaluate(compiled, 'route.main', { request: { channel: 'web', value: NaN } });
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'FACTS_NOT_JSON_SAFE');
});

test('unexpected DSL fields are rejected', () => {
  const definition = { artifacts: [{ id: 'set', type: 'decision-set', description: 's', version: '1', mode: 'first_match_wins', rules: [], defaultDecision: { decision: 'D', reason: 'd' }, typoField: 1 }] };
  assert.throws(() => compile(definition), /UNKNOWN_FIELD/);
});
