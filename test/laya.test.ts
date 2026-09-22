import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LayaClient } from "../src/laya.js";

describe("local Laya client", () => {
  it("uses the local JSONL worker without a remote SDK", async () => {
    const client = new LayaClient({
      python: "python3",
      workerPath: join(process.cwd(), "test/fixtures/laya-metadata-worker.py"),
      model: "local-test",
    });

    try {
      const response = await client.systemOne({
        state: { screen: "home" },
        questions: { operation: { type: "choice", instructions: "choose", criteria: { DONE: "done" } } },
        model: "local-test",
      });
      expect(response).toEqual({
        model: "laya-test",
        answers: {
          operation: {
            choice: "DONE",
            probabilities: { DONE: 1 },
            confidence: 1,
            action: { act_probability: 0.75 },
          },
          goal_complete: { noul: 0.9 },
        },
        usage: { input_tokens: 42, output_tokens: 0 },
      });
    } finally {
      client.close();
    }
  });
});
