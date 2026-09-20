import { lstat, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { snapshotFromAccessibility } from "./ax.js";
import { UltrafastPolicy, type SystemOneClientLike } from "./policy.js";
import { OPERATIONS, type HistoryEntry } from "./types.js";

export const REQUEST_VERSION = "jev-computer-use.request.v1";
export const RESPONSE_VERSION = "jev-computer-use.response.v1";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

export interface DecisionRequest {
  readonly version: typeof REQUEST_VERSION;
  readonly app: string;
  readonly goal: string;
  readonly accessibilityText: string;
  readonly history: readonly HistoryEntry[];
}

function requiredString(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${key} must be a non-empty string no longer than ${maxLength} characters`);
  }
  return value;
}

function parseHistory(value: unknown): readonly HistoryEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new TypeError("history must be an array of at most 20 entries");
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TypeError("history entries must be objects");
    }
    const item = entry as Record<string, unknown>;
    if (
      typeof item.operation !== "string"
      || !OPERATIONS.includes(item.operation as never)
      || !(item.targetIndex === null || Number.isSafeInteger(item.targetIndex))
      || typeof item.description !== "string"
      || typeof item.probability !== "number"
      || !Number.isFinite(item.probability)
      || item.probability < 0
      || item.probability > 1
    ) {
      throw new TypeError("history contains an invalid entry");
    }
    return {
      operation: item.operation,
      targetIndex: item.targetIndex,
      description: item.description.slice(0, 600),
      probability: item.probability,
    } as HistoryEntry;
  });
}

export function parseDecisionRequest(value: unknown): DecisionRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("request must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== REQUEST_VERSION) throw new TypeError(`version must be ${REQUEST_VERSION}`);
  return {
    version: REQUEST_VERSION,
    app: requiredString(record, "app", 512),
    goal: requiredString(record, "goal", 4_000),
    accessibilityText: requiredString(record, "accessibilityText", MAX_REQUEST_BYTES),
    history: parseHistory(record.history),
  };
}

export async function decideRequest(
  request: DecisionRequest,
  client?: SystemOneClientLike,
): Promise<Record<string, unknown>> {
  const snapshot = snapshotFromAccessibility(request.app, request.accessibilityText);
  const policy = new UltrafastPolicy(client);
  try {
    const decision = await policy.decide(snapshot, request.goal, request.history);
    return {
      version: RESPONSE_VERSION,
      ok: true,
      snapshot: {
        app: snapshot.app,
        fingerprint: snapshot.fingerprint,
        safeElementCount: snapshot.elements.length,
      },
      decision,
    };
  } finally {
    if (client === undefined) policy.close();
  }
}

export async function decideRequestFile(
  requestFile: string,
  client?: SystemOneClientLike,
): Promise<Record<string, unknown>> {
  const resolvedRequest = resolve(requestFile);
  const tempRoots = [tmpdir(), "/tmp", "/private/tmp"].map((root) => `${resolve(root)}${sep}`);
  if (!tempRoots.some((root) => resolvedRequest.startsWith(root))) {
    throw new TypeError("request file must be inside the system temporary directory");
  }
  try {
    const metadata = await lstat(resolvedRequest);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new TypeError("request file must be a regular file");
    if ((metadata.mode & 0o077) !== 0) throw new TypeError("request file permissions must be 0600 or stricter");
    const raw = await readFile(resolvedRequest);
    if (raw.byteLength > MAX_REQUEST_BYTES) throw new RangeError("request file exceeds 2 MiB");
    return await decideRequest(parseDecisionRequest(JSON.parse(raw.toString("utf8"))), client);
  } finally {
    await unlink(resolvedRequest).catch(() => undefined);
  }
}
