'use strict';

const validSource = {
  decisionSetId: 'decisions.abs.find_client',
  version: '2.0.0',
  title: 'Выбрать сценарий по результату поиска клиента',
  description: 'Выбирает исход после поиска клиента в АБС по фактам, собранным маппингом.',
  cases: [
    {
      id: 'single_own_service_client',
      title: 'Найден ровно один клиент нашего сервиса',
      description: 'Выбирает сценарий связывания, если найден ровно один клиент нашего сервиса.',
      when: { ownServiceClientCount: { eq: 1 } },
      then: { outcome: 'FOUND_OWN_SERVICE', reason: 'OWN_SERVICE_CLIENT_FOUND' },
    },
    {
      id: 'multiple_clients',
      title: 'Найдено несколько клиентов',
      description: 'Отклоняет обработку при неоднозначном выборе клиента.',
      when: { clientMatchCount: { gte: 2 } },
      then: { outcome: 'AMBIGUOUS', reason: 'MULTIPLE_CLIENTS_FOUND' },
    },
    {
      id: 'no_match',
      title: 'Клиент не найден',
      description: 'Сценарий создания нового клиента.',
      when: { clientMatchCount: 0 },
      then: { outcome: 'NOT_FOUND' },
    },
  ],
  default: { outcome: 'TECHNICAL_ERROR', reason: 'UNHANDLED_CASE' },
};

function makeDefinition() { return structuredClone(validSource); }

module.exports = { validSource, makeDefinition };
