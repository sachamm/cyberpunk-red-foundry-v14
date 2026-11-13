import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HARNESS_CONFIG_SOURCE = fileURLToPath(
  new URL("../../tools/playwright/config/harness-config.mjs", import.meta.url),
);
const ORIGINAL_CWD = process.cwd();
const TRACKED_ENV_KEYS = [
  "FOUNDRY_APP_PATH",
  "FOUNDRY_NODE_PATH",
  "FOUNDRY_DATA_PATH",
  "FOUNDRY_VERSION",
  "FOUNDRY_KEY",
  "FOUNDRY_ADMIN_PASS",
  "FOUNDRY_WORLD_PASS",
  "PLAYWRIGHT_FOUNDRY_PORT",
  "PLAYWRIGHT_RUN_STATE_DIR",
];
const ORIGINAL_ENV = Object.fromEntries(
  TRACKED_ENV_KEYS.map((key) => [key, process.env[key]]),
);

let tempDirs = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cpr-harness-config-test-"));
  tempDirs.push(dir);
  return dir;
}

function clearTrackedEnv() {
  for (const key of TRACKED_ENV_KEYS) {
    delete process.env[key];
  }
}

async function writeHarnessFixture({ foundry, dotenv, version = "13" } = {}) {
  const root = await tempDir();
  const resolvedFoundry =
    typeof foundry === "function" ? foundry(root) : foundry;

  const harnessConfigPath = path.join(
    root,
    "tools",
    "playwright",
    "config",
    "harness-config.mjs",
  );
  fs.ensureDirSync(path.dirname(harnessConfigPath));
  fs.copyFileSync(HARNESS_CONFIG_SOURCE, harnessConfigPath);
  fs.outputJSONSync(path.join(root, "src", "system.json"), {
    compatibility: { verified: version },
  });
  fs.outputJSONSync(path.join(root, "foundryconfig.json"), {
    foundry: resolvedFoundry ?? {},
  });

  if (dotenv !== undefined) {
    fs.writeFileSync(path.join(root, ".env"), dotenv);
  }

  fs.ensureDirSync(path.join(root, ".git"));

  return root;
}

async function importHarnessModule(root, cwd = root) {
  process.chdir(cwd);
  const harnessConfigPath = path.join(
    root,
    "tools",
    "playwright",
    "config",
    "harness-config.mjs",
  );
  const harnessConfigUrl = pathToFileURL(harnessConfigPath);
  // Re-import so each test reruns any module-level env/bootstrap logic.
  return import(`${harnessConfigUrl.href}?test=${Date.now()}-${Math.random()}`);
}

async function resolveHarnessConfig(root, options = { mode: "live" }) {
  const module = await importHarnessModule(root);
  return module.resolveHarnessConfig(options);
}

function foundryConfig(root) {
  return {
    appPath: path.join(root, "apps", "foundry-{VERSION}"),
    dataPath: path.join(root, "data", "foundry-{VERSION}"),
    versionPrefix: "release-",
    licenseKey: "config-license",
    adminPassword: "config-admin",
    worldPassword: "config-world",
  };
}

