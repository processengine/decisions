export type JsonScalar = null | boolean | number | string;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type DecisionCondition =
  | JsonScalar
  | { eq: JsonScalar } | { neq: JsonScalar }
  | { gt: number } | { gte: number } | { lt: number } | { lte: number }
  | { in: JsonScalar[] } | { notIn: JsonScalar[] }
  | { exists: true } | { missing: true }
  | { eqFact: string } | { neqFact: string }
  | { gtFact: string } | { gteFact: string }
  | { ltFact: string } | { lteFact: string };

export interface DecisionThen {
  outcome: string;
  reason?: string;
  metadata?: JsonObject;
  tags?: string[];
}

export interface DecisionCaseV2 {
  id: string;
  title: string;
  description: string;
  when: Record<string, DecisionCondition>;
  then: DecisionThen;
  metadata?: JsonObject;
}

export interface DecisionsDefinitionV2 {
  decisionSetId: string;
  version: string;
  title: string;
  description: string;
  cases: DecisionCaseV2[];
  default: DecisionThen;
  metadata?: JsonObject;
}

export interface DecisionOutput {
  outcome: string;
  reason?: string;
  matchedCaseId?: string;
  decisionSetId: string;
  metadata?: JsonObject;
  tags?: string[];
}

export interface DecisionTraceEvent {
  kind: 'DECISION_CASE_EVALUATED' | 'DECISION_CASE_MATCHED' | 'DECISION_DEFAULT_SELECTED';
  artifactType: 'decisions';
  artifactId: string;
  step: string;
  at: string;
  outcome: 'matched' | 'not_matched' | 'default_selected';
  details?: JsonObject;
  input?: JsonValue;
  output?: JsonValue;
}

export interface ExecuteDecisionsResult {
  output: DecisionOutput;
  trace?: DecisionTraceEvent[];
}

export interface DecisionsDiagnostic {
  code: string;
  level: 'error' | 'warning';
  message: string;
  path?: string;
  details?: JsonObject;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: readonly DecisionsDiagnostic[];
}

export interface PreparedDecisionsArtifact {
  readonly artifactType: 'decisions';
  readonly version: 'v2';
  readonly decisionSetId: string;
  readonly title: string;
  readonly description: string;
  readonly compiledCases: readonly unknown[];
  readonly default: Readonly<DecisionThen>;
  getDefinition(): DecisionsDefinitionV2;
}

export interface ExecuteDecisionsOptions {
  trace?: 'off' | 'basic' | 'verbose';
}

export declare class DecisionsCompileError extends Error {
  readonly code: 'DECISIONS_COMPILE_ERROR';
  readonly diagnostics: readonly DecisionsDiagnostic[];
}

export declare class DecisionsRuntimeError extends Error {
  readonly code: string;
  readonly details: JsonObject | null;
  readonly cause?: unknown;
}

export declare function validateDecisions(source: unknown): ValidationResult;
export declare function prepareDecisions(source: DecisionsDefinitionV2): PreparedDecisionsArtifact;
export declare function executeDecisions(artifact: PreparedDecisionsArtifact, facts: JsonObject, options?: ExecuteDecisionsOptions): ExecuteDecisionsResult;
export declare function formatDecisionsDiagnostics(diagnostics: readonly DecisionsDiagnostic[]): string;
export declare function formatDecisionsRuntimeError(error: DecisionsRuntimeError): string;
