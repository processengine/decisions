const { compile, evaluate } = require('../index');

const definition = {
  artifacts: [
    {
      id: 'route.main.low',
      type: 'decision-rule',
      description: 'low risk',
      when: { 'risk.level': 'low' },
      then: { decision: 'APPROVE', reason: 'low risk' }
    },
    {
      id: 'route.main',
      type: 'decision-set',
      description: 'main route',
      version: '1.0.0',
      mode: 'first_match_wins',
      rules: ['route.main.low'],
      defaultDecision: { decision: 'REVIEW', reason: 'fallback' }
    }
  ]
};

const compiled = compile(definition);
console.log(evaluate(compiled, 'route.main', { risk: { level: 'low' } }));
