import { StaleSnapshotError, type ComputerDriver } from "./sky.js";
import type { ComputerSnapshot, Decision, HistoryEntry, StepResult } from "./types.js";

export interface DecisionPolicy {
  decide(snapshot: ComputerSnapshot, goal: string, history: readonly HistoryEntry[]): Promise<Decision>;
}

export class ComputerUseAssistant {
  readonly history: HistoryEntry[] = [];

  constructor(
    private readonly computer: ComputerDriver,
    private readonly policy: DecisionPolicy,
    private readonly options: { readonly minProbability?: number; readonly completionThreshold?: number } = {},
  ) {
    const minProbability = options.minProbability ?? 0.55;
    const completionThreshold = options.completionThreshold ?? 0.85;
    if (minProbability < 0 || minProbability > 1 || completionThreshold < 0 || completionThreshold > 1) {
      throw new RangeError("Probability thresholds must be between 0 and 1");
    }
  }

  inspect(): Promise<ComputerSnapshot> {
    return this.computer.observe();
  }

  async suggest(goal: string, snapshot?: ComputerSnapshot): Promise<{ snapshot: ComputerSnapshot; decision: Decision }> {
    const observed = snapshot ?? await this.inspect();
    return { snapshot: observed, decision: await this.policy.decide(observed, goal, this.history) };
  }

  async step(goal: string, options: { readonly execute?: boolean } = {}): Promise<StepResult> {
    const { snapshot, decision } = await this.suggest(goal);
    const base = { snapshot: { app: snapshot.app, fingerprint: snapshot.fingerprint }, decision } as const;
    const minProbability = this.options.minProbability ?? 0.55;
    const completionThreshold = this.options.completionThreshold ?? 0.85;
    if (decision.operation === "DONE") {
      const strong = decision.operationProbability >= minProbability
        && decision.completionProbability >= completionThreshold;
      return {
        ...base,
        status: strong ? "done" : "needs_review",
        reason: strong ? "The visible state proves the goal is complete" : "DONE did not meet both probability thresholds",
      };
    }
    if (decision.operation === "BLOCKED") {
      return { ...base, status: "blocked", reason: "Jev found no supported safe navigation action" };
    }
    if (options.execute !== true) return { ...base, status: "suggested" };
    if (decision.executionProbability < minProbability) {
      return { ...base, status: "needs_review", reason: "Decision probability is below the execution threshold" };
    }
    try {
      await this.computer.execute(snapshot, decision);
    } catch (error) {
      if (error instanceof StaleSnapshotError) return { ...base, status: "stale", reason: error.message };
      throw error;
    }
    const element = decision.targetIndex === null
      ? null
      : snapshot.elements.find((candidate) => candidate.index === decision.targetIndex);
    const action: HistoryEntry = {
      operation: decision.operation,
      targetIndex: decision.targetIndex,
      description: element?.description ?? decision.operation,
      probability: decision.executionProbability,
    };
    this.history.push(action);
    return { ...base, status: "executed", action };
  }

  async *run(goal: string, options: { readonly maxSteps?: number } = {}): AsyncGenerator<StepResult | {
    readonly status: "blocked";
    readonly reason: string;
  }> {
    const maxSteps = options.maxSteps ?? 20;
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new RangeError("maxSteps must be a positive integer");
    for (let step = 0; step < maxSteps; step += 1) {
      const result = await this.step(goal, { execute: true });
      yield result;
      if (result.status !== "executed") return;
    }
    yield { status: "blocked", reason: `Reached the ${maxSteps}-step action budget` };
  }
}
