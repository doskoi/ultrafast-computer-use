import { describe, expect, it } from "vitest";

import { snapshotFromAccessibility } from "../src/ax.js";
import {
  DecisionProvidersUnavailableError,
  DualPolicy,
  JevPolicy,
  type SystemOneClientLike,
  type SystemOneResponse,
} from "../src/policy.js";

const SNAPSHOT = snapshotFromAccessibility("Preview", `AXWindow "Reports"
  AXButton "Open report" [element_index=17] x=10 y=20
  AXScrollArea "Results" [element_index=51]`);

function response(operationProbability: number, model: string): SystemOneResponse {
  const otherProbability = (1 - operationProbability) / 7;
  return {
    model,
    answers: {
      operation: {
        choice: "CLICK",
        confidence: operationProbability,
        probabilities: {
          CLICK: operationProbability,
          SCROLL_DOWN: otherProbability,
          SCROLL_UP: otherProbability,
          SCROLL_LEFT: otherProbability,
          SCROLL_RIGHT: otherProbability,
          WAIT: otherProbability,
          DONE: otherProbability,
          BLOCKED: otherProbability,
        },
      },
      click_target: { choice: "17", confidence: 1, probabilities: { "17": 1 } },
      scroll_down_target: { choice: "51", confidence: 1, probabilities: { "51": 1 } },
      scroll_up_target: { choice: "51", confidence: 1, probabilities: { "51": 1 } },
      scroll_left_target: { choice: "51", confidence: 1, probabilities: { "51": 1 } },
      scroll_right_target: { choice: "51", confidence: 1, probabilities: { "51": 1 } },
      goal_complete: { noul: 0.05 },
    },
  };
}

class FakeClient implements SystemOneClientLike {
  calls = 0;

  constructor(
    private readonly result?: SystemOneResponse,
    private readonly failure?: Error,
  ) {}

  async systemOne(): Promise<SystemOneResponse> {
    this.calls += 1;
    if (this.failure !== undefined) throw this.failure;
    return this.result as SystemOneResponse;
  }
}

describe("dual decision policy", () => {
  it("defaults to Jev primary without Laya failback", async () => {
    const variables = [
      "ULTRAFAST_PRIMARY_PROVIDER",
      "ULTRAFAST_SECONDARY_PROVIDER",
      "ULTRAFAST_FAILBACK_PROVIDER",
    ] as const;
    const original = variables.map((name) => [name, process.env[name]] as const);
    for (const name of variables) delete process.env[name];
    try {
      const jev = new FakeClient(response(0.8, "jev-test"));
      const laya = new FakeClient(response(0.9, "laya-test"));
      const policy = new DualPolicy({ jevClient: jev, layaClient: laya });

      const decision = await policy.decide(SNAPSHOT, "Open the report", []);

      expect(decision.provider).toBe("jev");
      expect(jev.calls).toBe(2);
      expect(laya.calls).toBe(0);
    } finally {
      for (const [name, value] of original) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("keeps a weak primary result when no secondary provider is configured", async () => {
    const variables = [
      "ULTRAFAST_PRIMARY_PROVIDER",
      "ULTRAFAST_SECONDARY_PROVIDER",
      "ULTRAFAST_FAILBACK_PROVIDER",
    ] as const;
    const original = variables.map((name) => [name, process.env[name]] as const);
    for (const name of variables) delete process.env[name];
    try {
      const jev = new FakeClient(response(0.2, "jev-test"));
      const laya = new FakeClient(response(0.9, "laya-test"));
      const policy = new DualPolicy({ jevClient: jev, layaClient: laya });

      const decision = await policy.decide(SNAPSHOT, "Open the report", []);

      expect(decision.provider).toBe("jev");
      expect(laya.calls).toBe(0);
    } finally {
      for (const [name, value] of original) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("keeps the primary result and does not call failback when confidence is sufficient", async () => {
    const primary = new FakeClient(response(0.8, "laya-test"));
    const secondary = new FakeClient(response(0.9, "jev-test"));
    const policy = new DualPolicy({ primary: "laya", secondary: "jev", layaClient: primary, jevClient: secondary });

    const decision = await policy.decide(SNAPSHOT, "Open the report", []);

    expect(decision.provider).toBe("laya");
    expect(decision.model).toBe("laya-test");
    expect(primary.calls).toBe(2);
    expect(secondary.calls).toBe(0);
  });

  it("fails back to the secondary provider for a weak primary decision", async () => {
    const primary = new FakeClient(response(0.2, "laya-test"));
    const secondary = new FakeClient(response(0.8, "jev-test"));
    const policy = new DualPolicy({ primary: "laya", secondary: "jev", layaClient: primary, jevClient: secondary });

    const decision = await policy.decide(SNAPSHOT, "Open the report", []);

    expect(decision.provider).toBe("jev");
    expect(decision.model).toBe("jev-test");
    expect(primary.calls).toBe(2);
    expect(secondary.calls).toBe(2);
  });

  it("fails back when the primary runtime is unavailable", async () => {
    const primary = new FakeClient(undefined, new Error("Local Laya runtime unavailable"));
    const secondary = new FakeClient(response(0.8, "jev-test"));
    const policy = new DualPolicy({ primary: "laya", secondary: "jev", layaClient: primary, jevClient: secondary });

    const decision = await policy.decide(SNAPSHOT, "Open the report", []);

    expect(decision.provider).toBe("jev");
    expect(primary.calls).toBe(1);
    expect(secondary.calls).toBe(2);
  });

  it("reports both provider failures without bypassing the caller safety gate", async () => {
    const primary = new FakeClient(undefined, new Error("Local Laya runtime unavailable"));
    const secondary = new FakeClient(undefined, new Error("TypeSafe Jev unavailable"));
    const policy = new DualPolicy({ primary: "laya", secondary: "jev", layaClient: primary, jevClient: secondary });

    await expect(policy.decide(SNAPSHOT, "Open the report", []))
      .rejects.toBeInstanceOf(DecisionProvidersUnavailableError);
  });

  it("can make Jev primary and Laya secondary", async () => {
    const jev = new FakeClient(response(0.8, "jev-test"));
    const laya = new FakeClient(response(0.9, "laya-test"));
    const policy = new DualPolicy({ primary: "jev", secondary: "laya", jevClient: jev, layaClient: laya });

    const decision = await policy.decide(SNAPSHOT, "Open the report", []);

    expect(decision.provider).toBe("jev");
    expect(jev.calls).toBe(2);
    expect(laya.calls).toBe(0);
  });
});

describe("Jev provider", () => {
  it("preserves the Jev provider identity when a client is injected", async () => {
    const policy = new JevPolicy(new FakeClient(response(0.8, "jev-test")));

    const decision = await policy.decide(SNAPSHOT, "Open the report", []);

    expect(decision.provider).toBe("jev");
    expect(decision.model).toBe("jev-test");
  });
});
