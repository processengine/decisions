# @processengine/decisions

[![npm version](https://img.shields.io/npm/v/%40processengine%2Fdecisions)](https://www.npmjs.com/package/@processengine/decisions)
[![CI](https://github.com/processengine/decisions/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/decisions/actions/workflows/ci.yml)
[![publish](https://github.com/processengine/decisions/actions/workflows/publish.yml/badge.svg)](https://github.com/processengine/decisions/actions/workflows/publish.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933)](https://nodejs.org/)

Compile-first library for selecting a decision from JSON-safe facts.

## What it does

- compiles decision definitions into an immutable artifact
- evaluates facts only against that compiled artifact
- returns a stable result shape: `MATCHED`, `DEFAULTED`, or `ABORT`
- keeps a strict architectural boundary: this package selects a decision and stops there

## What it does not do

- does not execute actions
- does not orchestrate time, retries, queues, or external calls
- does not replace `@processengine/flows`
- does not support expressions, nested decisions, or side effects in v1

## Install

```bash
npm install @processengine/decisions
```

## Quick start

```js
const { compile, evaluate } = require('@processengine/decisions');

const definition = {
  artifacts: [
    {
      id: 'risk.approve',
      type: 'decision-rule',
      description: 'approve low-risk request',
      when: { 'request.risk': 'low' },
      then: {
        decision: 'APPROVE',
        reason: 'low risk'
      }
    },
    {
      id: 'risk.route',
      type: 'decision-set',
      description: 'main routing',
      version: '1.0.0',
      mode: 'first_match_wins',
      rules: ['risk.approve'],
      defaultDecision: {
        decision: 'REVIEW',
        reason: 'fallback'
      }
    }
  ]
};

const compiled = compile(definition);
const result = evaluate(compiled, 'risk.route', { request: { risk: 'low' } });
```

## Compile-first contract

- `compile(definition)` returns an immutable compiled artifact
- `evaluate(compiled, entrypointId, facts)` works only on a compiled artifact
- mutating the original definition after `compile()` does not affect evaluation
- `run(definition, entrypointId, facts)` is only a facade over `compile() + evaluate()`

## Result model

### MATCHED

A rule matched. The selected decision comes from that rule.

### DEFAULTED

No rule matched and strict mode is off. The selected decision comes from `defaultDecision`.

### ABORT

Evaluation stopped due to invalid input, missing required facts, strict default resolution, or another runtime contract violation.

## Trace

Trace is part of the public contract.

Each trace item contains:

- `ruleId`
- `matched`
- `failedConditions` when the rule did not match

Failed conditions include:

- `fact`
- `expected`
- `actual`
- `conditionIndex`

Trace order always follows rule order.

## Missing facts

There are two levels of missing fact handling.

- `requiredFacts` is checked before rule evaluation and may return `REQUIRED_FACT_MISSING`
- rule conditions use `missingFactPolicy`
  - `false`: missing fact behaves like a failed condition
  - `error`: evaluation aborts with `MISSING_FACT`

## Known limits of v1

- only equality conditions are supported
- no expression language
- no nested decisions
- no side effects
- no dynamic action execution
- compile-time overlap analysis is heuristic and intentionally limited

## Schema

The package exports the canonical schema at subpath `@processengine/decisions/schema`.

## CommonJS note

The first release is CommonJS-first. Use `require()` from Node.js or configure your toolchain accordingly.
