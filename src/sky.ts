import { snapshotFromAccessibility } from "./ax.js";
import type { ComputerSnapshot, Decision, ElementOperation, Operation } from "./types.js";

export interface SkyAppState {
  readonly app: string;
  readonly screenshot: { readonly url: string } | null;
  readonly text: string;
}

export interface SkyLike {
  get_app_state(args: { app: string; disableDiff?: boolean }): Promise<SkyAppState>;
  click(args: { app: string; element_index: number }): Promise<void>;
  scroll(args: {
    app: string;
    element_index?: number;
    direction: "up" | "down" | "left" | "right";
    pages?: number;
  }): Promise<void>;
}

export class StaleSnapshotError extends Error {
  constructor() {
    super("The accessibility tree changed after Jev made its decision; no UI action was executed");
    this.name = "StaleSnapshotError";
  }
}

export interface ComputerDriver {
  observe(): Promise<ComputerSnapshot>;
  execute(snapshot: ComputerSnapshot, decision: Decision): Promise<void>;
}

export class SkyComputer {
  constructor(
    private readonly sky: SkyLike,
    readonly app: string,
    private readonly waitMs = 750,
  ) {
    if (!app.trim()) throw new TypeError("app must be a non-empty string");
  }

  async observe(): Promise<ComputerSnapshot> {
    const state = await this.sky.get_app_state({ app: this.app, disableDiff: true });
    return snapshotFromAccessibility(this.app, state.text);
  }

  async execute(snapshot: ComputerSnapshot, decision: Decision): Promise<void> {
    const current = await this.observe();
    if (current.fingerprint !== snapshot.fingerprint) throw new StaleSnapshotError();

    if (decision.operation === "WAIT") {
      await new Promise((resolve) => setTimeout(resolve, this.waitMs));
      return;
    }
    if (decision.operation === "CLICK") {
      if (decision.targetIndex === null || !current.elements.some((item) => (
        item.index === decision.targetIndex && item.operations.includes("CLICK")
      ))) {
        throw new Error("Jev selected an element that is not present in the fresh safe action space");
      }
      await this.sky.click({ app: this.app, element_index: decision.targetIndex });
      return;
    }
    const directions: Partial<Record<Operation, "up" | "down" | "left" | "right">> = {
      SCROLL_DOWN: "down",
      SCROLL_UP: "up",
      SCROLL_LEFT: "left",
      SCROLL_RIGHT: "right",
    };
    const direction = directions[decision.operation];
    if (direction !== undefined) {
      if (decision.targetIndex === null || !current.elements.some((item) => (
        item.index === decision.targetIndex
        && item.operations.includes(decision.operation as ElementOperation)
      ))) {
        throw new Error("Jev selected a scroll target that is not present in the fresh safe action space");
      }
      await this.sky.scroll({ app: this.app, element_index: decision.targetIndex, direction, pages: 1 });
      return;
    }
    throw new Error(`Operation ${decision.operation} is not executable`);
  }
}
