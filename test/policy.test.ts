import { describe, expect, it } from "vitest";

import { snapshotFromAccessibility } from "../src/ax.js";
import { JevPolicy, type SystemOneClientLike, type SystemOneResponse } from "../src/policy.js";

const SNAPSHOT = snapshotFromAccessibility("Preview", `AXWindow "Reports"
  AXButton "Open report" [element_index=17] x=10 y=20
  AXScrollArea "Results" [element_index=51]`);

function selected(choice: string, probabilities: Record<string, number>, confidence = 0.9) {
  return { type: "choice", choice, probabilities, confidence };
}

class FakeClient implements SystemOneClientLike {
  readonly calls: Array<{ state: unknown; questions: unknown; model?: string }> = [];

  constructor(private readonly response: SystemOneResponse) {}

  async systemOne(request: { state: unknown; questions: never; model?: string }): Promise<SystemOneResponse> {
    this.calls.push(request);
    return this.response;
  }
}

const OPERATIONS = {
  CLICK: 0.80,
  SCROLL_DOWN: 0.05,
  SCROLL_UP: 0.03,
  SCROLL_LEFT: 0.02,
  SCROLL_RIGHT: 0.02,
  WAIT: 0.02,
  DONE: 0.03,
  BLOCKED: 0.03,
};

describe("Jev policy", () => {
  it("uses one speculative request and consumes only the selected operation target", async () => {
    const client = new FakeClient({
      model: "jev-test",
      answers: {
        operation: selected("CLICK", OPERATIONS),
        click_target: selected("17", { "17": 1 }),
        scroll_down_target: { invalid: "ignored" },
        scroll_up_target: { invalid: "ignored" },
        scroll_left_target: { invalid: "ignored" },
        scroll_right_target: { invalid: "ignored" },
        goal_complete: { type: "noul", noul: 0.05 },
      },
    });

    const decision = await new JevPolicy(client).decide(SNAPSHOT, "Open the report", []);

    expect(client.calls).toHaveLength(1);
    expect(decision.operation).toBe("CLICK");
    expect(decision.targetIndex).toBe(17);
    expect(decision.executionProbability).toBe(0.8);
    expect(decision.model).toBe("jev-test");
    const call = client.calls[0] as { state: unknown; questions: Record<string, unknown> };
    expect(Object.keys(call.questions)).toEqual(expect.arrayContaining([
      "operation", "goal_complete", "click_target", "scroll_down_target",
    ]));
    expect(JSON.stringify(call.state)).not.toContain("x=10");
    expect(JSON.stringify(call.state)).not.toContain("screenshot");
  });

  it("rejects malformed distributions before an action can execute", async () => {
    const client = new FakeClient({
      answers: {
        operation: selected("CLICK", { CLICK: 1 }),
        click_target: selected("17", { "17": 1 }),
        goal_complete: { noul: 0.1 },
      },
    });

    await expect(new JevPolicy(client).decide(SNAPSHOT, "Open the report", []))
      .rejects.toThrow("Invalid typed-decision choice response");
  });

  it("omits target operations that have no candidates", async () => {
    const snapshot = snapshotFromAccessibility("Preview", "AXWindow Reports\nAXStaticText Nothing actionable");
    const client = new FakeClient({
      answers: {
        operation: selected("BLOCKED", { WAIT: 0.1, DONE: 0.1, BLOCKED: 0.8 }),
        goal_complete: { noul: 0.1 },
      },
    });

    const decision = await new JevPolicy(client).decide(snapshot, "Open the report", []);

    expect(decision.operation).toBe("BLOCKED");
    const questions = (client.calls[0] as { questions: Record<string, unknown> }).questions;
    expect(questions).not.toHaveProperty("click_target");
  });
});
