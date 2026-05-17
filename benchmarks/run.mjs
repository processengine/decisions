import pkg from '../index.js';
const { validateDecisions, prepareDecisions, executeDecisions, formatDecisionsDiagnostics } = pkg;

const source = {
  decisionSetId: 'route.main',
  version: '2.0.0',
  title: 'Main route',
  description: 'Selects a route by risk level.',
  cases: [
    { id: 'route.main.low', title: 'Low risk', description: 'Approves low risk.', when: { riskLevel: 'low' }, then: { outcome: 'APPROVE', reason: 'low' } },
    { id: 'route.main.high', title: 'High risk', description: 'Rejects high risk.', when: { riskLevel: 'high' }, then: { outcome: 'REJECT', reason: 'high' } }
  ],
  default: { outcome: 'REVIEW', reason: 'fallback' }
};
const facts = { riskLevel: 'low' };
const loops = 10000;

function measure(name, fn) {
  const start = performance.now();
  for (let i = 0; i < loops; i += 1) fn();
  const end = performance.now();
  console.log(name + ': ' + (end - start).toFixed(2) + 'ms');
}

const validation = validateDecisions(source);
if (!validation.ok) throw new Error(formatDecisionsDiagnostics(validation.diagnostics));

const artifact = prepareDecisions(source);
measure('prepareDecisions', () => prepareDecisions(source));
measure('executeDecisions', () => executeDecisions(artifact, facts, { trace: 'off' }));
