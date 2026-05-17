'use strict';

const { validateDecisions, prepareDecisions, executeDecisions } = require('../index');

const source = {
  decisionSetId: 'decisions.validation.route',
  version: '2.0.0',
  title: 'Выбрать маршрут после валидации заявки',
  description: 'Определяет, можно ли продолжать обработку заявки или нужно завершить процесс отказом.',
  cases: [
    {
      id: 'validation.has_errors',
      title: 'Есть блокирующие ошибки',
      description: 'Отклоняет заявку, если проверки вернули хотя бы одну ошибку.',
      when: { errorCount: { gt: 0 } },
      then: { outcome: 'REJECT_VALIDATION', reason: 'VALIDATION_ERROR' }
    },
    {
      id: 'validation.only_soft_warnings',
      title: 'Есть только мягкие предупреждения',
      description: 'Разрешает продолжить процесс, если все предупреждения относятся к мягким контактным полям.',
      when: {
        warningCount: { gt: 0 },
        softContactWarningCount: { eqFact: 'warningCount' },
        errorCount: 0
      },
      then: { outcome: 'CONTINUE', reason: 'SOFT_WARNINGS_ONLY' }
    }
  ],
  default: { outcome: 'CONTINUE', reason: 'VALIDATION_OK' }
};

const validation = validateDecisions(source);
if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics, null, 2));

const artifact = prepareDecisions(source);
const result = executeDecisions(artifact, { errorCount: 0, warningCount: 2, softContactWarningCount: 2 }, { trace: 'basic' });
console.log(JSON.stringify(result, null, 2));
