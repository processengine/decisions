import pkg from '../index.js';
const { compile, evaluate, run } = pkg;

const definition = {
  artifacts: [
    { id: 'route.main.low', type: 'decision-rule', description: 'low', when: { 'risk.level': 'low' }, then: { decision: 'APPROVE', reason: 'low' } },
    { id: 'route.main.high', type: 'decision-rule', description: 'high', when: { 'risk.level': 'high' }, then: { decision: 'REJECT', reason: 'high' } },
    { id: 'route.main', type: 'decision-set', description: 'main', version: '1.0.0', mode: 'first_match_wins', rules: ['route.main.low', 'route.main.high'], defaultDecision: { decision: 'REVIEW', reason: 'fallback' } }
  ]
};
const facts = { risk: { level: 'low' } };
const loops = 10000;

function measure(name, fn) {
  const start = performance.now();
  for (let i = 0; i < loops; i += 1) fn();
  const end = performance.now();
  console.log(name + ': ' + (end - start).toFixed(2) + 'ms');
}

const compiled = compile(definition);
measure('compile', () => compile(definition));
measure('evaluate', () => evaluate(compiled, 'route.main', facts, { trace: false }));
measure('run', () => run(definition, 'route.main', facts, { trace: false }));
