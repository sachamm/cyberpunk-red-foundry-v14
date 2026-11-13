import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";
import {
  resolveHarnessConfig,
  resolveMainJs,
} from "../config/harness-config.mjs";

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitForReady(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(
    `Foundry did not become reachable at ${url} within ${timeoutMs}ms`,
  );
}

export async function startFoundry({
  config,
  mode = "test",
  silent = false,
} = {}) {
  const resolved = config ?? resolveHarnessConfig({ mode });

  if (await portInUse(resolved.port)) {
    throw new Error(
      `Port ${resolved.port} is already in use. A Foundry instance may already be ` +
        `running on this dataPath — stop it first (the LevelDB lock is exclusive, ` +
        `so Playwright flows and a dev instance cannot share a data dir). Override the port with ` +
        `PLAYWRIGHT_FOUNDRY_PORT if you intend to run a second, separate data dir.`,
    );
  }

  const mainJs = resolveMainJs(resolved.appDir);
  let stdio = "inherit";
  let logFd;
  if (silent) {
    fs.mkdirSync(resolved.runStateDir, { recursive: true });
    logFd = fs.openSync(path.join(resolved.runStateDir, "foundry.log"), "a");
    stdio = ["ignore", logFd, logFd];
  }

  let child;
  try {
    child = spawn(
      resolved.nodePath ?? process.execPath,
      [
        mainJs,
        `--dataPath=${resolved.dataPath}`,
        `--port=${resolved.port}`,
        "--noupnp",
      ],
      { stdio },
    );
  } finally {
    if (logFd != null) fs.closeSync(logFd);
  }

  try {
    await waitForReady(resolved.url);
    return { child, config: resolved };
  } catch (error) {
    await stopFoundry(child).catch(() => {});
    throw error;
  }
}

export async function stopFoundry(child, { timeoutMs = 15000 } = {}) {
  const pid = child?.pid;
  if (!pid || !processAlive(pid)) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return;
    await sleep(250);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  await sleep(500);
}
