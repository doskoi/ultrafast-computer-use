import { describe, expect, it } from "vitest";

import { ComputerUseAssistant, type DecisionPolicy } from "../src/assistant.js";
import { CuaComputer, type CuaSurfaceLike } from "../src/cua.js";
import { SkyComputer, StaleSnapshotError, type SkyLike } from "../src/sky.js";
import type { ComputerSnapshot, Decision, HistoryEntry } from "../src/types.js";

const TREE = `AXWindow "Reports"
  AXButton "Open report" [element_index=17]
  AXScrollArea "Results" [element_index=51]`;

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    operation: "CLICK",
    targetIndex: 17,
    operationProbability: 0.9,
    targetProbability: 0.8,
    operationConfidence: 0.9,
    targetConfidence: 0.9,
    completionProbability: 0.1,
    executionProbability: 0.8,
    latencyMs: 5,
    model: "ultrafast-test",
    ...overrides,
  };
}

class FakeSky implements SkyLike {
  readonly clicks: unknown[] = [];
  readonly scrolls: unknown[] = [];
  tree = TREE;

  async get_app_state(args: { app: string; disableDiff?: boolean }) {
    return { app: args.app, screenshot: null, text: this.tree };
  }

  async click(args: { app: string; element_index: number }) { this.clicks.push(args); }
  async scroll(args: { app: string; element_index?: number; direction: "up" | "down" | "left" | "right"; pages?: number }) {
    this.scrolls.push(args);
  }
}

class FakeCua implements CuaSurfaceLike {
  readonly clicks: number[] = [];
  readonly scrolls: unknown[] = [];

  async getAXState() { return TREE; }
  async click(index: number) { this.clicks.push(index); }
  async scroll(index: number, direction: "up" | "down" | "left" | "right", distance?: number) {
    this.scrolls.push({ index, direction, distance });
  }
}

describe("Computer Use adapters", () => {
  it("re-observes and clicks by the current element index through Sky", async () => {
    const sky = new FakeSky();
    const computer = new SkyComputer(sky, "Preview");
    const snapshot = await computer.observe();

    await computer.execute(snapshot, decision());

    expect(sky.clicks).toEqual([{ app: "Preview", element_index: 17 }]);
  });

  it("uses a selected scroll area rather than coordinates", async () => {
    const sky = new FakeSky();
    const computer = new SkyComputer(sky, "Preview");
    const snapshot = await computer.observe();

    await computer.execute(snapshot, decision({
      operation: "SCROLL_DOWN",
      targetIndex: 51,
      targetProbability: 0.9,
      executionProbability: 0.9,
    }));

    expect(sky.scrolls).toEqual([{
      app: "Preview", element_index: 51, direction: "down", pages: 1,
    }]);
  });

  it("supports the current cua app/tab binding shape", async () => {
    const surface = new FakeCua();
    const computer = new CuaComputer(surface, "Preview");
    const snapshot = await computer.observe();

    await computer.execute(snapshot, decision());

    expect(surface.clicks).toEqual([17]);
  });

  it("rejects a decision when the full tree changed", async () => {
    const sky = new FakeSky();
    const computer = new SkyComputer(sky, "Preview");
    const snapshot = await computer.observe();
    sky.tree = `${TREE}\nAXStaticText "changed"`;

    await expect(computer.execute(snapshot, decision())).rejects.toBeInstanceOf(StaleSnapshotError);
    expect(sky.clicks).toEqual([]);
  });
});

describe("assistant gates", () => {
  it("does not execute below the weaker operation/target threshold", async () => {
    const sky = new FakeSky();
    const policy: DecisionPolicy = {
      async decide(_snapshot: ComputerSnapshot, _goal: string, _history: readonly HistoryEntry[]) {
        return decision({ targetProbability: 0.4, executionProbability: 0.4 });
      },
    };
    const assistant = new ComputerUseAssistant(new SkyComputer(sky, "Preview"), policy);

    const result = await assistant.step("Open the report", { execute: true });

    expect(result.status).toBe("needs_review");
    expect(sky.clicks).toEqual([]);
  });

  it("requires both DONE signals to cross their thresholds", async () => {
    const sky = new FakeSky();
    const policy: DecisionPolicy = {
      async decide() {
        return decision({
          operation: "DONE",
          targetIndex: null,
          targetProbability: null,
          targetConfidence: null,
          operationProbability: 0.9,
          completionProbability: 0.5,
          executionProbability: 0.9,
        });
      },
    };
    const assistant = new ComputerUseAssistant(new SkyComputer(sky, "Preview"), policy);

    const result = await assistant.step("Open the report", { execute: true });

    expect(result.status).toBe("needs_review");
  });
});
