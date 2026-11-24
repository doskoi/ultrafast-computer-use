import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JevClient } from "../src/policy.js";

const remoteCall = vi.hoisted(() => vi.fn());
vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    systemOne = remoteCall;
  },
}));

const ROUTING = [
  "ULTRAFAST_PRIMARY_PROVIDER",
  "ULTRAFAST_SECONDARY_PROVIDER",
  "ULTRAFAST_FALLBACK_PROVIDER",
];

const REQUEST = { state: {}, questions: {} } as never;

beforeEach(() => {
  for (const variable of ROUTING) vi.stubEnv(variable, "");
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  remoteCall.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("removed provider routing", () => {
  it.each([
    ["ULTRAFAST_SECONDARY_PROVIDER", "laya"],
    ["ULTRAFAST_FALLBACK_PROVIDER", "laya"],
    ["ULTRAFAST_FALLBACK_PROVIDER", "local-only"],
  ])("rejects %s=%s even when the other names say none", async (variable, value) => {
    vi.stubEnv("ULTRAFAST_SECONDARY_PROVIDER", "none");
    vi.stubEnv("ULTRAFAST_FALLBACK_PROVIDER", "none");
    vi.stubEnv(variable, value);

    await expect(new JevClient().systemOne(REQUEST)).rejects.toThrow(`${variable} only supports none`);
    expect(remoteCall).not.toHaveBeenCalled();
  });

  it.each([
    ["ULTRAFAST_SECONDARY_PROVIDER", " DISABLED "],
    ["ULTRAFAST_FALLBACK_PROVIDER", " DISABLED "],
    ["ULTRAFAST_FALLBACK_PROVIDER", "off"],
  ])("accepts %s=%s", async (variable, value) => {
    vi.stubEnv(variable, value);
    remoteCall.mockRejectedValueOnce(new Error("remote-called"));

    await expect(new JevClient().systemOne(REQUEST)).rejects.toThrow("remote-called");
    expect(remoteCall).toHaveBeenCalledTimes(1);
  });

  it("still rejects a missing credential before any remote call", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");

    await expect(new JevClient().systemOne(REQUEST)).rejects.toThrow("TypeSafe Jev unavailable");
    expect(remoteCall).not.toHaveBeenCalled();
  });
});
