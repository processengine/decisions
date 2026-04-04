'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, evaluate } = require('../index');
const { makeDefinition } = require('./helpers');

test('invalid compiled artifact is handled defensively', () => {
  const result = evaluate({ kind: 'compiled-decisions' }, 'x', {});
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'INVALID_COMPILED_ARTIFACT');
});

test('entrypoint not found includes available entrypoints', () => {
  const compiled = compile(makeDefinition());
  const result = evaluate(compiled, 'missing', {});
  assert.equal(result.status, 'ABORT');
  assert.equal(result.error.code, 'ENTRYPOINT_NOT_FOUND');
  assert.ok(Array.isArray(result.error.details.availableEntrypoints));
});
