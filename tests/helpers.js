'use strict';

function makeDefinition() {
  return {
    artifacts: [
      {
        id: 'route.main.low',
        type: 'decision-rule',
        description: 'approve low risk',
        when: { 'request.risk': 'low' },
        then: { decision: 'APPROVE', reason: 'low risk', metadata: { lane: 'fast' }, tags: ['auto'] }
      },
      {
        id: 'route.main.vip',
        type: 'decision-rule',
        description: 'vip route',
        when: { 'request.customerTier': 'vip' },
        then: { decision: 'PRIORITY_REVIEW', reason: 'vip customer', patchPlanFrom: 'request.patch' }
      },
      {
        id: 'route.main',
        type: 'decision-set',
        description: 'main route',
        version: '1.0.0',
        mode: 'first_match_wins',
        requiredFacts: ['request.channel'],
        rules: ['route.main.low', 'route.main.vip'],
        defaultDecision: { decision: 'REVIEW', reason: 'fallback' }
      }
    ]
  };
}

module.exports = { makeDefinition };
