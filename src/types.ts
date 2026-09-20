export const OPERATIONS = [
  "CLICK",
  "SCROLL_DOWN",
  "SCROLL_UP",
  "SCROLL_LEFT",
  "SCROLL_RIGHT",
  "WAIT",
  "DONE",
  "BLOCKED",
] as const;

export type Operation = (typeof OPERATIONS)[number];

export type ElementOperation = "CLICK" | "SCROLL_DOWN" | "SCROLL_UP" | "SCROLL_LEFT" | "SCROLL_RIGHT";

export interface ComputerElement {
  readonly index: number;
  readonly description: string;
  readonly operations: readonly ElementOperation[];
}

export interface ComputerSnapshot {
  readonly app: string;
  readonly accessibilityText: string;
  readonly modelText: string;
  readonly elements: readonly ComputerElement[];
  readonly fingerprint: string;
}

export interface Decision {
  readonly operation: Operation;
  readonly targetIndex: number | null;
  readonly operationProbability: number;
  readonly targetProbability: number | null;
  readonly operationConfidence: number;
  readonly targetConfidence: number | null;
  readonly completionProbability: number;
  readonly executionProbability: number;
  readonly latencyMs: number;
  readonly model: string;
}

export interface HistoryEntry {
  readonly operation: Operation;
  readonly targetIndex: number | null;
  readonly description: string;
  readonly probability: number;
}

export interface StepResult {
  readonly status: "suggested" | "executed" | "done" | "blocked" | "needs_review" | "stale";
  readonly snapshot: Pick<ComputerSnapshot, "app" | "fingerprint">;
  readonly decision: Decision;
  readonly reason?: string;
  readonly action?: HistoryEntry;
}
