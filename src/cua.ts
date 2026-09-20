import { snapshotFromAccessibility } from "./ax.js";
import { StaleSnapshotError, type ComputerDriver } from "./sky.js";
import type { ComputerSnapshot, Decision, ElementOperation, Operation } from "./types.js";

export interface CuaSurfaceLike {
  getAXState(options?: { disableDiffing?: boolean; emit?: boolean }): Promise<string>;
  click(elementIndex: number): Promise<void>;
  scroll(
    elementIndex: number,
    direction: "up" | "down" | "left" | "right",
    distance?: number,
  ): Promise<void>;
}

/** Adapter for an app or tab binding returned by `cua.getApp()` / `cua.getTab()`. */
export class CuaComputer implements ComputerDriver {
  constructor(
    private readonly surface: CuaSurfaceLike,
    readonly app: string,
    private readonly waitMs = 750,
  ) {
    if (!app.trim()) throw new TypeError("app must be a non-empty string");
  }

  async observe(): Promise<ComputerSnapshot> {
    const text = await this.surface.getAXState({ disableDiffing: true, emit: false });
    return snapshotFromAccessibility(this.app, text);
  }

  async execute(snapshot: ComputerSnapshot, decision: Decision): Promise<void> {
    const current = await this.observe();
    if (current.fingerprint !== snapshot.fingerprint) throw new StaleSnapshotError();
    if (decision.operation === "WAIT") {
      await new Promise((resolve) => setTimeout(resolve, this.waitMs));
      return;
    }
    if (decision.targetIndex === null) throw new Error(`${decision.operation} requires a current element target`);
    const target = current.elements.find((element) => (
      element.index === decision.targetIndex
      && element.operations.includes(decision.operation as ElementOperation)
    ));
    if (target === undefined) throw new Error("Ultrafast selected an element outside the fresh safe action space");
    if (decision.operation === "CLICK") {
      await this.surface.click(decision.targetIndex);
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
      await this.surface.scroll(decision.targetIndex, direction, 1);
      return;
    }
    throw new Error(`Operation ${decision.operation} is not executable`);
  }
}
