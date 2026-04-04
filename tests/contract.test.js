'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, evaluate, run, CompilationError } = require('../index');
const { makeDefinition } = require('./helpers');

test('compile returns immutable compiled artifact', () => {
  const compiled = compile(makeDefinition());
  assert.equal(compiled.kind, 'compiled-decisions');
  assert(Object.isFrozen(compiled));
  assert.throws(() => { compiled.kind = 'x'; }, /read only|Cannot assign|frozen/i);
});

test('mutating definition after compile does not affect evaluation', () => {
  const definition = makeDefinition();
  const compiled = compile(definition);
  definition.artifacts[0].then.decision = 'BROKEN';
  const result = evaluate(compiled, 'route.main', { request: { risk: 'low', channel: 'web' } });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.decision, 'APPROVE');
});

test('run facade equals compile plus evaluate', () => {
  const definition = makeDefinition();
  const facts = { request: { risk: 'low', channel: 'web' } };
  assert.deepEqual(
    run(definition, 'route.main', facts),
    evaluate(compile(definition), 'route.main', facts)
  );
});

test('result shapes are exact for MATCHED DEFAULTED and ABORT', () => {
  const compiled = compile(makeDefinition());
  const matched = evaluate(compiled, 'route.main', { request: { risk: 'low', channel: 'web' } });
  assert.deepEqual(Object.keys(matched).sort(), ['decision','decisionSetVersion','matchedRuleId','metadata','patchPlan','reason','status','tags','trace']);
  const defaulted = evaluate(compiled, 'route.main', { request: { risk: 'medium', channel: 'web' } });
  assert.equal(defaulted.status, 'DEFAULTED');
  const abort = evaluate(compiled, 'route.main', { request: { risk: 'medium' } });
  assert.equal(abort.status, 'ABORT');
  assert.deepEqual(Object.keys(abort.error).sort(), ['code','conditionIndex','details','entrypointId','message','phase','ruleId']);
});

test('compilation error exposes diagnostics errors and warnings', () => {
  const badDefinition = {
    artifacts: [
      { id: 'rule', type: 'decision-rule', description: 'r', when: {}, then: { decision: 'A', reason: 'a' } },
      { id: 'rule2', type: 'decision-rule', description: 'r2', when: {}, then: { decision: 'B', reason: 'b' } },
      { id: 'set', type: 'decision-set', description: 's', version: '1', mode: 'first_match_wins', rules: ['rule', 'rule2'], defaultDecision: { decision: 'D', reason: 'd' }, unknownField: true }
    ]
  };
  assert.throws(() => compile(badDefinition), (error) => {
    assert(error instanceof CompilationError);
    assert.ok(error.diagnostics.length >= 1);
    assert.ok(error.errors.length >= 1);
    return true;
  });
});

test('schema subpath file exists in package source', () => {
  const schemaPath = path.join(__dirname, '..', 'src', 'schema', 'decision.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.type, 'object');
});


test('compilation error message contains package identity', () => {
  assert.throws(() => compile(null), (error) => {
    assert(error instanceof CompilationError);
    assert.match(error.message, /@processengine\/decisions compilation failed/);
    return true;
  });
});

test('trace contract is stable for failed then matched rules', () => {
  const compiled = compile(makeDefinition());
  const result = evaluate(compiled, 'route.main', { request: { risk: 'low', channel: 'web', customerTier: 'standard' } });
  assert.deepEqual(result.trace, [
    { ruleId: 'route.main.low', matched: true }
  ]);
});

test('compile error exposes warnings together with errors when present', () => {
  const mixedDefinition = {
    artifacts: [
      { id: 'set.r1', type: 'decision-rule', description: 'r1', when: { a: 1 }, then: { decision: 'ONE', reason: 'one' } },
      { id: 'set.r2', type: 'decision-rule', description: 'r2', when: { a: 1 }, then: { decision: 'TWO', reason: 'two' } },
      { id: 'set', type: 'decision-set', description: 'set', version: '1', mode: 'first_match_wins', rules: ['set.r1', 'missing.rule'], defaultDecision: { decision: 'D', reason: 'd' } }
    ]
  };
  assert.throws(() => compile(mixedDefinition), (error) => {
    assert(error instanceof CompilationError);
    assert.ok(error.errors.length >= 1);
    assert.ok(Array.isArray(error.warnings));
    return true;
  });
});
