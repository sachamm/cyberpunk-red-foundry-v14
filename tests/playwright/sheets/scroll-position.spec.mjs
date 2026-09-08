import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createDocumentViaUI,
  expectSheetRendered,
  openItemSettings,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

async function setScrollPosition(locator, position) {
  return locator.evaluate((element, top) => {
    element.scrollTop = Math.min(
      top,
      element.scrollHeight - element.clientHeight,
    );
    return element.scrollTop;
  }, position);
}

async function expectScrollPosition(locator, expected) {
  await expect
    .poll(() => locator.evaluate((element) => element.scrollTop))
    .toBe(expected);
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Sheet scroll position (#1368)", () => {
  test("item settings remain stationary when an item update rerenders the sheet", async ({
    page: game,
  }) => {
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: uniqueName("scroll-weapon"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "items",
      id: itemId,
    });
    const sheet = await openItemSettings(game, sheetId);
    const scroller = sheet.locator(".item-bottom-content-section");
    const damageBonus = sheet.locator('input[name="system.damageCrit.bonus"]');

    await damageBonus.scrollIntoViewIfNeeded();
    await damageBonus.fill("1");
    const scrollTop = await scroller.evaluate((element) => element.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);

    await damageBonus.blur();
    await game.waitForFunction(
      (id) => game.items.get(id).system.damageCrit.bonus === 1,
      itemId,
    );
    await expectScrollPosition(scroller, scrollTop);

    await closeDocSheet(game, { collection: "items", id: itemId });
  });

  test("character panes remain stationary when a skill update rerenders the sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("scroll-character"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    const sheet = game.locator(`#${sheetId}`);
    await sheet.locator('.navtabs-bottom [data-tab="lifepath"]').click();

    const rightScroller = sheet.locator(".right-content-section");
    const bottomScroller = sheet.locator(".bottom-content-section");
    const skillInput = sheet.locator(".skill-input").last();
    await skillInput.scrollIntoViewIfNeeded();
    const bottomScrollTop = await setScrollPosition(bottomScroller, 150);
    const skillId = await skillInput.evaluate(
      (input) => input.closest("[data-item-id]").dataset.itemId,
    );
    const level = Number(await skillInput.inputValue()) + 1;

    await skillInput.fill(String(level));
    const rightScrollTop = await rightScroller.evaluate(
      (element) => element.scrollTop,
    );
    expect(rightScrollTop).toBeGreaterThan(0);
    expect(bottomScrollTop).toBeGreaterThan(0);

    await skillInput.blur();
    await game.waitForFunction(
      ({ actorId, skillId, level }) =>
        game.actors.get(actorId).items.get(skillId).system.level === level,
      { actorId, skillId, level },
    );
    await expectScrollPosition(rightScroller, rightScrollTop);
    await expectScrollPosition(bottomScroller, bottomScrollTop);

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
