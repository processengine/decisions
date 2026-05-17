'use strict';

class DecisionsCompileError extends Error {
  constructor(diagnostics, message) {
    const lines = (diagnostics ?? [])
      .map((d, i) => `  ${i + 1}. [${(d.level ?? 'error').toUpperCase()}] ${d.code} — ${d.message}`)
      .join('\n');
    super(message ?? `Decisions compilation failed with ${(diagnostics ?? []).length} diagnostic(s).${lines ? '\n' + lines : ''}`);
    this.name = 'DecisionsCompileError';
    this.code = 'DECISIONS_COMPILE_ERROR';
    this.diagnostics = Object.freeze((diagnostics ?? []).map(d => Object.freeze({ ...d })));
  }
}

class DecisionsRuntimeError extends Error {
  constructor({ code = 'DECISIONS_RUNTIME_ERROR', message = 'Decisions execution failed', details, cause } = {}) {
    super(message, { cause });
    this.name = 'DecisionsRuntimeError';
    this.code = code;
    this.details = details ?? null;
    this.cause = cause ?? null;
  }
}

function makeDiagnostic({ code, level = 'error', message, path, details }) {
  const d = { code, level, message };
  if (path != null) d.path = path;
  if (details != null) d.details = details;
  return Object.freeze(d);
}

function hasErrors(diagnostics) {
  return diagnostics.some(d => d.level === 'error');
}

module.exports = { DecisionsCompileError, DecisionsRuntimeError, makeDiagnostic, hasErrors };
