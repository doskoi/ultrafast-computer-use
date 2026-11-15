#!/usr/bin/env node

import { AgentDesktopComputer } from "./agent-desktop.js";
import { ComputerUseAssistant } from "./assistant.js";
import { decideRequestFile, RESPONSE_VERSION } from "./bridge.js";
import { CuaDriverComputer } from "./cua-driver.js";
import { JevPolicy } from "./policy.js";
import type { ComputerDriver } from "./sky.js";

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const USAGE = [
  "Usage:",
  "  ultrafast-computer-use decide-file /tmp/request.json",
  "  ultrafast-computer-use run --driver cua-driver --pid N --window-id N --app NAME --goal TEXT [--execute] [--max-steps N]",
  "  ultrafast-computer-use run --driver agent-desktop --app NAME [--window-id N] --goal TEXT [--execute] [--max-steps N]",
].join("\n");

interface RunOptions {
  readonly driver: "cua-driver" | "agent-desktop";
  readonly pid?: number;
  readonly windowId?: number;
  readonly app: string;
  readonly goal: string;
  readonly execute: boolean;
  readonly maxSteps: number;
}

function integerFlag(value: string | undefined, name: string): number {
  if (value === undefined) throw new TypeError(`--${name} is required`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`--${name} must be a positive integer`);
  return parsed;
}

function parseRun(argv: readonly string[]): RunOptions {
  const flags = new Map<string, string>();
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new TypeError(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new TypeError(`${argument} requires a value`);
    flags.set(key, value);
    index += 1;
  }
  const driver = flags.get("driver");
  if (driver !== "cua-driver" && driver !== "agent-desktop") {
    throw new TypeError("--driver must be cua-driver or agent-desktop");
  }
  const goal = flags.get("goal");
  if (goal === undefined || goal.trim() === "") throw new TypeError("--goal is required");
  const app = flags.get("app");
  if (app === undefined || app.trim() === "") throw new TypeError("--app is required");
  const maxSteps = flags.has("max-steps") ? integerFlag(flags.get("max-steps"), "max-steps") : 20;
  if (driver === "cua-driver") {
    return {
      driver,
      pid: integerFlag(flags.get("pid"), "pid"),
      windowId: integerFlag(flags.get("window-id"), "window-id"),
      app,
      goal,
      execute,
      maxSteps,
    };
  }
  const windowId = flags.has("window-id") ? integerFlag(flags.get("window-id"), "window-id") : undefined;
  return {
    driver,
    app,
    goal,
    execute,
    maxSteps,
    ...(windowId === undefined ? {} : { windowId }),
  };
}

function driverFor(options: RunOptions): ComputerDriver {
  if (options.driver === "cua-driver") {
    return new CuaDriverComputer({
      pid: options.pid as number,
      windowId: options.windowId as number,
      app: options.app,
    });
  }
  return new AgentDesktopComputer({
    app: options.app,
    ...(options.windowId === undefined ? {} : { windowId: options.windowId }),
  });
}

async function runAssistant(options: RunOptions): Promise<void> {
  const policy = new JevPolicy();
  try {
    const assistant = new ComputerUseAssistant(driverFor(options), policy);
    if (!options.execute) {
      const { snapshot, decision } = await assistant.suggest(options.goal);
      write({
        ok: true,
        mode: "suggest",
        snapshot: { app: snapshot.app, fingerprint: snapshot.fingerprint, safeElementCount: snapshot.elements.length },
        decision,
      });
      return;
    }
    const results = [];
    for await (const result of assistant.run(options.goal, { maxSteps: options.maxSteps })) results.push(result);
    write({ ok: true, mode: "execute", results });
  } finally {
    policy.close();
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "decide-file" && rest.length === 1) {
    write(await decideRequestFile(rest[0] as string));
    return;
  }
  if (command === "run") {
    await runAssistant(parseRun(rest));
    return;
  }
  write({
    version: RESPONSE_VERSION,
    ok: false,
    error: { code: "usage", message: USAGE },
  });
  process.exitCode = 64;
}

try {
  await main();
} catch (error) {
  const providerUnavailable = error instanceof Error && error.message.startsWith("TypeSafe Jev");
  write({
    version: RESPONSE_VERSION,
    ok: false,
    error: {
      code: providerUnavailable ? "provider_unavailable" : "command_failed",
      message: providerUnavailable
        ? "Configured decision providers are unavailable"
        : error instanceof Error ? error.message.slice(0, 500) : "Unknown command failure",
    },
  });
  process.exitCode = providerUnavailable ? 78 : 1;
}
