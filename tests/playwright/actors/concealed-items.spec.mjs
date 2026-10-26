import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createEmbeddedItemViaUI,
  expectSheetRendered,
  hoverGearRow,
  openOwnedItemSheet,
  reopenActorSheetViaUI,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

test.beforeEach(async ({ page }) => gotoReadyWorld(page));

for (const type of ["clothing", "ammo", "gear"]) {
  test(`concealed ${type} has a thumbnail cue without fading its row`, async ({
    page,
  }) => {
    const inventoryCreation = await page.evaluate(() =>
      game.settings.get(game.system.id, "playersCreateInventory"),
    );
    await page.evaluate(() =>
      game.settings.set(game.system.id, "playersCreateInventory", true),
    );
    try {
      const actorId = await createActorViaUI(page, {
        name: uniqueName("concealment"),
      });
      let actorSheetId = await expectSheetRendered(page, {
        collection: "actors",
        id: actorId,
      });
      await activateGearTab(page, actorSheetId);
      const itemId = await createEmbeddedItemViaUI(page, {
        sheetId: actorSheetId,
        actorId,
        type,
      });
      const row = () =>
        page.locator(`#${actorSheetId} li.item[data-item-id="${itemId}"]`);
      const thumb = () => row().locator(".item-thumb");
      const setConcealment = async (target, expected) => {
        await hoverGearRow(await activateGearTab(page, actorSheetId), itemId);
        await row().locator(".item-edit").click();
        const sheetId = await openOwnedItemSheet(page, { actorId, itemId });
        await toggleItemCheckbox(page, {
          sheetId,
          actorId,
          itemId,
          target: `system.concealable.${target}`,
          expected,
        });
        await closeOwnedItemSheet(page, { actorId, itemId });
        await closeDocSheet(page, { collection: "actors", id: actorId });
        actorSheetId = await reopenActorSheetViaUI(page, actorId);
        await activateGearTab(page, actorSheetId);
        await page.mouse.move(0, 0);
      };

      await page.mouse.move(0, 0);
      await expect(thumb()).toHaveCSS("opacity", "1");
      await setConcealment("concealable", true);
      await expect(thumb()).toHaveCSS("opacity", "1");
      await setConcealment("isConcealed", true);
      await expect(thumb()).toHaveCSS("opacity", "0.5");
      await expect(row()).toHaveCSS("opacity", "1");
      await expect(row().locator(".item-edit")).toHaveCSS("opacity", "1");
      await thumb().hover();
      await expect(thumb()).toHaveCSS("opacity", "1");
      await page.mouse.move(0, 0);
      await expect(thumb()).toHaveCSS("opacity", "0.5");

      await closeDocSheet(page, { collection: "actors", id: actorId });
      actorSheetId = await reopenActorSheetViaUI(page, actorId);
      await activateGearTab(page, actorSheetId);
      await page.mouse.move(0, 0);
      await expect(thumb()).toHaveCSS("opacity", "0.5");

      await setConcealment("isConcealed", false);
      await expect(thumb()).toHaveCSS("opacity", "1");
      await setConcealment("isConcealed", true);
      await expect(thumb()).toHaveCSS("opacity", "0.5");
      await setConcealment("concealable", false);
      await expect(thumb()).toHaveCSS("opacity", "1");
      await setConcealment("concealable", true);
      await expect(thumb()).toHaveCSS("opacity", "1");
      await closeDocSheet(page, { collection: "actors", id: actorId });
    } finally {
      await page.evaluate(
        (value) =>
          game.settings.set(game.system.id, "playersCreateInventory", value),
        inventoryCreation,
      );
    }
  });
}
