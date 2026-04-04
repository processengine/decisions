export type DiagnosticSeverity = 'error' | 'warning';
export type DiagnosticPhase = 'input_validation' | 'registry' | 'schema_validation' | 'reference_validation' | 'analysis';
export type RuntimePhase = 'input_validation' | 'entrypoint_lookup' | 'required_facts' | 'rule_evaluation' | 'default_resolution';

export interface CompileDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  phase: DiagnosticPhase;
  path: string | null;
  artifactId: string | null;
  entrypointId: string | null;
  ruleId: string | null;
  conditionIndex: number | null;
  details: Record<string, unknown> | null;
}

export declare class CompilationError extends Error {
  readonly name: 'CompilationError';
  readonly diagnostics: readonly CompileDiagnostic[];
  readonly errors: readonly CompileDiagnostic[];
  readonly warnings: readonly CompileDiagnostic[];
  constructor(diagnostics: readonly CompileDiagnostic[]);
}

export interface DecisionRuleArtifact {
  id: string;
  type: 'decision-rule';
  description: string;
  when: Record<string, string | number | boolean | null>;
  then: {
    decision: string;
    reason: string;
    patchPlanFrom?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  };
}

export interface DecisionSetArtifact {
  id: string;
  type: 'decision-set';
  description: string;
  version: string;
  mode: 'first_match_wins';
  strict?: boolean;
  missingFactPolicy?: 'false' | 'error';
  requiredFacts?: string[];
  rules: string[];
  defaultDecision: {
    decision: string;
    reason: string;
  };
}

export type DecisionArtifact = DecisionRuleArtifact | DecisionSetArtifact;

export interface DecisionDefinition {
  artifacts: DecisionArtifact[];
}

export interface CompiledCondition {
  path: string;
  expected: string | number | boolean | null;
}

export interface CompiledRuleThen {
  decision: string;
  reason: string;
  patchPlanFrom: string | null;
  metadata: Record<string, unknown>;
  tags: readonly string[];
}

export interface CompiledRule {
  ruleId: string;
  conditions: readonly CompiledCondition[];
  then: CompiledRuleThen;
}

export interface CompiledDecisionSet {
  id: string;
  version: string;
  mode: 'first_match_wins';
  missingFactPolicy: 'false' | 'error';
  requiredFacts: readonly string[];
  strict: boolean;
  defaultDecision: {
    decision: string;
    reason: string;
  };
  rules: readonly CompiledRule[];
}

export interface ReadOnlyMapLike<K, V> extends Iterable<[K, V]> {
  readonly size: number;
  get(key: K): V | undefined;
  has(key: K): boolean;
  forEach(callback: (value: V, key: K) => void, thisArg?: unknown): void;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
}

export interface CompiledDecisions {
  readonly kind: 'compiled-decisions';
  readonly registry: ReadOnlyMapLike<string, DecisionArtifact>;
  readonly entrypoints: ReadOnlyMapLike<string, CompiledDecisionSet>;
  readonly warnings: readonly CompileDiagnostic[];
}

export interface EvaluateOptions {
  trace?: boolean;
}

export interface TraceFailedCondition {
  fact: string;
  expected: string | number | boolean | null;
  actual: unknown;
  conditionIndex: number;
}

export interface TraceEntry {
  ruleId: string;
  matched: boolean;
  failedConditions?: readonly TraceFailedCondition[];
}

export interface RuntimeErrorShape {
  code: string;
  message: string;
  phase: RuntimePhase;
  entrypointId: string | null;
  ruleId: string | null;
  conditionIndex: number | null;
  details: Record<string, unknown> | null;
}

export interface MatchedDecisionResult {
  status: 'MATCHED';
  decision: string;
  reason: string;
  matchedRuleId: string;
  decisionSetVersion: string;
  patchPlan: unknown;
  metadata: Record<string, unknown>;
  tags: readonly string[];
  trace: readonly TraceEntry[];
}

export interface DefaultedDecisionResult {
  status: 'DEFAULTED';
  decision: string;
  reason: string;
  matchedRuleId: null;
  decisionSetVersion: string;
  patchPlan: null;
  metadata: Record<string, unknown>;
  tags: readonly string[];
  trace: readonly TraceEntry[];
}

export interface AbortDecisionResult {
  status: 'ABORT';
  decision: null;
  reason: null;
  matchedRuleId: null;
  decisionSetVersion: string | null;
  patchPlan: null;
  metadata: Record<string, unknown>;
  tags: readonly string[];
  trace: readonly TraceEntry[];
  error: RuntimeErrorShape;
}

export type DecisionResult = MatchedDecisionResult | DefaultedDecisionResult | AbortDecisionResult;

export declare function compile(definition: DecisionDefinition): CompiledDecisions;
export declare function evaluate(compiled: CompiledDecisions, entrypointId: string, facts: unknown, options?: EvaluateOptions): DecisionResult;
export declare function run(definition: DecisionDefinition, entrypointId: string, facts: unknown, options?: EvaluateOptions): DecisionResult;
export declare function formatDiagnostic(diagnostic: CompileDiagnostic): string;
export declare function formatRuntimeError(error: RuntimeErrorShape): string;
