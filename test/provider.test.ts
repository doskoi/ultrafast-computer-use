import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { snapshotFromAccessibility } from "../src/ax.js";
import { JevClient, JevPolicy, type SystemOneClientLike } from "../src/policy.js";

const remoteCall = vi.hoisted(() => vi.fn());
vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    systemOne = remoteCall;
  },
}));

const SNAPSHOT = snapshotFromAccessibility("Preview", 'AXButton "Open report" [element_index=17]');

function client(probability = 0.8): SystemOneClientLike & { systemOne: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  return {
    systemOne: vi.fn().mockResolvedValue({
      model: "jev-test",
      answers: {
        operation: {
          choice: "CLICK",
          confidence: probability,
          probabilities: {
            CLICK: probability,
            WAIT: (1 - probability) / 3,
            DONE: (1 - probability) / 3,
            BLOCKED: (1 - probability) / 3,
          },
        },
        click_target: { choice: "17", confidence: 1, probabilities: { "17": 1 } },
        goal_complete: { noul: 0.05 },
      },
    }),
    close: vi.fn(),
  };
}

beforeEach(() => {
  for (const variable of ["ULTRAFAST_PRIMARY_PROVIDER", "ULTRAFAST_SECONDARY_PROVIDER", "ULTRAFAST_FAILBACK_PROVIDER"]) {
    vi.stubEnv(variable, "");
  }
  remoteCall.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("Jev provider configuration", () => {
  it("uses Jev without consulting removed model configuration", async () => {
    vi.stubEnv("LAYA_MLX_MODEL", "/unused/local-model");
    vi.stubEnv("TYPESAFE_DEFAULT_MODEL", "jev-configured");
    const jev = client();
    const policy = new JevPolicy(jev);

    const decision = await policy.decide(SNAPSHOT, "Open the report", []);

    expect(decision).toMatchObject({ provider: "jev", model: "jev-test", targetIndex: 17 });
    expect(jev.systemOne).toHaveBeenCalledTimes(2);
    expect(jev.systemOne.mock.calls[0]?.[0]).toMatchObject({ model: "jev-configured" });
    policy.close();
    expect(jev.close).toHaveBeenCalledTimes(1);
    expect(remoteCall).not.toHaveBeenCalled();
  });

  it.each(["laya", " LAYA ", "local", "local-only", "none", "unknown"])(
    "rejects an explicit %s primary before calling any client",
    (primary) => {
      vi.stubEnv("ULTRAFAST_PRIMARY_PROVIDER", primary);
      const jev = client();
      expect(() => new JevPolicy(jev)).toThrow("ULTRAFAST_PRIMARY_PROVIDER only supports jev");
      expect(jev.systemOne).not.toHaveBeenCalled();
      expect(remoteCall).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ULTRAFAST_SECONDARY_PROVIDER", "laya"],
    ["ULTRAFAST_SECONDARY_PROVIDER", "jev"],
    ["ULTRAFAST_FAILBACK_PROVIDER", "laya"],
    ["ULTRAFAST_FAILBACK_PROVIDER", "local-only"],
  ])("rejects %s=%s even when the other name says none", (variable, value) => {
    vi.stubEnv("ULTRAFAST_SECONDARY_PROVIDER", "none");
    vi.stubEnv("ULTRAFAST_FAILBACK_PROVIDER", "none");
    vi.stubEnv(variable, value);
    expect(() => new JevPolicy(client())).toThrow(`${variable} only supports none`);
    expect(remoteCall).not.toHaveBeenCalled();
  });

  it.each(["", "none", "off", "disabled", " NONE "])("accepts disabled secondary spelling %s", async (value) => {
    vi.stubEnv("ULTRAFAST_PRIMARY_PROVIDER", " JEV ");
    vi.stubEnv("ULTRAFAST_SECONDARY_PROVIDER", value);
    vi.stubEnv("ULTRAFAST_FAILBACK_PROVIDER", value);
    const jev = client();
    expect((await new JevPolicy(jev).decide(SNAPSHOT, "Open the report", [])).provider).toBe("jev");
  });

  it("leaves a weak valid decision for the caller threshold gate without retrying", async () => {
    const jev = client(0.4);
    const decision = await new JevPolicy(jev).decide(SNAPSHOT, "Open the report", []);
    expect(decision.executionProbability).toBe(0.4);
    expect(jev.systemOne).toHaveBeenCalledTimes(2);
    expect(remoteCall).not.toHaveBeenCalled();
  });

  it("returns a provider failure without starting another provider", async () => {
    const jev = client();
    jev.systemOne.mockRejectedValue(new Error("offline test failure"));
    await expect(new JevPolicy(jev).decide(SNAPSHOT, "Open the report", [])).rejects.toThrow("offline test failure");
    expect(jev.systemOne).toHaveBeenCalledTimes(1);
    expect(remoteCall).not.toHaveBeenCalled();
  });

  it("rechecks routing on a reused policy", async () => {
    const jev = client();
    const policy = new JevPolicy(jev);
    vi.stubEnv("ULTRAFAST_PRIMARY_PROVIDER", "laya");
    await expect(policy.decide(SNAPSHOT, "Open the report", [])).rejects.toThrow("only supports jev");
    expect(jev.systemOne).not.toHaveBeenCalled();
  });

  it("rejects stale routing even for a direct Jev client", async () => {
    vi.stubEnv("ULTRAFAST_PRIMARY_PROVIDER", "laya");
    await expect(new JevClient().systemOne({ state: {}, questions: {} })).rejects.toThrow("only supports jev");
    expect(remoteCall).not.toHaveBeenCalled();
  });

  it("keeps the missing credential failure local", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    await expect(new JevClient().systemOne({ state: {}, questions: {} })).rejects.toThrow("TypeSafe Jev unavailable");
    expect(remoteCall).not.toHaveBeenCalled();
  });
});
