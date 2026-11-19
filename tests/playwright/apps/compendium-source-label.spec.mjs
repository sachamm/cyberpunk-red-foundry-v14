import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import { openCompendiumPack } from "../../../tools/playwright/ui/index.mjs";

const CORE_WEAPONS_PACK = "cyberpunk-red-core.core_weapons";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Compendium source label", () => {
  test("shows the pack's source package in the opened compendium header", async ({
    page,
  }) => {
    const popout = await openCompendiumPack(page, CORE_WEAPONS_PACK);
    const label = popout.locator(".header-banner .cpr-compendium-source");
    await expect(label).toBeVisible();
    await expect(label).toHaveText("cyberpunk-red-core");
    await expect(label.locator("i.fa-dice")).toHaveCount(1);
  });
});
