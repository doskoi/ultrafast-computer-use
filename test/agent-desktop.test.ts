import { describe, expect, it } from "vitest";

import { AgentDesktopComputer, snapshotFromAgentDesktop } from "../src/agent-desktop.js";
import { StaleSnapshotError } from "../src/sky.js";
import type { Decision } from "../src/types.js";

const ENVELOPE = {
  version: "2.6",
  ok: true,
  command: "snapshot",
  data: {
    app: "Calculator",
    snapshot_id: "s34wa7y3trk22d",
    tree: {
      role: "window",
      name: "Calculator",
      children: [
        {
          role: "scrollarea",
          name: "Edit field",
          ref_id: "@s34wa7y3trk22d:e1",
          available_actions: ["Scroll"],
        },
        {
          role: "button",
          name: "7",
          ref_id: "@s34wa7y3trk22d:e6",
          available_actions: ["Click", "SetFocus"],
        },
        {
          role: "button",
          name: "Delete",
          ref_id: "@s34wa7y3trk22d:e2",
          available_actions: ["Click"],
        },
      ],
    },
  },
};

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    operation: "CLICK",
    targetIndex: 0,
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

function fakeRunner(envelope: { current: unknown }) {
  const calls: string[][] = [];
  return {
    calls,
    async run(args: readonly string[]) {
      calls.push([...args]);
      return envelope.current;
    },
  };
}

describe("AgentDesktopComputer", () => {
  it("flattens the snapshot tree, keeps refs, and drops blocked labels", async () => {
    const runner = fakeRunner({ current: ENVELOPE });
    const computer = new AgentDesktopComputer({ app: "Calculator", run: runner.run });

    const snapshot = await computer.observe();

    expect(snapshot.elements.map((element) => element.description)).toEqual([
      'scrollarea "Edit field"',
      'button "7"',
    ]);
    expect(snapshot.elements[1]?.operations).toEqual(["CLICK"]);
    expect(runner.calls[0]).toEqual([
      "snapshot", "--app", "Calculator", "-i", "--compact",
    ]);
  });

  it("clicks the ref that belongs to the selected element", async () => {
    const runner = fakeRunner({ current: ENVELOPE });
    const computer = new AgentDesktopComputer({ app: "Calculator", run: runner.run });
    const snapshot = await computer.observe();
    runner.calls.length = 0;

    await computer.execute(snapshot, decision({ targetIndex: 1 }));

    expect(runner.calls).toEqual([
      ["snapshot", "--app", "Calculator", "-i", "--compact"],
      ["click", "@s34wa7y3trk22d:e6"],
    ]);
  });

  it("scrolls the selected ref in the requested direction", async () => {
    const runner = fakeRunner({ current: ENVELOPE });
    const computer = new AgentDesktopComputer({ app: "Calculator", run: runner.run });
    const snapshot = await computer.observe();
    runner.calls.length = 0;

    await computer.execute(snapshot, decision({ operation: "SCROLL_DOWN", targetIndex: 0 }));

    expect(runner.calls[1]).toEqual([
      "scroll", "@s34wa7y3trk22d:e1", "--direction", "down", "--amount", "3",
    ]);
  });

  it("passes a window id to the snapshot command", async () => {
    const runner = fakeRunner({ current: ENVELOPE });
    const computer = new AgentDesktopComputer({ app: "Calculator", windowId: 42, run: runner.run });

    await computer.observe();

    expect(runner.calls[0]).toEqual([
      "snapshot", "--app", "Calculator", "-i", "--compact", "--window-id", "42",
    ]);
  });

  it("rejects a stale decision", async () => {
    const envelope = { current: ENVELOPE };
    const computer = new AgentDesktopComputer({ app: "Calculator", run: fakeRunner(envelope).run });
    const snapshot = await computer.observe();
    envelope.current = {
      ...ENVELOPE,
      data: {
        ...ENVELOPE.data,
        tree: { ...ENVELOPE.data.tree, children: [...ENVELOPE.data.tree.children, {
          role: "button",
          name: "8",
          ref_id: "@s34wa7y3trk22d:e7",
          available_actions: ["Click"],
        }] },
      },
    };

    await expect(computer.execute(snapshot, decision())).rejects.toBeInstanceOf(StaleSnapshotError);
  });

  it("surfaces a failed snapshot envelope", () => {
    expect(() => snapshotFromAgentDesktop("Calculator", {
      ok: false,
      error: { code: "AMBIGUOUS_TARGET", message: "multiple windows" },
    })).toThrow(/multiple windows/);
  });
});
