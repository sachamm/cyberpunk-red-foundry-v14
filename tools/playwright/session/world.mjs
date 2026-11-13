import { expect } from "@playwright/test";
import { PLAYER_STORAGE_STATE } from "../config/harness-config.mjs";

export async function gotoReadyWorld(page) {
  await page.goto("/game");
  await waitForReadyWorld(page);
}

export async function reloadReadyWorld(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForReadyWorld(page);
}

async function waitForReadyWorld(page) {
  await page.waitForFunction(() => globalThis.game?.ready === true, null, {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    for (const tour of game.tours?.contents ?? []) {
      try {
        tour.exit();
      } catch {
        /* no active tour */
      }
    }
    document
      .querySelectorAll(".tour-overlay, .tour-center-step, .tour")
      .forEach((el) => el.remove());

    if (game.paused) {
      await game.togglePause(false, { broadcast: true });
    }
  });
}

export async function openPlayerPage(browser, baseURL) {
  const context = await browser.newContext({
    storageState: PLAYER_STORAGE_STATE,
    baseURL,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await gotoReadyWorld(page);
  return { context, page };
}

export { expect };
