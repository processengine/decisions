'use strict';

function freeze(value) {
  return Object.freeze(value);
}

function makeDiagnostic({ severity, code, message, phase, path = null, artifactId = null, entrypointId = null, ruleId = null, conditionIndex = null, details = null }) {
  return freeze({ severity, code, message, phase, path, artifactId, entrypointId, ruleId, conditionIndex, details });
}

function formatDiagnostic(diagnostic) {
  const parts = [
    '[' + diagnostic.severity.toUpperCase() + ']',
    '[' + diagnostic.code + ']',
    diagnostic.phase,
  ];
  if (diagnostic.artifactId) parts.push(diagnostic.artifactId);
  if (diagnostic.path) parts.push('(' + diagnostic.path + ')');
  return parts.join(' ') + ': ' + diagnostic.message;
}

class CompilationError extends Error {
  constructor(diagnostics) {
    const list = diagnostics.map((d, i) => '  ' + (i + 1) + '. ' + formatDiagnostic(d)).join('\n');
    super('decisions compilation failed:\n' + list);
    this.name = 'CompilationError';
    this.diagnostics = freeze([...diagnostics]);
    this.errors = freeze(diagnostics.filter((d) => d.severity === 'error'));
    this.warnings = freeze(diagnostics.filter((d) => d.severity === 'warning'));
  }
}

function makeRuntimeError({ code, message, phase, entrypointId = null, ruleId = null, conditionIndex = null, details = null }) {
  return freeze({ code, message, phase, entrypointId, ruleId, conditionIndex, details });
}

function formatRuntimeError(error) {
  return '[' + error.code + '] ' + error.phase + ': ' + error.message;
}

module.exports = {
  makeDiagnostic,
  CompilationError,
  makeRuntimeError,
  formatDiagnostic,
  formatRuntimeError,
};
