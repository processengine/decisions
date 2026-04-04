'use strict';

const { compile } = require('./src/compiler');
const { evaluate, run } = require('./src/runtime');
const { CompilationError, formatDiagnostic, formatRuntimeError } = require('./src/errors');

module.exports = {
  compile,
  evaluate,
  run,
  CompilationError,
  formatDiagnostic,
  formatRuntimeError,
};
