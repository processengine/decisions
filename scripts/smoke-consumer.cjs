'use strict';

const path = require('node:path');
const pkg = require(process.argv[2] || path.join(__dirname, '..'));

const definition = {
  artifacts: [
    { id: 'set.r', type: 'decision-rule', description: 'r', when: { a: 1 }, then: { decision: 'OK', reason: 'matched' } },
    { id: 'set', type: 'decision-set', description: 'set', version: '1', mode: 'first_match_wins', rules: ['set.r'], defaultDecision: { decision: 'D', reason: 'default' } }
  ]
};

const compiled = pkg.compile(definition);
const result = pkg.evaluate(compiled, 'set', { a: 1 });
if (result.status !== 'MATCHED' || result.decision !== 'OK') {
  throw new Error('smoke consumer failed');
}
console.log('smoke consumer ok');
