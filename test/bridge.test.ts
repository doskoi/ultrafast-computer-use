import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decideRequest,
  decideRequestFile,
  parseDecisionRequest,
  REQUEST_VERSION,
} from "../src/bridge.js";
import type { SystemOneClientLike } from "../src/policy.js";

const REQUEST = {
  version: REQUEST_VERSION,
  app: "Preview",
  goal: "Open the report",
  accessibilityText: 'AXButton "Open report" [element_index=17]',
};

afterEach(() => vi.unstubAllEnvs());

class FakeClient implements SystemOneClientLike {
  async systemOne() {
    return {
      model: "ultrafast-test",
      answers: {
        operation: {
          choice: "CLICK",
          confidence: 1,
          probabilities: { CLICK: 1, WAIT: 0, DONE: 0, BLOCKED: 0 },
        },
        click_target: { choice: "17", confidence: 1, probabilities: { "17": 1 } },
        goal_complete: { noul: 0 },
      },
    };
  }
}

describe("decision bridge", () => {
  it("validates the version and input bounds", () => {
    expect(parseDecisionRequest(REQUEST)).toMatchObject({ app: "Preview", history: [] });
    expect(() => parseDecisionRequest({ ...REQUEST, version: "old" })).toThrow("version must be");
    expect(() => parseDecisionRequest({ ...REQUEST, goal: "" })).toThrow("goal must be");
  });

  it("decides from a 0600 temp file and deletes it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ultrafast-computer-use-"));
    const requestFile = join(directory, "request.json");
    await writeFile(requestFile, JSON.stringify(REQUEST), { mode: 0o600 });
    await chmod(requestFile, 0o600);

    const response = await decideRequestFile(requestFile, new FakeClient());

    expect(response).toMatchObject({ ok: true, decision: { provider: "jev", operation: "CLICK", targetIndex: 17 } });
    await expect(readFile(requestFile)).rejects.toMatchObject({ code: "ENOENT" });
    await rm(directory, { recursive: true });
  });

  it("rejects a removed provider-options argument instead of ignoring a local-only request", async () => {
    const jev = new FakeClient();
    const call = vi.spyOn(jev, "systemOne");
    await expect(Reflect.apply(decideRequest, undefined, [
      parseDecisionRequest(REQUEST), jev, { primary: "laya", secondary: null },
    ])).rejects.toThrow("Provider options are no longer supported");
    expect(call).not.toHaveBeenCalled();
  });

  it("deletes a temp request when obsolete options are rejected", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ultrafast-rejected-options-"));
    const requestFile = join(directory, "request.json");
    await writeFile(requestFile, JSON.stringify(REQUEST), { mode: 0o600 });
    try {
      await expect(Reflect.apply(decideRequestFile, undefined, [
        requestFile, undefined, { primary: "laya" },
      ])).rejects.toThrow("Provider options are no longer supported");
      await expect(readFile(requestFile)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("rejects stale routing and deletes the request before any client call", async () => {
    vi.stubEnv("ULTRAFAST_PRIMARY_PROVIDER", "laya");
    const directory = await mkdtemp(join(tmpdir(), "ultrafast-rejected-routing-"));
    const requestFile = join(directory, "request.json");
    await writeFile(requestFile, JSON.stringify(REQUEST), { mode: 0o600 });
    const jev = new FakeClient();
    const call = vi.spyOn(jev, "systemOne");
    try {
      await expect(decideRequestFile(requestFile, jev)).rejects.toThrow("only supports jev");
      expect(call).not.toHaveBeenCalled();
      await expect(readFile(requestFile)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("rejects non-temporary request paths", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".bridge-test-"));
    const requestFile = join(directory, "request.json");
    await writeFile(requestFile, JSON.stringify(REQUEST), { mode: 0o600 });
    try {
      await expect(decideRequestFile(requestFile, new FakeClient()))
        .rejects.toThrow("system temporary directory");
      await expect(readFile(requestFile, "utf8")).resolves.toContain(REQUEST_VERSION);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
