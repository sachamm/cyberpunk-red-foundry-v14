import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  createDocumentViaUI,
  uniqueName,
  closeDocSheet,
  dragItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
} from "../../../tools/playwright/ui/index.mjs";

async function cycleEquipState(page, { actorSheetId, actorId, itemId, state }) {
  const gear = await activateGearTab(page, actorSheetId);
  const row = await hoverGearRow(gear, itemId);
  await row.locator("a.equip").click();
  await page.waitForFunction(
    ({ actorId: aid, itemId: iid, state: expected }) =>
      game.actors.get(aid).items.get(iid).system.equipped === expected,
    { actorId, itemId, state },
  );
}

/*
 * The Active Effect config sheet (CPRActiveEffectSheet) replaces Foundry's generic
 * "Changes" tab with CPR's modifier UI: a category select + a category-aware key
 * input, plus situational / on-by-default toggles. Drive the real UI to add a
 * modifier, apply it from an equipped item, and assert the CPR theme/layout. This
 * guards against both the sheet falling back to Foundry's default changes editor
 * and the carried/equipped usage flow being lost during the V2 migration.
 */
test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Active Effect sheet (ApplicationV2)", () => {
  test("adds a CPR modifier and uses the CPR sheet theme", async ({
    page: game,
  }) => {
    const pageErrors = [];
    game.on("pageerror", (error) => pageErrors.push(error.message));

    const name = uniqueName("gear");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name,
    });
    expect(itemId).toBeTruthy();

    // The gear sheet opens on creation; open its Effects tab and add an effect.
    const itemSheet = game.locator(`#CPRItemSheet-Item-${itemId}`);
    await expect(itemSheet).toBeVisible();
    await itemSheet.locator('.navtabs-item [data-tab="item-effects"]').click();
    await itemSheet.locator('.effect-control[data-action="create"]').click();

    // Creating the effect opens its config (an ApplicationV2 active-effect-config).
    const aeConfig = game.locator(".application.active-effect-config");
    await expect(aeConfig).toBeVisible();

    // Switch to the CPR Changes tab and add a modifier.
    await aeConfig.locator('nav [data-tab="changes"]').click();
    await aeConfig.locator('[data-action="addMod"]').click();

    // The CPR row exposes a key-category select and a category-aware key input —
    // not Foundry's raw "Attribute Key" text field.
    const row = aeConfig.locator(".changes-list > li").first();
    await expect(row).toBeVisible();
    await expect(row.locator(".effect-key-category select")).toBeVisible();
    await expect(row.locator(".key-key, .key-input")).toHaveCount(1);

    // The config is one of CPR's explicitly themed windows. Foundry's native
    // active-effect grid must not override the custom six-column flex layout.
    await expect(aeConfig).toHaveClass(/active-effect-sheet/);
    const theme = await aeConfig.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--cpr-background-window)";
      probe.style.color = "var(--cpr-text-normal)";
      probe.style.fontFamily = "var(--cpr-font-primary)";
      document.body.append(probe);
      const expectedStyle = getComputedStyle(probe);
      const rootStyle = getComputedStyle(element);
      const header = element.querySelector(".change-header");
      const actionHeader = header.querySelector(".change-actions");
      const result = {
        backgroundColor: rootStyle.backgroundColor,
        color: rootStyle.color,
        fontFamily: rootStyle.fontFamily,
        expectedBackgroundColor: expectedStyle.backgroundColor,
        expectedColor: expectedStyle.color,
        expectedFontFamily: expectedStyle.fontFamily,
        headerDisplay: getComputedStyle(header).display,
        rowDisplay: getComputedStyle(
          element.querySelector(".changes-list > li"),
        ).display,
        actionsClipped: actionHeader.scrollWidth > actionHeader.clientWidth,
      };
      probe.remove();
      return result;
    });
    expect(theme.backgroundColor).toBe(theme.expectedBackgroundColor);
    expect(theme.color).toBe(theme.expectedColor);
    expect(theme.fontFamily).toBe(theme.expectedFontFamily);
    expect(theme.headerDisplay).toBe("flex");
    expect(theme.rowDisplay).toBe("flex");
    expect(theme.actionsClipped).toBe(false);

    const effectId = await game.evaluate(
      (id) => game.items.get(id).effects.contents[0].id,
      itemId,
    );
    await row.locator(".key-cat").selectOption("combat");
    await game.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.0") === "combat",
      { itemId, effectId },
    );
    await row.locator(".key-key").selectOption("bonuses.maxHp");
    await game.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[0].key === "bonuses.maxHp",
      { itemId, effectId },
    );

    const valueInput = aeConfig.locator('input[name="changes.0.value"]');
    await valueInput.fill("2");
    await valueInput.press("Tab");
    await game.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[0].value === "2",
      { itemId, effectId },
    );

    // Item effects still expose the CPR usage choices and persist carried /
    // equipped selection through the ApplicationV2 item sheet.
    await aeConfig.locator('[data-action="close"]').click();
    const usage = itemSheet.locator('select[name="system.usage"]');
    await expect(usage).toBeVisible();
    await expect(usage.locator('option[value="carried"]')).toHaveCount(1);
    await expect(usage.locator('option[value="equipped"]')).toHaveCount(1);
    await usage.selectOption("carried");
    await game.waitForFunction(
      (id) => game.items.get(id).system.usage === "carried",
      itemId,
    );
    await usage.selectOption("equipped");
    await game.waitForFunction(
      (id) => game.items.get(id).system.usage === "equipped",
      itemId,
    );

    // Once the item is owned by an actor, its effect remains suppressed while
    // owned/carried and becomes applicable only when the item is equipped.
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("character"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });
    await dragItemToActorSheet(game, {
      itemId,
      sheetId: actorSheetId,
      actorId,
    });
    const embeddedItemId = await game.evaluate(
      ({ actorId: aid, name: itemName }) =>
        game.actors.get(aid).items.find((item) => item.name === itemName).id,
      { actorId, name },
    );
    await game.waitForFunction(
      ({ actorId: aid, itemId: iid }) =>
        game.actors.get(aid).items.get(iid).effects.contents[0].system
          .isSuppressed === true && game.actors.get(aid).bonuses.maxHp === 0,
      { actorId, itemId: embeddedItemId },
    );

    await cycleEquipState(game, {
      actorSheetId,
      actorId,
      itemId: embeddedItemId,
      state: "carried",
    });
    await game.waitForFunction(
      ({ actorId: aid, itemId: iid }) =>
        game.actors.get(aid).items.get(iid).effects.contents[0].system
          .isSuppressed === true && game.actors.get(aid).bonuses.maxHp === 0,
      { actorId, itemId: embeddedItemId },
    );

    await cycleEquipState(game, {
      actorSheetId,
      actorId,
      itemId: embeddedItemId,
      state: "equipped",
    });
    await game.waitForFunction(
      ({ actorId: aid, itemId: iid }) =>
        game.actors.get(aid).items.get(iid).effects.contents[0].system
          .isSuppressed === false && game.actors.get(aid).bonuses.maxHp === 2,
      { actorId, itemId: embeddedItemId },
    );

    expect(pageErrors).toEqual([]);

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("adds a CPR modifier to an actor effect without falling back to Foundry's editor", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("character"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    const actorSheet = game.locator(`#${actorSheetId}`);
    await actorSheet.locator('.navtabs-right [data-tab="effects"]').click();
    await actorSheet
      .locator('.effects-tab.active .effect-control[data-action="create"]')
      .click();

    const aeConfig = game.locator(".application.active-effect-config");
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();
    await aeConfig.locator('[data-action="addMod"]').click();

    const row = aeConfig.locator(".changes-list > li").first();
    await expect(row.locator(".effect-key-category select")).toBeVisible();
    await expect(row.locator(".key-key, .key-input")).toHaveCount(1);
    await expect(
      aeConfig.locator('input[name="changes.0.priority"]'),
    ).toHaveCount(0);

    await aeConfig.locator('[data-action="close"]').click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