afterEach(async () => {
  process.chdir(ORIGINAL_CWD);
  for (const key of TRACKED_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  tempDirs = [];
});

describe("playwright harness config", () => {
  it("selects a dedicated Foundry runtime without changing the tooling runtime", async () => {
    clearTrackedEnv();
    const root = await writeHarnessFixture({
      foundry: (dir) => ({
        ...foundryConfig(dir),
        nodePath: "/runtime/node24",
      }),
    });
    expect((await resolveHarnessConfig(root)).nodePath).toBe("/runtime/node24");
    process.env.FOUNDRY_NODE_PATH = "/override/node24";
    expect((await resolveHarnessConfig(root)).nodePath).toBe(
      "/override/node24",
    );
  });

  it("resolves required secrets from explicit environment", async () => {
    clearTrackedEnv();
    process.env.FOUNDRY_KEY = "env-license";
    process.env.FOUNDRY_ADMIN_PASS = "env-admin";
    process.env.FOUNDRY_WORLD_PASS = "env-world";

    const root = await writeHarnessFixture({ foundry: foundryConfig });
    const config = await resolveHarnessConfig(root);

    expect(config.foundryKey).toBe("env-license");
    expect(config.foundryAdminPass).toBe("env-admin");
    expect(config.foundryWorldPass).toBe("env-world");
  });

  it("loads repo-root .env secrets before config resolution", async () => {
    clearTrackedEnv();

    const root = await writeHarnessFixture({
      foundry: foundryConfig,
      dotenv: [
        "FOUNDRY_KEY=dotenv-license",
        "FOUNDRY_ADMIN_PASS=dotenv-admin",
        "FOUNDRY_WORLD_PASS=dotenv-world",
      ].join("\n"),
    });
    const config = await resolveHarnessConfig(root);

    expect(config.foundryKey).toBe("dotenv-license");
    expect(config.foundryAdminPass).toBe("dotenv-admin");
    expect(config.foundryWorldPass).toBe("dotenv-world");
  });

  it("keeps explicit environment secrets over .env values", async () => {
    clearTrackedEnv();
    process.env.FOUNDRY_KEY = "env-license";
    process.env.FOUNDRY_ADMIN_PASS = "env-admin";
    process.env.FOUNDRY_WORLD_PASS = "env-world";

    const root = await writeHarnessFixture({
      foundry: foundryConfig,
      dotenv: [
        "FOUNDRY_KEY=dotenv-license",
        "FOUNDRY_ADMIN_PASS=dotenv-admin",
        "FOUNDRY_WORLD_PASS=dotenv-world",
      ].join("\n"),
    });
    const config = await resolveHarnessConfig(root);

    expect(config.foundryKey).toBe("env-license");
    expect(config.foundryAdminPass).toBe("env-admin");
    expect(config.foundryWorldPass).toBe("env-world");
  });

  it("loads repo-root .env secrets when caller cwd differs", async () => {
    clearTrackedEnv();

    const root = await writeHarnessFixture({
      dotenv: [
        "FOUNDRY_KEY=dotenv-license",
        "FOUNDRY_ADMIN_PASS=dotenv-admin",
        "FOUNDRY_WORLD_PASS=dotenv-world",
      ].join("\n"),
    });
    const callerCwd = await tempDir();
    process.env.FOUNDRY_VERSION = "13";
    process.env.FOUNDRY_APP_PATH = path.join(
      callerCwd,
      "apps",
      "foundry-{VERSION}",
    );
    process.env.FOUNDRY_DATA_PATH = path.join(
      callerCwd,
      "data",
      "foundry-{VERSION}",
    );

    const module = await importHarnessModule(root, callerCwd);
    const config = module.resolveHarnessConfig({ mode: "live" });

    expect(config.foundryKey).toBe("dotenv-license");
    expect(config.foundryAdminPass).toBe("dotenv-admin");
    expect(config.foundryWorldPass).toBe("dotenv-world");
  });

  it("falls back to foundryconfig secrets when env values are absent", async () => {
    clearTrackedEnv();

    const root = await writeHarnessFixture({ foundry: foundryConfig });
    const config = await resolveHarnessConfig(root);

    expect(config.foundryKey).toBe("config-license");
    expect(config.foundryAdminPass).toBe("config-admin");
    expect(config.foundryWorldPass).toBe("config-world");
    expect(config.version).toBe("13");
    expect(config.appPath).toBe(path.join(root, "apps", "foundry-release-13"));
    expect(config.dataPath).toBe(path.join(root, "data", "foundry-release-13"));
    expect(config.appDir).toBe(path.join(root, "apps", "foundry-release-13"));
  });

  it("keeps env-backed secrets ahead of foundryconfig fallback", async () => {
    clearTrackedEnv();
    process.env.FOUNDRY_KEY = "env-license";
    process.env.FOUNDRY_ADMIN_PASS = "env-admin";
    process.env.FOUNDRY_WORLD_PASS = "env-world";

    const root = await writeHarnessFixture({ foundry: foundryConfig });
    const config = await resolveHarnessConfig(root);

    expect(config.foundryKey).toBe("env-license");
    expect(config.foundryAdminPass).toBe("env-admin");
    expect(config.foundryWorldPass).toBe("env-world");
  });
});
