#!/usr/bin/env node

import { decideRequestFile, RESPONSE_VERSION } from "./bridge.js";
import { DecisionProvidersUnavailableError } from "./policy.js";

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const [command, requestFile, ...rest] = process.argv.slice(2);
  if (command !== "decide-file" || requestFile === undefined || rest.length > 0) {
    write({
      version: RESPONSE_VERSION,
      ok: false,
      error: { code: "usage", message: "Usage: ultrafast-computer-use decide-file /tmp/request.json" },
    });
    process.exitCode = 64;
    return;
  }
  try {
    write(await decideRequestFile(requestFile));
  } catch (error) {
    const providerUnavailable = error instanceof DecisionProvidersUnavailableError
      || (error instanceof Error && (
        error.message.startsWith("Local Laya")
        || error.message.startsWith("TypeSafe Jev")
      ));
    write({
      version: RESPONSE_VERSION,
      ok: false,
      error: {
        code: providerUnavailable ? "provider_unavailable" : "decision_failed",
        message: providerUnavailable
          ? "Configured decision providers are unavailable"
          : error instanceof Error ? error.message.slice(0, 500) : "Unknown decision failure",
      },
    });
    process.exitCode = providerUnavailable ? 78 : 1;
  }
}

await main();
