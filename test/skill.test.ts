import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const SCRIPT = join(process.cwd(), "skills/ultrafast-computer-use/scripts/decide-file.sh");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ultrafast-skill-"));
  const scripts = join(root, "skills/ultrafast-computer-use/scripts");
  await mkdir(scripts, { recursive: true });
  await mkdir(join(root, "dist"));
  await copyFile(SCRIPT, join(scripts, "decide-file.sh"));
  // Observe shell configuration without a model, API, GUI, or real credential.
  await writeFile(join(root, "dist/cli.js"), `
    console.log(JSON.stringify({
      primary: process.env.ULTRAFAST_PRIMARY_PROVIDER,
      secondary: process.env.ULTRAFAST_SECONDARY_PROVIDER,
      alias: process.env.ULTRAFAST_FAILBACK_PROVIDER,
      removedConfigLoaded: process.env.REMOVED_CONFIG_LOADED
    }));
  `);
  const jevEnv = join(root, "jev.env");
  await writeFile(jevEnv, [
    "export ULTRAFAST_PRIMARY_PROVIDER=jev",
    "export ULTRAFAST_SECONDARY_PROVIDER=none",
    "export ULTRAFAST_FAILBACK_PROVIDER=none",
  ].join("\n"), { mode: 0o600 });
  const removedEnv = join(root, "removed.env");
  await writeFile(removedEnv, "export REMOVED_CONFIG_LOADED=yes\n", { mode: 0o600 });
  const request = join(root, "request.json");
  await writeFile(request, "{}", { mode: 0o600 });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ULTRAFAST_JEV_ENV_FILE: jevEnv,
    ULTRAFAST_LAYA_ENV_FILE: removedEnv,
  };
  delete env.TYPESAFE_API_KEY;
  delete env.ULTRAFAST_PRIMARY_PROVIDER;
  delete env.ULTRAFAST_SECONDARY_PROVIDER;
  delete env.ULTRAFAST_FAILBACK_PROVIDER;
  delete env.REMOVED_CONFIG_LOADED;
  return { root, request, env, script: join(scripts, "decide-file.sh") };
}

describe("installed skill script configuration", () => {
  it("loads only Jev configuration and removes the request", async () => {
    const f = await fixture();
    try {
      const result = await run("/bin/zsh", [f.script, f.request], { env: f.env });
      expect(JSON.parse(result.stdout)).toEqual({ primary: "jev", secondary: "none", alias: "none" });
      await expect(readFile(f.request)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

  it.each([
    ["ULTRAFAST_PRIMARY_PROVIDER", "laya", "primary"],
    ["ULTRAFAST_PRIMARY_PROVIDER", "local-only", "primary"],
    ["ULTRAFAST_SECONDARY_PROVIDER", "laya", "secondary"],
    ["ULTRAFAST_FAILBACK_PROVIDER", "laya", "alias"],
  ])("preserves explicit %s=%s across the Jev env file", async (variable, value, field) => {
    const f = await fixture();
    try {
      const result = await run("/bin/zsh", [f.script, f.request], { env: { ...f.env, [variable]: value } });
      expect(JSON.parse(result.stdout)[field]).toBe(value);
      await expect(readFile(f.request)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(f.root, { recursive: true });
    }
  });
});
