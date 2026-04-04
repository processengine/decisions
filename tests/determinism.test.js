'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, evaluate } = require('../index');
const { makeDefinition } = require('./helpers');

test('same compiled artifact and same facts give same result', () => {
  const compiled = compile(makeDefinition());
  const facts = { request: { risk: 'low', channel: 'web' } };
  assert.deepEqual(evaluate(compiled, 'route.main', facts), evaluate(compiled, 'route.main', facts));
});

test('trace true and trace false choose the same decision', () => {
  const compiled = compile(makeDefinition());
  const facts = { request: { risk: 'low', channel: 'web' } };
  const withTrace = evaluate(compiled, 'route.main', facts, { trace: true });
  const withoutTrace = evaluate(compiled, 'route.main', facts, { trace: false });
  assert.equal(withTrace.status, withoutTrace.status);
  assert.equal(withTrace.decision, withoutTrace.decision);
  assert.equal(withTrace.reason, withoutTrace.reason);
});

test('rule order is the only tie breaker', () => {
  const definition = {
    artifacts: [
      { id: 'set.r1', type: 'decision-rule', description: 'r1', when: { a: 1 }, then: { decision: 'ONE', reason: 'one' } },
      { id: 'set.r2', type: 'decision-rule', description: 'r2', when: { a: 1 }, then: { decision: 'TWO', reason: 'two' } },
      { id: 'set', type: 'decision-set', description: 'set', version: '1', mode: 'first_match_wins', rules: ['set.r1', 'set.r2'], defaultDecision: { decision: 'D', reason: 'd' } }
    ]
  };
  const compiled = compile(definition);
  const result = evaluate(compiled, 'set', { a: 1 });
  assert.equal(result.decision, 'ONE');
});
