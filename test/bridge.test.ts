import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
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

class FakeClient implements SystemOneClientLike {
  async systemOne() {
    return {
      model: "jev-test",
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
    const directory = await mkdtemp(join(tmpdir(), "jev-computer-use-"));
    const requestFile = join(directory, "request.json");
    await writeFile(requestFile, JSON.stringify(REQUEST), { mode: 0o600 });
    await chmod(requestFile, 0o600);

    const response = await decideRequestFile(requestFile, new FakeClient());

    expect(response).toMatchObject({ ok: true, decision: { operation: "CLICK", targetIndex: 17 } });
    await expect(readFile(requestFile)).rejects.toMatchObject({ code: "ENOENT" });
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
