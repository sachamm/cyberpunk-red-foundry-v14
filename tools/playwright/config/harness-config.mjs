import fs from "fs-extra";
import { rm } from "node:fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "node:url";

const REPO_SECRET_ENV_KEYS = new Set([
  "FOUNDRY_ADMIN_PASS",
  "FOUNDRY_KEY",
  "FOUNDRY_WORLD_PASS",
]);
const loadedRepoSecrets = new Map();

function findRepoRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    if (fs.existsSync(path.join(currentDir, ".git"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ENV_PATH = REPO_ROOT ? path.join(REPO_ROOT, ".env") : undefined;

function parseDotEnvValue(rawValue) {
  const value = rawValue.trim();
  if (!value) return "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0];
    const inner = value.slice(1, -1);
    if (quote === "'") return inner;

    return inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  const commentIndex = value.search(/\s#/);
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trim();
}

function loadRepoSecrets() {
  loadedRepoSecrets.clear();

  if (!REPO_ENV_PATH || !fs.existsSync(REPO_ENV_PATH)) return;

  const envFile = fs.readFileSync(REPO_ENV_PATH, "utf8");
  for (const rawLine of envFile.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const entry = line.startsWith("export ") ? line.slice(7) : line;
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = entry.slice(0, separatorIndex).trim();
    if (!REPO_SECRET_ENV_KEYS.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    loadedRepoSecrets.set(
      key,
      parseDotEnvValue(entry.slice(separatorIndex + 1)),
    );
  }
}

function readSecretEnv(key) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }
  return loadedRepoSecrets.get(key);
}

function resolveSecret(key, fallbackValue) {
  const envValue = readSecretEnv(key);
  if (envValue !== undefined) {
    return envValue;
  }
  return fallbackValue ?? "";
}

// Load repo-root .env once so shared harness resolution can consume env-backed secrets.
loadRepoSecrets();

export const SYSTEM_NAME = process.env.SYSTEM_NAME || "cyberpunk-red-core";
export const DEFAULT_VERSION_PREFIX = "v";
const DEFAULT_RUN_STATE_DIR = path.resolve(".playwright", "run-state");
export const RUN_STATE_DIR = path.resolve(
  process.env.PLAYWRIGHT_RUN_STATE_DIR || DEFAULT_RUN_STATE_DIR,
);
export const SESSION_STATE = path.join(RUN_STATE_DIR, "session.json");
export const STORAGE_STATE = path.join(RUN_STATE_DIR, "gm.json");
export const PLAYER_STORAGE_STATE = path.join(RUN_STATE_DIR, "player.json");
export const PLAYER_NAME = "E2E Player";
export const PLAYER_CHARACTER_NAME = "E2E Shopper";

const EPHEMERAL_PREFIX = "cprc-playwright-";

function readLocalConfig() {
  const localConfigPath = path.resolve("foundryconfig.json");
  return fs.existsSync(localConfigPath) ? fs.readJSONSync(localConfigPath) : {};
}

export function foundryVersion() {
  if (process.env.FOUNDRY_VERSION) return String(process.env.FOUNDRY_VERSION);
  const system = fs.readJSONSync(path.resolve("src", "system.json"));
  const verified = system?.compatibility?.verified;
  if (verified === undefined || verified === null) {
    throw new Error(
      "Could not determine the Foundry version: src/system.json has no " +
        "compatibility.verified. Set FOUNDRY_VERSION to override.",
    );
  }
  return String(verified);
}

export function expandVersion(rawPath, { version, versionPrefix } = {}) {
  if (typeof rawPath !== "string" || !rawPath.includes("{VERSION}")) {
    return rawPath;
  }
  const prefix = versionPrefix ?? DEFAULT_VERSION_PREFIX;
  const resolved = version ?? foundryVersion();
  return rawPath.replaceAll("{VERSION}", `${prefix}${resolved}`);
}

export function newWorldId() {
  return `${EPHEMERAL_PREFIX}${crypto.randomBytes(4).toString("hex")}`;
}

export function resolveHarnessConfig({
  mode = "test",
  dataPathMode,
  honorEnvDataPath = true,
} = {}) {
  loadRepoSecrets();

  const local = readLocalConfig();
  const versionPrefix = local.foundry?.versionPrefix;
  const rawAppPath = process.env.FOUNDRY_APP_PATH || local.foundry?.appPath;
  const explicitDataPath = honorEnvDataPath
    ? process.env.FOUNDRY_DATA_PATH
    : undefined;
  const selectedDataPathMode =
    dataPathMode ?? (mode === "live" ? "configured" : "isolated");
  const rawDataPath =
    explicitDataPath ||
    (selectedDataPathMode === "isolated"
      ? path.resolve(".playwright", "foundry-data")
      : local.foundry?.dataPath);
  const foundryKey = resolveSecret("FOUNDRY_KEY", local.foundry?.licenseKey);
  const port = Number(process.env.PLAYWRIGHT_FOUNDRY_PORT || 30001);
  const foundryAdminPass = resolveSecret(
    "FOUNDRY_ADMIN_PASS",
    local.foundry?.adminPassword,
  );
  const foundryWorldPass = resolveSecret(
    "FOUNDRY_WORLD_PASS",
    local.foundry?.worldPassword,
  );

  if (!rawAppPath) {
    throw new Error(
      "Foundry application path is not set. Add 'foundry.appPath' to " +
        "foundryconfig.json or set FOUNDRY_APP_PATH.",
    );
  }
  if (!rawDataPath) {
    throw new Error(
      "Foundry data path is not set. Add 'foundry.dataPath' to foundryconfig.json " +
        "or set FOUNDRY_DATA_PATH.",
    );
  }

  const version = foundryVersion();
  const appPath = expandVersion(rawAppPath, { version, versionPrefix });
  const dataPath = expandVersion(rawDataPath, { version, versionPrefix });
  const appDir = rawAppPath.includes("{VERSION}")
    ? appPath
    : path.join(
        appPath,
        `${versionPrefix ?? DEFAULT_VERSION_PREFIX}${version}`,
      );

  return {
    appPath,
    nodePath:
      process.env.FOUNDRY_NODE_PATH ||
      local.foundry?.nodePath ||
      process.execPath,
    version,
    appDir,
    dataPath,
    dataPathMode: explicitDataPath ? "override" : selectedDataPathMode,
    mode,
    port,
    runStateDir: RUN_STATE_DIR,
    sessionState: SESSION_STATE,
    storageState: STORAGE_STATE,
    playerStorageState: PLAYER_STORAGE_STATE,
    foundryAdminPass,
    foundryKey,
    foundryWorldPass,
    url: `http://localhost:${port}`,
  };
}

export function resolveMainJs(appDir) {
  const candidates = [
    path.join(appDir, "resources", "app", "main.js"),
    path.join(appDir, "main.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find Foundry main.js under '${appDir}'. Looked at:\n  ` +
        candidates.join("\n  ") +
        `\n(appPath may use a {VERSION} placeholder; if it omits one, the ` +
        `<versionPrefix><version> subdir from src/system.json is appended - ` +
        `set FOUNDRY_VERSION to target a different version.)`,
    );
  }
  return found;
}

export function worldDir(dataPath, worldId) {
  return path.join(dataPath, "Data", "worlds", worldId);
}

export async function removeWorld(dataPath, worldId) {
  await rm(worldDir(dataPath, worldId), {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 200,
  });
}

export function writeSession(session) {
  fs.ensureDirSync(RUN_STATE_DIR);
  fs.writeJSONSync(
    SESSION_STATE,
    {
      worldId: session.worldId,
      worldFolder: session.worldFolder,
      dataPath: session.config.dataPath,
      pid: session.pid,
      port: session.config.port,
      mode: session.mode,
      dataPathMode: session.config.dataPathMode,
      ephemeral: session.ephemeral,
      archivePath: session.archivePath,
    },
    { spaces: 2 },
  );
}

export function readSession() {
  return fs.existsSync(SESSION_STATE) ? fs.readJSONSync(SESSION_STATE) : null;
}

export function clearRunState() {
  fs.removeSync(RUN_STATE_DIR);
}
