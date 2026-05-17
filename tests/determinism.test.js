'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareDecisions, executeDecisions } = require('../index');
const { validSource } = require('./helpers');

test('same prepared artifact and same facts choose same outcome', () => {
  const artifact = prepareDecisions(validSource);
  const facts = { ownServiceClientCount: 0, clientMatchCount: 3 };
  assert.deepEqual(executeDecisions(artifact, facts), executeDecisions(artifact, facts));
});

test('trace mode does not change selected outcome', () => {
  const artifact = prepareDecisions(validSource);
  const facts = { ownServiceClientCount: 0, clientMatchCount: 3 };
  assert.equal(executeDecisions(artifact, facts).output.outcome, executeDecisions(artifact, facts, { trace: 'basic' }).output.outcome);
});

test('case order is the only tie breaker', () => {
  const source = { ...validSource, cases: [
    { id: 'first', title: 'first', description: 'first', when: { a: 1 }, then: { outcome: 'FIRST' } },
    { id: 'second', title: 'second', description: 'second', when: { a: 1 }, then: { outcome: 'SECOND' } },
  ] };
  const result = executeDecisions(prepareDecisions(source), { a: 1 });
  assert.equal(result.output.outcome, 'FIRST');
});
