import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { Questions, SystemOneClientLike, SystemOneRequest, SystemOneResponse } from "./policy.js";

export interface LayaClientOptions {
  readonly model?: string;
  readonly dtype?: "float16" | "float32" | "bfloat16";
  readonly device?: "gpu" | "metal" | "cpu";
  readonly python?: string;
  readonly workerPath?: string;
}

interface WorkerResponse {
  readonly id?: unknown;
  readonly ok?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly message?: unknown };
}

interface PendingRequest {
  readonly resolve: (response: SystemOneResponse) => void;
  readonly reject: (error: Error) => void;
}

const DEFAULT_MODEL = "aac6fef/laya-multilingual-mlx";

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isResponse(value: unknown): value is SystemOneResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSONL client for one long-lived local laya-mlx Python worker. */
export class LayaClient implements SystemOneClientLike {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private stderr = "";

  constructor(private readonly options: LayaClientOptions = {}) {}

  systemOne(request: SystemOneRequest): Promise<SystemOneResponse> {
    const child = this.ensureWorker();
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<SystemOneResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = JSON.stringify({ id, state: request.state, questions: request.questions }) + "\n";
      try {
        child.stdin.write(payload, (error) => {
          if (error == null) return;
          this.pending.delete(id);
          reject(new Error(`Local Laya worker write failed: ${error.message}`));
        });
      } catch (error) {
        this.pending.delete(id);
        reject(new Error(`Local Laya worker write failed: ${asError(error).message}`));
      }
    });
  }

  close(): void {
    const child = this.child;
    this.child = null;
    if (child === null) return;
    this.rejectPending(new Error("Local Laya worker closed"));
    child.kill();
  }

  private ensureWorker(): ChildProcessWithoutNullStreams {
    if (this.child !== null) return this.child;
    const python = this.options.python ?? process.env.LAYA_MLX_PYTHON ?? "python3";
    const workerPath = this.options.workerPath
      ?? fileURLToPath(new URL("../python/laya_worker.py", import.meta.url));
    const child = spawn(python, [workerPath], {
      env: {
        ...process.env,
        LAYA_MLX_MODEL: this.options.model ?? process.env.LAYA_MLX_MODEL ?? DEFAULT_MODEL,
        LAYA_MLX_DTYPE: this.options.dtype ?? process.env.LAYA_MLX_DTYPE ?? "float16",
        LAYA_MLX_DEVICE: this.options.device ?? process.env.LAYA_MLX_DEVICE ?? "gpu",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.consume(chunk));
    child.stderr.on("data", (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-2_000);
    });
    child.on("error", (error) => {
      this.child = null;
      this.rejectPending(new Error(`Local Laya runtime unavailable: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      if (this.pending.size === 0) return;
      const detail = this.stderr.trim();
      const suffix = detail ? `: ${detail}` : "";
      this.rejectPending(new Error(`Local Laya worker exited (${code ?? signal})${suffix}`));
    });
    return child;
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      if (line.trim() === "") continue;
      let parsed: WorkerResponse;
      try {
        parsed = JSON.parse(line) as WorkerResponse;
      } catch {
        this.rejectPending(new Error("Local Laya worker returned invalid JSON"));
        continue;
      }
      if (!Number.isSafeInteger(parsed.id)) {
        this.rejectPending(new Error("Local Laya worker returned an invalid request id"));
        continue;
      }
      const pending = this.pending.get(parsed.id as number);
      if (pending === undefined) continue;
      this.pending.delete(parsed.id as number);
      if (parsed.ok !== true) {
        const message = typeof parsed.error?.message === "string"
          ? parsed.error.message
          : "unknown local Laya error";
        pending.reject(new Error(`Local Laya decision failed: ${message}`));
      } else if (!isResponse(parsed.result)) {
        pending.reject(new Error("Local Laya worker returned an invalid decision"));
      } else {
        pending.resolve(parsed.result);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export type { Questions };
