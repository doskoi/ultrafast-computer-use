import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { ReadOnlySafetyPolicy, sanitizeAccessibilityText } from "./ax.js";
import { StaleSnapshotError, type ComputerDriver } from "./sky.js";
import type { ComputerElement, ComputerSnapshot, Decision, ElementOperation, Operation } from "./types.js";

const execFileAsync = promisify(execFile);

export type AgentDesktopRunner = (args: readonly string[]) => Promise<unknown>;

export interface AgentDesktopNode {
  readonly role?: string;
  readonly name?: string;
  readonly ref_id?: string;
  readonly available_actions?: readonly string[];
  readonly children?: readonly AgentDesktopNode[];
}

export interface AgentDesktopData {
  readonly app?: string;
  readonly snapshot_id?: string;
  readonly tree?: AgentDesktopNode;
}

export interface AgentDesktopEnvelope {
  readonly ok?: boolean;
  readonly command?: string;
  readonly data?: AgentDesktopData;
  readonly error?: { readonly code?: string; readonly message?: string };
}

export interface AgentDesktopOptions {
  readonly app: string;
  readonly windowId?: number;
  readonly bin?: string;
  readonly run?: AgentDesktopRunner;
  readonly waitMs?: number;
  readonly safety?: ReadOnlySafetyPolicy;
}

const DEFAULT_BIN = process.env.AGENT_DESKTOP_BIN ?? "agent-desktop";

/** Runs one agent-desktop command and returns its JSON envelope. */
export async function runAgentDesktop(args: readonly string[], bin = DEFAULT_BIN): Promise<unknown> {
  const { stdout } = await execFileAsync(bin, [...args], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout) as unknown;
}

function flatten(node: AgentDesktopNode, out: AgentDesktopNode[]): void {
  if (typeof node.ref_id === "string" && node.ref_id !== "") out.push(node);
  for (const child of node.children ?? []) flatten(child, out);
}

function describeNode(node: AgentDesktopNode): string {
  const role = (node.role ?? "element").toLowerCase();
  const name = node.name?.trim() ?? "";
  return sanitizeAccessibilityText(name === "" ? role : `${role} "${name}"`).slice(0, 600);
}

/** Builds a safe action space from one agent-desktop snapshot. */
export function snapshotFromAgentDesktop(
  app: string,
  envelope: AgentDesktopEnvelope,
  safety: ReadOnlySafetyPolicy = new ReadOnlySafetyPolicy(),
): { snapshot: ComputerSnapshot; refs: ReadonlyMap<number, string> } {
  if (!app.trim()) throw new TypeError("app must be a non-empty string");
  if (envelope.ok !== true) {
    throw new Error(envelope.error?.message ?? "agent-desktop snapshot failed");
  }
  const data = envelope.data;
  if (data?.tree === undefined) throw new Error("agent-desktop returned no snapshot tree");
  if (typeof data.snapshot_id !== "string" || data.snapshot_id.trim() === "") {
    throw new Error("agent-desktop did not return a snapshot_id");
  }
  const nodes: AgentDesktopNode[] = [];
  flatten(data.tree, nodes);
  const elements: ComputerElement[] = [];
  const refs = new Map<number, string>();
  for (const node of nodes) {
    const actions = node.available_actions ?? [];
    const scrollable = actions.includes("Scroll");
    const clickable = actions.includes("Click") || actions.includes("SetFocus") || actions.includes("Toggle");
    if (!clickable && !scrollable) continue;
    const description = describeNode(node);
    if (description === "" || !safety.allows(description)) continue;
    const operations: ElementOperation[] = scrollable
      ? ["SCROLL_DOWN", "SCROLL_UP", "SCROLL_LEFT", "SCROLL_RIGHT"]
      : ["CLICK"];
    const index = elements.length;
    elements.push({ index, description, operations });
    refs.set(index, node.ref_id as string);
    if (elements.length >= 200) break;
  }
  if (elements.length === 0) throw new Error("agent-desktop returned no safe actionable elements");
  const lines = [
    `Window: ${app}`,
    ...elements.map((element) => `- [${element.index}] ${element.description}`),
  ];
  const text = sanitizeAccessibilityText(lines.join("\n"));
  return {
    snapshot: {
      app,
      accessibilityText: text,
      modelText: text,
      elements,
      fingerprint: createHash("sha256").update(text).digest("hex"),
    },
    refs,
  };
}

/** ComputerDriver over the agent-desktop CLI. */
export class AgentDesktopComputer implements ComputerDriver {
  private readonly run: AgentDesktopRunner;
  private readonly waitMs: number;
  private readonly safety: ReadOnlySafetyPolicy;
  private refs: ReadonlyMap<number, string> = new Map();

  constructor(private readonly options: AgentDesktopOptions) {
    if (!options.app.trim()) throw new TypeError("app must be a non-empty string");
    if (options.windowId !== undefined && (!Number.isSafeInteger(options.windowId) || options.windowId <= 0)) {
      throw new RangeError("windowId must be a positive integer");
    }
    const bin = options.bin ?? DEFAULT_BIN;
    this.run = options.run ?? ((args) => runAgentDesktop(args, bin));
    this.waitMs = options.waitMs ?? 750;
    this.safety = options.safety ?? new ReadOnlySafetyPolicy();
  }

  private snapshotArgs(): string[] {
    const args = ["snapshot", "--app", this.options.app, "-i", "--compact"];
    if (this.options.windowId !== undefined) args.push("--window-id", String(this.options.windowId));
    return args;
  }

  async observe(): Promise<ComputerSnapshot> {
    const raw = await this.run(this.snapshotArgs());
    const { snapshot, refs } = snapshotFromAgentDesktop(this.options.app, raw as AgentDesktopEnvelope, this.safety);
    this.refs = refs;
    return snapshot;
  }

  async execute(snapshot: ComputerSnapshot, decision: Decision): Promise<void> {
    const current = await this.observe();
    if (current.fingerprint !== snapshot.fingerprint) throw new StaleSnapshotError();
    if (decision.operation === "WAIT") {
      await sleep(this.waitMs);
      return;
    }
    if (decision.targetIndex === null) {
      throw new Error(`${decision.operation} requires a current element target`);
    }
    const target = current.elements.find((element) => (
      element.index === decision.targetIndex
      && element.operations.includes(decision.operation as ElementOperation)
    ));
    if (target === undefined) {
      throw new Error("Ultrafast selected an element outside the fresh safe action space");
    }
    const ref = this.refs.get(target.index);
    if (ref === undefined) throw new Error("agent-desktop ref is missing for the selected element");
    if (decision.operation === "CLICK") {
      await this.run(["click", ref]);
      return;
    }
    const directions: Partial<Record<Operation, "up" | "down" | "left" | "right">> = {
      SCROLL_DOWN: "down",
      SCROLL_UP: "up",
      SCROLL_LEFT: "left",
      SCROLL_RIGHT: "right",
    };
    const direction = directions[decision.operation];
    if (direction === undefined) throw new Error(`Operation ${decision.operation} is not executable`);
    await this.run(["scroll", ref, "--direction", direction, "--amount", "3"]);
  }
}
