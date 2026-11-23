import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import { openCompendiumPack } from "../../../tools/playwright/ui/index.mjs";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Compendium source label", () => {
  test("shows the pack's folder name in the opened compendium header", async ({
    page,
  }) => {
    const popout = await openCompendiumPack(
      page,
      "cyberpunk-red-core.core_weapons",
    );
    const label = popout.locator(".header-banner .cpr-compendium-source");
    await expect(label).toBeVisible();
    await expect(label).toHaveText("Cyberpunk RED: Core");
    await expect(label.locator("i.fa-dice")).toHaveCount(1);
  });

  test("shows each folder's own name for packs in different folders", async ({
    page,
  }) => {
    const popout = await openCompendiumPack(
      page,
      "cyberpunk-red-core.other_scenes",
    );
    const label = popout.locator(".header-banner .cpr-compendium-source");
    await expect(label).toBeVisible();
    await expect(label).toHaveText("Cyberpunk RED: Other");
    await expect(label.locator("i.fa-dice")).toHaveCount(1);
  });
});
