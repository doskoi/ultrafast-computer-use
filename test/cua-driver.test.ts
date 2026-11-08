import { describe, expect, it } from "vitest";

import { CuaDriverComputer, snapshotFromCuaDriverState } from "../src/cua-driver.js";
import { StaleSnapshotError } from "../src/sky.js";
import type { Decision } from "../src/types.js";

const STATE = {
  app_name: "Calculator",
  snapshot_id: "s00000001",
  elements: [
    { element_index: 0, role: "AXWindow", label: "Calculator" },
    { element_index: 1, role: "AXMenuBar", parent_index: 0 },
    { element_index: 2, role: "AXMenuItem", label: "Save", parent_index: 1 },
    { element_index: 3, role: "AXButton", label: "7", actions: ["AXPress"], parent_index: 0 },
    { element_index: 4, role: "AXButton", label: "Delete", actions: ["AXPress"], parent_index: 0 },
    { element_index: 5, role: "AXScrollArea", label: "Edit field", parent_index: 0 },
  ],
};

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    operation: "CLICK",
    targetIndex: 3,
    operationProbability: 0.9,
    targetProbability: 0.9,
    operationConfidence: 0.9,
    targetConfidence: 0.9,
    completionProbability: 0.1,
    executionProbability: 0.9,
    latencyMs: 1,
    model: "test",
    ...overrides,
  };
}

function fakeRunner(state: { current: unknown }) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async run(tool: string, args: Record<string, unknown>) {
      calls.push({ tool, args });
      return state.current;
    },
  };
}

describe("CuaDriverComputer", () => {
  it("keeps cua element indices and drops the menu bar and blocked actions", async () => {
    const state = { current: STATE };
    const computer = new CuaDriverComputer({
      pid: 123,
      windowId: 456,
      app: "Calculator",
      run: fakeRunner(state).run,
    });

    const snapshot = await computer.observe();

    expect(snapshot.elements.map((element) => element.index)).toEqual([3, 5]);
    expect(snapshot.elements[0]?.operations).toEqual(["CLICK"]);
    expect(snapshot.elements[1]?.operations).toContain("SCROLL_DOWN");
    expect(snapshot.modelText).not.toContain("Save");
  });

  it("clicks with the fresh snapshot id and the selected element index", async () => {
    const state = { current: STATE };
    const runner = fakeRunner(state);
    const computer = new CuaDriverComputer({ pid: 123, windowId: 456, app: "Calculator", run: runner.run });
    const snapshot = await computer.observe();
    runner.calls.length = 0;

    await computer.execute(snapshot, decision());

    expect(runner.calls).toEqual([
      { tool: "get_window_state", args: { pid: 123, window_id: 456, include_screenshot: false } },
      { tool: "click", args: { pid: 123, window_id: 456, element_index: 3, snapshot_id: "s00000001", delivery_mode: "background" } },
    ]);
  });

  it("maps scroll decisions to the driver scroll tool", async () => {
    const state = { current: STATE };
    const runner = fakeRunner(state);
    const computer = new CuaDriverComputer({ pid: 123, windowId: 456, app: "Calculator", run: runner.run });
    const snapshot = await computer.observe();
    runner.calls.length = 0;

    await computer.execute(snapshot, decision({ operation: "SCROLL_DOWN", targetIndex: 5 }));

    expect(runner.calls[1]).toEqual({
      tool: "scroll",
      args: {
        pid: 123,
        window_id: 456,
        element_index: 5,
        snapshot_id: "s00000001",
        delivery_mode: "background",
        direction: "down",
        amount: 3,
      },
    });
  });

  it("rejects a stale decision", async () => {
    const state = { current: STATE };
    const computer = new CuaDriverComputer({ pid: 123, windowId: 456, app: "Calculator", run: fakeRunner(state).run });
    const snapshot = await computer.observe();
    state.current = {
      ...STATE,
      elements: [...STATE.elements, { element_index: 6, role: "AXButton", label: "8" }],
    };

    await expect(computer.execute(snapshot, decision())).rejects.toBeInstanceOf(StaleSnapshotError);
  });

  it("throws when no safe element remains", () => {
    expect(() => snapshotFromCuaDriverState("Calculator", {
      snapshot_id: "s1",
      elements: [{ element_index: 0, role: "AXWindow", label: "Calculator" }],
    })).toThrow(/no safe actionable elements/);
  });
});
