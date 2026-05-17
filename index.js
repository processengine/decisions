'use strict';

const { validateDecisionsSource } = require('./src/validate');
const { prepareDecisionsArtifact } = require('./src/prepare');
const { executeDecisionsArtifact } = require('./src/execute');
const { DecisionsCompileError, DecisionsRuntimeError } = require('./src/errors');

function validateDecisions(source) {
  return validateDecisionsSource(source);
}

function prepareDecisions(source) {
  return prepareDecisionsArtifact(source);
}

function executeDecisions(artifact, facts, options) {
  return executeDecisionsArtifact(artifact, facts, options);
}

function formatDecisionsDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return 'No diagnostics';
  return diagnostics.map(d => `[${(d.level ?? 'error').toUpperCase()}] ${d.code} — ${d.message}${d.path ? ` (path: ${d.path})` : ''}`).join('\n');
}

function formatDecisionsRuntimeError(error) {
  if (!error) return '';
  const parts = [error.code ?? 'DECISIONS_RUNTIME_ERROR', error.message ?? ''];
  if (error.details) parts.push(JSON.stringify(error.details));
  return parts.join(' | ');
}

module.exports = {
  validateDecisions,
  prepareDecisions,
  executeDecisions,
  formatDecisionsDiagnostics,
  formatDecisionsRuntimeError,
  DecisionsCompileError,
  DecisionsRuntimeError,
};
