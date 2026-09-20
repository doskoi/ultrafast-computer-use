#!/usr/bin/env node

import { decideRequestFile, RESPONSE_VERSION } from "./bridge.js";

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const [command, requestFile, ...rest] = process.argv.slice(2);
  if (command !== "decide-file" || requestFile === undefined || rest.length > 0) {
    write({
      version: RESPONSE_VERSION,
      ok: false,
      error: { code: "usage", message: "Usage: jev-computer-use decide-file /tmp/request.json" },
    });
    process.exitCode = 64;
    return;
  }
  try {
    write(await decideRequestFile(requestFile));
  } catch (error) {
    const layaUnavailable = error instanceof Error
      && error.message.startsWith("Local Laya");
    write({
      version: RESPONSE_VERSION,
      ok: false,
      error: {
        code: layaUnavailable ? "laya_unavailable" : "decision_failed",
        message: layaUnavailable
          ? "Local laya-mlx is unavailable"
          : error instanceof Error ? error.message.slice(0, 500) : "Unknown decision failure",
      },
    });
    process.exitCode = layaUnavailable ? 78 : 1;
  }
}

await main();
