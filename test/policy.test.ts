import { describe, expect, it } from "vitest";

import { snapshotFromAccessibility } from "../src/ax.js";
import { UltrafastPolicy, type SystemOneClientLike, type SystemOneResponse } from "../src/policy.js";

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

describe("Ultrafast policy", () => {
  it("selects the operation first, then asks only for the selected operation target", async () => {
    const client = new FakeClient({
      model: "ultrafast-test",
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

    const decision = await new UltrafastPolicy(client).decide(SNAPSHOT, "Open the report", []);

    expect(client.calls).toHaveLength(2);
    expect(decision.operation).toBe("CLICK");
    expect(decision.targetIndex).toBe(17);
    expect(decision.executionProbability).toBe(0.8);
    expect(decision.model).toBe("ultrafast-test");
    const firstCall = client.calls[0] as { state: unknown; questions: Record<string, unknown> };
    expect(Object.keys(firstCall.questions)).toEqual(["operation", "goal_complete"]);
    const secondCall = client.calls[1] as { state: unknown; questions: Record<string, unknown> };
    expect(Object.keys(secondCall.questions)).toEqual(["click_target"]);
    expect(String(secondCall.state)).toContain("17:");
    expect(String(secondCall.state)).not.toContain("51:");
    expect(JSON.stringify(firstCall.state)).not.toContain("x=10");
    expect(JSON.stringify(firstCall.state)).not.toContain("screenshot");
    const operationQuestion = firstCall.questions.operation as {
      instructions: unknown;
      criteria: Record<string, unknown>;
    };
    expect(typeof operationQuestion.instructions).toBe("string");
    expect(operationQuestion.instructions).toMatch(/^User goal: Open the report/);
    expect(Object.values(operationQuestion.criteria).every((value) => typeof value === "string")).toBe(true);
    const targetQuestion = secondCall.questions.click_target as {
      instructions: unknown;
      criteria: Record<string, unknown>;
    };
    expect(typeof targetQuestion.instructions).toBe("string");
    expect(targetQuestion.instructions).toMatch(/^User goal: Open the report\nSelected operation: CLICK/);
    expect(Object.values(targetQuestion.criteria).every((value) => typeof value === "string")).toBe(true);
  });

  it("rejects malformed distributions before an action can execute", async () => {
    const client = new FakeClient({
      answers: {
        operation: selected("CLICK", { CLICK: 1 }),
        click_target: selected("17", { "17": 1 }),
        goal_complete: { noul: 0.1 },
      },
    });

    await expect(new UltrafastPolicy(client).decide(SNAPSHOT, "Open the report", []))
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

    const decision = await new UltrafastPolicy(client).decide(snapshot, "Open the report", []);

    expect(decision.operation).toBe("BLOCKED");
    expect(client.calls).toHaveLength(1);
    const questions = (client.calls[0] as { questions: Record<string, unknown> }).questions;
    expect(questions).not.toHaveProperty("click_target");
  });
});
