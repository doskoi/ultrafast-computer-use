import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { ReadOnlySafetyPolicy, sanitizeAccessibilityText } from "./ax.js";
import { StaleSnapshotError, type ComputerDriver } from "./sky.js";
import type { ComputerElement, ComputerSnapshot, Decision, ElementOperation, Operation } from "./types.js";

const execFileAsync = promisify(execFile);

export type CuaDriverRunner = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export interface CuaDriverElement {
  readonly element_index: number;
  readonly element_token?: string;
  readonly role: string;
  readonly label?: string;
  readonly value?: string | null;
  readonly actions?: readonly string[];
  readonly parent_index?: number;
  readonly enabled?: boolean;
}

export interface CuaDriverState {
  readonly app_name?: string;
  readonly snapshot_id: string;
  readonly elements: readonly CuaDriverElement[];
}

export interface CuaDriverOptions {
  readonly pid: number;
  readonly windowId: number;
  readonly app: string;
  readonly run?: CuaDriverRunner;
  readonly waitMs?: number;
  readonly safety?: ReadOnlySafetyPolicy;
}

const DEFAULT_BIN = process.env.CUA_DRIVER_BIN
  ?? "/Applications/CuaDriver.app/Contents/MacOS/cua-driver";

const CLICKABLE_ROLES = new Set([
  "AXButton",
  "AXLink",
  "AXTextField",
  "AXTextArea",
  "AXCheckBox",
  "AXRadioButton",
  "AXPopUpButton",
  "AXComboBox",
  "AXSlider",
  "AXTab",
  "AXRow",
  "AXCell",
  "AXDisclosureTriangle",
  "AXMenuItem",
]);

/** Runs one `cua-driver call <tool> <json>` request and returns its JSON payload. */
export async function runCuaDriverTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const { stdout } = await execFileAsync(
    DEFAULT_BIN,
    ["call", tool, JSON.stringify(args)],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as unknown;
}

function isMenuBarDescendant(
  element: CuaDriverElement,
  byIndex: ReadonlyMap<number, CuaDriverElement>,
): boolean {
  let parentIndex = element.parent_index;
  for (let depth = 0; parentIndex !== undefined && depth < 64; depth += 1) {
    const parent = byIndex.get(parentIndex);
    if (parent === undefined) return false;
    if (parent.role === "AXMenuBar") return true;
    parentIndex = parent.parent_index;
  }
  return false;
}

function describeElement(element: CuaDriverElement): string {
  const role = element.role.replace(/^AX/, "").toLowerCase();
  const parts = [role];
  if (element.label !== undefined && element.label.trim() !== "") parts.push(`"${element.label.trim()}"`);
  if (element.value !== undefined && element.value !== null && element.value.trim() !== "") {
    parts.push(`value=${element.value.trim()}`);
  }
  return sanitizeAccessibilityText(parts.join(" ")).slice(0, 600);
}

/**
 * Builds a safe action space from a cua-driver `get_window_state` payload.
 * Element indices stay identical to cua-driver's `element_index`, so the
 * decision target maps straight back to `click` / `scroll`.
 */
export function snapshotFromCuaDriverState(
  app: string,
  state: CuaDriverState,
  safety: ReadOnlySafetyPolicy = new ReadOnlySafetyPolicy(),
): ComputerSnapshot {
  if (!app.trim()) throw new TypeError("app must be a non-empty string");
  if (!Array.isArray(state.elements) || state.elements.length === 0) {
    throw new Error("cua-driver returned an empty accessibility tree");
  }
  const byIndex = new Map(state.elements.map((element) => [element.element_index, element]));
  const elements: ComputerElement[] = [];
  for (const element of state.elements) {
    if (isMenuBarDescendant(element, byIndex)) continue;
    if (element.role === "AXMenuBar") continue;
    if (element.enabled === false) continue;
    const actions = element.actions ?? [];
    const clickable = CLICKABLE_ROLES.has(element.role) || actions.includes("AXPress");
    const scrollable = element.role === "AXScrollArea";
    if (!clickable && !scrollable) continue;
    const description = describeElement(element);
    if (description === "" || !safety.allows(description)) continue;
    const operations: ElementOperation[] = scrollable
      ? ["SCROLL_DOWN", "SCROLL_UP", "SCROLL_LEFT", "SCROLL_RIGHT"]
      : ["CLICK"];
    elements.push({ index: element.element_index, description, operations });
    if (elements.length >= 200) break;
  }
  if (elements.length === 0) throw new Error("cua-driver returned no safe actionable elements");
  const lines = [
    `Window: ${app}`,
    ...elements.map((element) => `- [${element.index}] ${element.description}`),
  ];
  const text = sanitizeAccessibilityText(lines.join("\n"));
  return {
    app,
    accessibilityText: text,
    modelText: text,
    elements,
    fingerprint: createHash("sha256").update(text).digest("hex"),
  };
}

/** ComputerDriver over the cua-driver CLI/MCP surface. */
export class CuaDriverComputer implements ComputerDriver {
  private readonly run: CuaDriverRunner;
  private readonly waitMs: number;
  private readonly safety: ReadOnlySafetyPolicy;
  private snapshotId: string | null = null;

  constructor(private readonly options: CuaDriverOptions) {
    if (!Number.isSafeInteger(options.pid) || options.pid <= 0) throw new RangeError("pid must be a positive integer");
    if (!Number.isSafeInteger(options.windowId) || options.windowId <= 0) {
      throw new RangeError("windowId must be a positive integer");
    }
    if (!options.app.trim()) throw new TypeError("app must be a non-empty string");
    this.run = options.run ?? runCuaDriverTool;
    this.waitMs = options.waitMs ?? 750;
    this.safety = options.safety ?? new ReadOnlySafetyPolicy();
  }

  async observe(): Promise<ComputerSnapshot> {
    const raw = await this.run("get_window_state", {
      pid: this.options.pid,
      window_id: this.options.windowId,
      include_screenshot: false,
    });
    const state = raw as CuaDriverState;
    if (typeof state !== "object" || state === null) throw new Error("cua-driver returned a non-object state");
    if (typeof state.snapshot_id !== "string" || state.snapshot_id.trim() === "") {
      throw new Error("cua-driver did not return a snapshot_id");
    }
    this.snapshotId = state.snapshot_id;
    return snapshotFromCuaDriverState(state.app_name ?? this.options.app, state, this.safety);
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
    if (this.snapshotId === null) throw new Error("cua-driver snapshot_id is missing");
    const base = {
      pid: this.options.pid,
      window_id: this.options.windowId,
      element_index: target.index,
      snapshot_id: this.snapshotId,
    };
    if (decision.operation === "CLICK") {
      await this.run("click", { ...base, delivery_mode: "background" });
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
    await this.run("scroll", { ...base, delivery_mode: "background", direction, amount: 3 });
  }
}
