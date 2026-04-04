# Нормативная спецификация @processengine/decisions

## 1. Назначение

`@processengine/decisions` принимает решение по JSON-safe фактам. Библиотека не исполняет действие, не знает про транспорт, БД, очереди и не подменяет слой оркестрации.

## 2. Модель работы

1. `compile(definition)` валидирует DSL и строит иммутабельный compiled artifact.
2. `evaluate(compiled, entrypointId, facts)` вычисляет решение только по compiled artifact.
3. `run(definition, entrypointId, facts)` является фасадом над шагами compile и evaluate.

## 3. DSL

Корневой объект содержит единственное поле `artifacts`.

Поддерживаются два типа артефактов:

- `decision-rule`
- `decision-set`

### 3.1. decision-rule

Содержит `when` и `then`.

`when` — объект вида `fact.path -> expected scalar`.

`then` содержит:

- `decision`
- `reason`
- опционально `patchPlanFrom`
- опционально `metadata`
- опционально `tags`

### 3.2. decision-set

Содержит:

- `version`
- `mode = first_match_wins`
- `rules`
- `defaultDecision`
- опционально `requiredFacts`
- опционально `missingFactPolicy`
- опционально `strict`

## 4. Семантика вычисления

Правила проверяются сверху вниз. Первое совпавшее правило побеждает.

Если правило не совпало, evaluation переходит к следующему правилу.

Если ни одно правило не совпало:

- при `strict = true` возвращается `ABORT` с кодом `DEFAULT_REACHED_IN_STRICT_MODE`
- иначе возвращается `DEFAULTED`

## 5. Отсутствие фактов

Проверка идёт на двух уровнях.

### 5.1. requiredFacts

Если отсутствует путь из `requiredFacts`, evaluation завершается `ABORT` с кодом `REQUIRED_FACT_MISSING`.

### 5.2. missingFactPolicy

При отсутствии факта в условии правила:

- `false` — условие считается несработавшим
- `error` — evaluation завершается `ABORT` с кодом `MISSING_FACT`

## 6. Trace contract

Trace — официальная часть внешнего контракта.

Каждый элемент trace содержит:

- `ruleId`
- `matched`
- `failedConditions` для несработавшего правила

Каждый элемент `failedConditions` содержит:

- `fact`
- `expected`
- `actual`
- `conditionIndex`

Порядок trace совпадает с порядком правил.

## 7. Диагностика

### 7.1. Compile-time

Compile diagnostics делятся на `error` и `warning`.

Каждая запись содержит:

- `severity`
- `code`
- `message`
- `phase`
- `path`
- `artifactId`
- `entrypointId`
- `ruleId`
- `conditionIndex`
- `details`

### 7.2. Runtime

Runtime error содержит:

- `code`
- `message`
- `phase`
- `entrypointId`
- `ruleId`
- `conditionIndex`
- `details`

## 8. Архитектурные границы

Библиотека:

- принимает решение
- не интерпретирует решение как процесс
- не исполняет действия
- не знает про HTTP, Kafka, БД, очереди и таймеры
- не заменяет `@processengine/flows`

## 9. Ограничения v1

- только equality-условия
- нет expression language
- нет nested decisions
- нет side effects
- нет dynamic action execution
- compile-time анализ перекрытий ограничен простыми эвристиками
