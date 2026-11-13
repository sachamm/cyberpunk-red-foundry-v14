import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { reloadReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createActorViaUI,
  closeDocSheet,
  uniqueName,
  createCanvasTokenViaUI,
  openCanvasTokenHudViaUI,
  measureCanvasDistanceViaUI,
} from "../../../tools/playwright/ui/index.mjs";

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  actionTimeout: 15000,
});
installConsoleErrorHarness();

test("the canvas HUD saves a DV table and the ruler uses it after reload", async ({
  page,
}) => {
  test.setTimeout(180000);
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("dv-actor"),
  });
  await closeDocSheet(page, { collection: "actors", id: actorId });
  const tokenId = await createCanvasTokenViaUI(page, {
    actorId,
    name: uniqueName("dv-scene"),
  });
  await test.step("choose a pistol table through the token HUD", async () => {
    await openCanvasTokenHudViaUI(page, tokenId);
    await page.locator("#token-hud .dv-table-selector").click();
    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('select[name="dvTable"]') });
    await dialog
      .locator('select[name="dvTable"]')
      .selectOption({ label: "DV Pistol" });
    await dialog.locator('[data-action="confirm"]').click();
    await expect(dialog).toHaveCount(0);
    await reloadReadyWorld(page);
    await page.waitForFunction(() => canvas.ready);
    await openCanvasTokenHudViaUI(page, tokenId);
    await expect(page.locator("#token-hud .dv-table-selector")).toHaveAttribute(
      "data-tooltip",
      /DV Pistol/,
    );
    await page.locator("#token-hud .dv-table-selector").click();
    await expect(dialog.locator('select[name="dvTable"]')).toHaveValue(
      "DV Pistol",
    );
    await dialog.locator('[data-action="cancel"]').click();
  });
  await test.step("measure a range with the selected token", async () => {
    await measureCanvasDistanceViaUI(page, { tokenId, gridSpaces: 2 });
    try {
      await expect(
        page
          .locator("#measurement .waypoint-label")
          .filter({ hasText: "DV:" })
          .last(),
      ).toContainText("DV: 13 Pistol");
    } finally {
      await page.mouse.up();
    }
  });
  await test.step("clearing the DV table persists and removes the ruler label", async () => {
    await openCanvasTokenHudViaUI(page, tokenId);
    await page.locator("#token-hud .dv-table-selector").click();
    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('select[name="dvTable"]') });
    await dialog.locator('select[name="dvTable"]').selectOption("");
    await dialog.locator('[data-action="confirm"]').click();
    await expect(dialog).toHaveCount(0);
    await openCanvasTokenHudViaUI(page, tokenId);
    await page.locator("#token-hud .dv-table-selector").click();
    await expect(dialog.locator('select[name="dvTable"]')).toHaveValue("");
    await dialog.locator('[data-action="cancel"]').click();
    await measureCanvasDistanceViaUI(page, { tokenId, gridSpaces: 2 });
    try {
      await expect(
        page.locator("#measurement .waypoint-label").last(),
      ).toContainText(/\d+(?:[.,]\d+)? m/);
      await expect(
        page.locator("#measurement .waypoint-label").filter({ hasText: "DV:" }),
      ).toHaveCount(0);
    } finally {
      await page.mouse.up();
    }
  });
});
