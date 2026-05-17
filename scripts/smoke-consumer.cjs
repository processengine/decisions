'use strict';

const path = require('node:path');
const pkg = require(process.argv[2] || path.join(__dirname, '..'));

const source = {
  decisionSetId: 'decisions.consumer.smoke',
  version: '2.0.0',
  title: 'Consumer smoke decision set',
  description: 'Checks the public CommonJS API from an installed package.',
  cases: [
    { id: 'ok', title: 'OK', description: 'Matches ok=true.', when: { ok: true }, then: { outcome: 'OK' } }
  ],
  default: { outcome: 'DEFAULT' }
};

const validation = pkg.validateDecisions(source);
if (!validation.ok) throw new Error('validateDecisions failed');
const artifact = pkg.prepareDecisions(source);
const result = pkg.executeDecisions(artifact, { ok: true });
if (result.output.outcome !== 'OK') throw new Error('smoke consumer failed');
console.log('smoke consumer ok');
