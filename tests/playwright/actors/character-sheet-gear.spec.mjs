import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createInventoryItemViaUI,
  enablePlayersCreateInventory,
  getPlayersCreateInventory,
  openOwnedItemSheet,
  reopenActorSheetViaUI,
  resolveYesNo,
  setPlayersCreateInventory,
  yesNoDialog,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createCharacterViaUI,
  equipStateIcon,
  gearCategoryHeader,
  gearRow,
  installUpgradeViaUI,
  manageUpgradesDialog,
  openGearTab,
  selectAmmoDialog,
} from "./character-sheet-helpers.mjs";

installConsoleErrorHarness();

let createInventoryBaseline;

test.beforeEach(async ({ page }) => {
  if (createInventoryBaseline === undefined) {
    createInventoryBaseline = await getPlayersCreateInventory(page);
  }
});

test.afterEach(async ({ page }) => {
  await setPlayersCreateInventory(page, createInventoryBaseline);
});

test.describe("Character sheet Gear tab", () => {
  test("the create glyph is gated by the playersCreateInventory setting", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    let freshSheet = sheetId;

    await test.step("with the setting off, no item-create glyphs render", async () => {
      await setPlayersCreateInventory(page, false);
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const gear = await openGearTab(page, freshSheet);
      await expect(gear.locator("a.item-create")).toHaveCount(0);
    });

    await test.step("enabling the setting reveals a glyph for every category", async () => {
      await enablePlayersCreateInventory(page);
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const gear = await openGearTab(page, freshSheet);
      await expect(
        gear.locator('a.item-create[data-item-type="weapon"]'),
      ).toBeVisible();
      const glyphs = gear.locator("a.item-create");
      expect(await glyphs.count()).toBeGreaterThan(0);
    });

    await test.step("clicking the weapon + creates a default weapon (ranged: false, no magazine column)", async () => {
      const gear = await openGearTab(page, freshSheet);

      const existingIds = await page.evaluate(
        (id) => Array.from(game.actors.get(id).items.map((i) => i.id)),
        actorId,
      );
      await gear.locator('a.item-create[data-item-type="weapon"]').click();

      const itemIdHandle = await page.waitForFunction(
        ({ id, existing }) => {
          const items = Array.from(game.actors.get(id).items.map((i) => i.id));
          return items.find((v) => !existing.includes(v)) ?? null;
        },
        { id: actorId, existing: existingIds },
        { timeout: 10000 },
      );
      const itemId = await itemIdHandle.jsonValue();
      expect(itemId).toBeTruthy();

      await page.waitForFunction(
        ({ aid, iid }) => game.actors.get(aid)?.items.has(iid),
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );

      const isRanged = await page.evaluate(
        ({ aid, iid }) => game.actors.get(aid).items.get(iid).system.isRanged,
        { aid: actorId, iid: itemId },
      );
      expect(isRanged).toBe(false);

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, freshSheet, itemId);
      await expect(row).toBeVisible();
      await expect(row.locator("a.name.item-edit")).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("inline amount edit persists and invalid input is rejected", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const created = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "drug",
      itemName: "Test Drug",
      data: { system: { amount: 3 } },
    });
    const itemId = created.itemId;
    let freshSheet = created.sheetId;

    await test.step("the amount input shows 3 initially", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await expect(row.locator("input.gear-amount-input")).toHaveValue("3");
    });

    await test.step("setting the amount to 7 persists on a fresh render", async () => {
      const input = gearRow(page, freshSheet, itemId).locator(
        "input.gear-amount-input",
      );
      await input.fill("7");
      await input.press("Tab");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.amount === 7,
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        gearRow(page, afterSheet, itemId).locator("input.gear-amount-input"),
      ).toHaveValue("7");
      freshSheet = afterSheet;
    });

    await test.step("a non-numeric entry (emptying the number field) is rejected with an error", async () => {
      const input = gearRow(page, freshSheet, itemId).locator(
        "input.gear-amount-input",
      );
      const before = await page.evaluate(
        ({ aid, iid }) => game.actors.get(aid).items.get(iid).system.amount,
        { aid: actorId, iid: itemId },
      );

      page.expectedConsoleErrors.push(
        /CPR ERR \| Error: The amount entered could not be converted to a number/,
        /^Error: The amount entered could not be converted to a number!/,
      );

      await input.click();
      await input.press("e");
      await expect(input).toHaveValue("");
      await input.press("Tab");

      await expect
        .poll(
          () =>
            page.consoleErrors.some((t) =>
              /could not be converted to a number/.test(t),
            ),
          { timeout: 5000 },
        )
        .toBe(true);

      const after = await page.evaluate(
        ({ aid, iid }) => game.actors.get(aid).items.get(iid).system.amount,
        { aid: actorId, iid: itemId },
      );
      expect(after).toBe(before);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the favorite toggle pins a gear row and persists", async ({ page }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId, sheetId: freshSheet } = await createInventoryItemViaUI(
      page,
      {
        actorId,
        sheetId,
        itemType: "weapon",
        itemName: "Fav Weapon",
      },
    );

    await test.step("the row is unpinned initially", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await expect(row).not.toHaveClass(/favorite/);
    });

    await test.step("clicking the favorite glyph pins it", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator('a.item-action[data-action-type="favorite"]').click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.favorite === true,
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(gearRow(page, freshSheet, itemId)).toHaveClass(/favorite/);
    });

    await test.step("the pin persists on a fresh render", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(gearRow(page, afterSheet, itemId)).toHaveClass(/favorite/);
      await closeDocSheet(page, { collection: "actors", id: actorId });
    });
  });

  test("collapsing and expanding a gear category persists", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId } = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Cat Weapon",
    });

    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    await openGearTab(page, freshSheet);

    await test.step("weapon category is expanded initially", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await expect(header.locator("i.fa-minus.expand-icon")).toBeVisible();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeHidden();
      await expect(gearRow(page, freshSheet, itemId)).toBeVisible();
    });

    await test.step("clicking the header collapses: plus shows, rows hide", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await header.click();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeVisible();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeHidden();
      await expect(gearRow(page, freshSheet, itemId)).toBeHidden();
    });

    await test.step("expanding again restores rows", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await header.click();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeVisible();
      await expect(gearRow(page, freshSheet, itemId)).toBeVisible();
    });

    await test.step("collapse persists on a fresh render", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await header.click();
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      const afterHeader = gearCategoryHeader(page, afterSheet, "weapon");
      await expect(
        afterHeader.locator("i.fa-plus.collapse-icon"),
      ).toBeVisible();
      await expect(gearRow(page, afterSheet, itemId)).toBeHidden();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("deleting a gear item asks for confirmation; cancel keeps it, confirm removes it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId, sheetId: freshSheet } = await createInventoryItemViaUI(
      page,
      {
        actorId,
        sheetId,
        itemType: "weapon",
        itemName: "Del Weapon",
      },
    );

    await test.step("clicking delete opens a confirmation dialog; cancel keeps the row", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator('a.item-action[data-action-type="delete"]').click();
      const dialog = yesNoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await resolveYesNo(dialog, "no");
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
      await expect(gearRow(page, freshSheet, itemId)).toHaveCount(1);
    });

    await test.step("confirming the delete removes the item on a fresh render", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator('a.item-action[data-action-type="delete"]').click();
      const dialog = yesNoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await resolveYesNo(dialog, "yes");
      await page.waitForFunction(
        ({ aid, iid }) => !game.actors.get(aid)?.items.has(iid),
        { aid: actorId, iid: itemId },
        { timeout: 10000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(gearRow(page, afterSheet, itemId)).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the equip glyph cycles owned, carried, equipped and persists", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const created = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Cycle Weapon",
    });
    const itemId = created.itemId;
    let freshSheet = created.sheetId;

    await test.step("a new weapon starts owned (circle-notch icon)", async () => {
      const equipped = await page.evaluate(
        ({ aid, iid }) => game.actors.get(aid).items.get(iid).system.equipped,
        { aid: actorId, iid: itemId },
      );
      expect(equipped).toBe("owned");
      await expect(
        equipStateIcon(gearRow(page, freshSheet, itemId), "owned"),
      ).toBeVisible();
    });

    await test.step("the first click moves it to carried (suitcase icon)", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "carried")).toBeVisible();
    });

    await test.step("the second click equips it (hand icon)", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "equipped",
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "equipped")).toBeVisible();
    });

    await test.step("the equipped state persists on a fresh render", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, freshSheet, itemId), "equipped"),
      ).toBeVisible();
    });

    await test.step("the third click returns it to owned", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "owned",
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "owned")).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("equipping a second two-handed weapon warns about hands but still equips it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const first = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Two Hander A",
      data: { system: { handsReq: 2 } },
    });
    const second = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Two Hander B",
      data: { system: { handsReq: 2 } },
    });
    let freshSheet = second.sheetId;

    await test.step("equip the first two-handed weapon without a warning", async () => {
      const row = gearRow(page, freshSheet, first.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: first.itemId },
        { timeout: 5000 },
      );
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "equipped",
        { aid: actorId, iid: first.itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "equipped")).toBeVisible();
    });

    await test.step("cycling the second to equipped warns about hands but still equips it", async () => {
      const row = gearRow(page, freshSheet, second.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: second.itemId },
        { timeout: 5000 },
      );

      await row.locator("a.equip").click();
      await expect
        .poll(
          () =>
            page.consoleWarnings.some((t) =>
              /more hands than you have/.test(t),
            ),
          { timeout: 5000 },
        )
        .toBe(true);
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "equipped",
        { aid: actorId, iid: second.itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "equipped")).toBeVisible();
    });

    await test.step("both weapons stay equipped on a fresh render", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, first.itemId), "equipped"),
      ).toBeVisible();
      await expect(
        equipStateIcon(gearRow(page, afterSheet, second.itemId), "equipped"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("a second cyberdeck reverts to owned while one is equipped", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const first = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "cyberdeck",
      itemName: "Deck A",
    });
    const second = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "cyberdeck",
      itemName: "Deck B",
    });
    let freshSheet = second.sheetId;

    await test.step("equip the first cyberdeck", async () => {
      const row = gearRow(page, freshSheet, first.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: first.itemId },
        { timeout: 5000 },
      );
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "equipped",
        { aid: actorId, iid: first.itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "equipped")).toBeVisible();
    });

    await test.step("cycling the second to equipped warns and reverts it to owned", async () => {
      const row = gearRow(page, freshSheet, second.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: second.itemId },
        { timeout: 5000 },
      );

      await row.locator("a.equip").click();
      await expect
        .poll(
          () =>
            page.consoleWarnings.some((t) => /one cyberdeck equipped/.test(t)),
          { timeout: 5000 },
        )
        .toBe(true);
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "owned",
        { aid: actorId, iid: second.itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "owned")).toBeVisible();
    });

    await test.step("on a fresh render the first stays equipped and the second is owned", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, first.itemId), "equipped"),
      ).toBeVisible();
      await expect(
        equipStateIcon(gearRow(page, afterSheet, second.itemId), "owned"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("equipping body armor tracks its SP on the actor; unequipping clears it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId, sheetId: freshSheet } = await createInventoryItemViaUI(
      page,
      { actorId, sheetId, itemType: "armor", itemName: "Body Armor" },
    );

    await test.step("a new body armor starts untracked (no id, zero SP)", async () => {
      const tracked = await page.evaluate(
        ({ aid }) => {
          const armor =
            game.actors.get(aid).system.externalData.currentArmorBody;
          return {
            id: armor.id ?? "",
            value: armor.value,
            max: armor.max,
          };
        },
        { aid: actorId },
      );
      expect(tracked.id).toBe("");
      expect(tracked.value).toBe(0);
      expect(tracked.max).toBe(0);
    });

    await test.step("equipping it tracks its SP on the actor", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) => {
          const armor =
            game.actors.get(aid).system.externalData.currentArmorBody;
          return armor.id === iid && armor.value === 7 && armor.max === 7;
        },
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "equipped")).toBeVisible();
    });

    await test.step("the tracked armor persists on a fresh render", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, itemId), "equipped"),
      ).toBeVisible();
    });

    await test.step("cycling back to owned clears the tracked armor", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) => {
          const armor =
            game.actors.get(aid).system.externalData.currentArmorBody;
          return armor.id !== iid && armor.value === 0 && armor.max === 0;
        },
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "owned")).toBeVisible();

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, itemId), "owned"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("ablated body armor shows reduced SP and the repair glyph restores it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId, sheetId: freshSheet } = await createInventoryItemViaUI(
      page,
      {
        actorId,
        sheetId,
        itemType: "armor",
        itemName: "Ablated Armor",
        data: { system: { bodyLocation: { ablation: 3 } } },
      },
    );

    await test.step("the row shows the reduced SP (4/7) and a repair glyph", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await expect(row.locator(".gear-amount span")).toHaveText("4/7");
      await expect(row.locator("a.repair")).toBeVisible();
    });

    await test.step("clicking repair zeroes the ablation and shows full SP", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.repair").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.bodyLocation.ablation ===
          0,
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(row.locator(".gear-amount span")).toHaveText("7/7");
      await expect(row.locator("a.repair")).toHaveCount(0);
    });

    await test.step("the repaired state persists on a fresh render", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, afterSheet, itemId);
      await expect(row.locator(".gear-amount span")).toHaveText("7/7");
      await expect(row.locator("a.repair")).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the manage-upgrades dialog installs and uninstalls an upgrade", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Upgradable Weapon",
    });
    const upgrade = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "itemUpgrade",
      itemName: "Weapon Upgrade",
    });
    let freshSheet = upgrade.sheetId;

    const glyph = (sid) =>
      gearRow(page, sid, weapon.itemId).locator(
        'a[data-action-type="manage-upgrades"]',
      );

    await test.step("the manage-upgrades glyph shows while a compatible upgrade is uninstalled", async () => {
      await expect(glyph(freshSheet)).toBeVisible();
    });

    await test.step("opening the dialog lists the upgrade unchecked; confirming installs it", async () => {
      await glyph(freshSheet).click();
      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${upgrade.itemId}"]`,
      );
      await expect(checkbox).toBeVisible();
      await expect(checkbox).not.toBeChecked();

      await checkbox.check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
    });

    await test.step("the weapon shows the upgraded caret on a fresh render", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".fa-square-caret-up"),
      ).toBeVisible();
    });

    await test.step("reopening the dialog shows the upgrade checked; unchecking and confirming uninstalls it", async () => {
      await glyph(freshSheet).click();
      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${upgrade.itemId}"]`,
      );
      await expect(checkbox).toBeChecked();

      await checkbox.uncheck();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
    });

    await test.step("on a fresh render the caret is gone (the glyph stays: the upgrade is still owned)", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, freshSheet, weapon.itemId);
      await expect(row.locator(".fa-square-caret-up")).toHaveCount(0);
      await expect(
        row.locator('a[data-action-type="manage-upgrades"]'),
      ).toBeVisible();
    });

    await test.step("canceling the dialog leaves the upgrade uninstalled", async () => {
      await glyph(freshSheet).click();
      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${upgrade.itemId}"]`,
      );
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      const row = gearRow(page, freshSheet, weapon.itemId);
      await expect(row.locator(".fa-square-caret-up")).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the chevron toggles nested installed items and persists", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Parent Weapon",
    });
    const upgrade = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "itemUpgrade",
      itemName: "Nested Upgrade",
    });
    let freshSheet = upgrade.sheetId;

    await installUpgradeViaUI(page, {
      sheetId: freshSheet,
      actorId,
      itemId: weapon.itemId,
      upgradeId: upgrade.itemId,
    });

    const wrapperFor = (sid) =>
      page.locator(
        `#${sid} div[data-items-wrapper-for-parent="${weapon.itemId}"]`,
      );

    await test.step("the chevron renders and the nested list is hidden by default", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, freshSheet, weapon.itemId);
      const chevron = row.locator(".toggle-installed-visibility");
      await expect(chevron).toBeVisible();
      await expect(chevron.locator("i")).toHaveClass(/fa-flip-vertical/);
      await expect(wrapperFor(freshSheet)).toHaveClass(/item-hidden/);
    });

    await test.step("clicking the chevron expands the nested list", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator(".toggle-installed-visibility").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).flags["cyberpunk-red-core"]?.showInstalled?.[
            iid
          ] === true,
        { aid: actorId, iid: weapon.itemId },
        { timeout: 5000 },
      );
      const expandedRow = gearRow(page, freshSheet, weapon.itemId);
      await expect(
        expandedRow.locator(".toggle-installed-visibility i"),
      ).not.toHaveClass(/fa-flip-vertical/);
      await expect(wrapperFor(freshSheet)).not.toHaveClass(/item-hidden/);
    });

    await test.step("the expanded state persists on a fresh render", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = gearRow(page, freshSheet, weapon.itemId);
      await expect(
        row.locator(".toggle-installed-visibility i"),
      ).not.toHaveClass(/fa-flip-vertical/);
      await expect(wrapperFor(freshSheet)).not.toHaveClass(/item-hidden/);
    });

    await test.step("clicking the chevron again collapses the nested list", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator(".toggle-installed-visibility").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).flags["cyberpunk-red-core"]?.showInstalled?.[
            iid
          ] === false,
        { aid: actorId, iid: weapon.itemId },
        { timeout: 5000 },
      );
      await expect(row.locator(".toggle-installed-visibility i")).toHaveClass(
        /fa-flip-vertical/,
      );
      await expect(wrapperFor(freshSheet)).toHaveClass(/item-hidden/);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the change-ammo dialog lists only compatible ammo and unloading returns rounds", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Ammo Weapon",
      data: {
        system: {
          isRanged: true,
          ammoVariety: ["medPistol", "heavyPistol"],
          magazine: { max: 6 },
          installedItems: { allowedTypes: ["itemUpgrade", "ammo"] },
        },
      },
    });
    // Author's note: the AI generated item names were funny to me, so I left them in
    const nines = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weapon.sheetId,
      itemType: "ammo",
      itemName: "Nines",
      data: { system: { variety: "medPistol", amount: 5 } },
    });
    const fortyFives = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: nines.sheetId,
      itemType: "ammo",
      itemName: "Forty-Fives",
      data: { system: { variety: "heavyPistol", amount: 8 } },
    });
    await createInventoryItemViaUI(page, {
      actorId,
      sheetId: fortyFives.sheetId,
      itemType: "ammo",
      itemName: "Magnums",
      data: { system: { variety: "rifle", amount: 2 } },
    });
    let freshSheet = fortyFives.sheetId;

    await test.step("the change-ammo glyph opens a dialog listing only compatible ammo", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator('a.item-action[data-action="select-ammo"]').click();
      const dialog = selectAmmoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const options = dialog.locator('select[name="selectedAmmo"] option');
      await expect(options).toHaveCount(2);
      const labels = await options.allTextContents();
      expect(labels.some((l) => /Nines.*\[x5\]/.test(l))).toBe(true);
      expect(labels.some((l) => /Forty-Fives.*\[x8\]/.test(l))).toBe(true);
      expect(labels.some((l) => l.includes("Magnums"))).toBe(false);

      await dialog
        .locator('select[name="selectedAmmo"]')
        .selectOption({ value: fortyFives.itemId });
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
    });

    await test.step("confirming installs the ammo and fills the magazine", async () => {
      await page.waitForFunction(
        ({ aid, wid, ammoId }) => {
          const weapon = game.actors.get(aid).items.get(wid);
          return (
            weapon.system.installedItems.list.includes(ammoId) &&
            weapon.system.magazine.value === 6 &&
            game.actors.get(aid).items.get(ammoId).system.amount === 2
          );
        },
        { aid: actorId, wid: weapon.itemId, ammoId: fortyFives.itemId },
        { timeout: 10000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("6/6");
    });

    await test.step("canceling leaves the loaded ammo and the stacks unchanged", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator('a.item-action[data-action="select-ammo"]').click();
      const dialog = selectAmmoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await dialog
        .locator('select[name="selectedAmmo"]')
        .selectOption({ value: nines.itemId });
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      const state = await page.evaluate(
        ({ aid, wid, loadedId, otherId }) => ({
          installed: game.actors.get(aid).items.get(wid).system.installedItems
            .list,
          magazine: game.actors.get(aid).items.get(wid).system.magazine.value,
          loadedAmount: game.actors.get(aid).items.get(loadedId).system.amount,
          otherAmount: game.actors.get(aid).items.get(otherId).system.amount,
        }),
        {
          aid: actorId,
          wid: weapon.itemId,
          loadedId: fortyFives.itemId,
          otherId: nines.itemId,
        },
      );
      expect(state).toEqual({
        installed: [fortyFives.itemId],
        magazine: 6,
        loadedAmount: 2,
        otherAmount: 5,
      });
      await expect(row.locator(".gear-amount")).toHaveText("6/6");
    });

    await test.step("a fresh render offers to unload the loaded ammo and defaults to it", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator('a.item-action[data-action="select-ammo"]').click();
      const dialog = selectAmmoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const options = dialog.locator('select[name="selectedAmmo"] option');
      await expect(options).toHaveCount(3);
      await expect(options.first()).toHaveText("Unload Weapon");
      expect(await options.first().getAttribute("value")).toBe("");
      await expect(dialog.locator('select[name="selectedAmmo"]')).toHaveValue(
        fortyFives.itemId,
      );

      await dialog
        .locator('select[name="selectedAmmo"]')
        .selectOption({ value: "" });
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      await page.waitForFunction(
        ({ aid, wid, ammoId }) => {
          const weapon = game.actors.get(aid).items.get(wid);
          return (
            weapon.system.installedItems.list.length === 0 &&
            weapon.system.magazine.value === 0 &&
            game.actors.get(aid).items.get(ammoId).system.amount === 8
          );
        },
        { aid: actorId, wid: weapon.itemId, ammoId: fortyFives.itemId },
        { timeout: 10000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("");
    });

    await test.step("a weapon with no compatible owned ammo warns instead of opening a dialog", async () => {
      const rocketWeapon = await createInventoryItemViaUI(page, {
        actorId,
        sheetId: freshSheet,
        itemType: "weapon",
        itemName: "Rocket Weapon",
        data: {
          system: {
            isRanged: true,
            ammoVariety: ["rocket"],
            installedItems: { allowedTypes: ["itemUpgrade", "ammo"] },
          },
        },
      });
      const row = gearRow(page, rocketWeapon.sheetId, rocketWeapon.itemId);
      await row.locator('a.item-action[data-action="select-ammo"]').click();

      await expect
        .poll(
          () =>
            page.consoleWarnings.some((t) => /no ammo for that weapon/.test(t)),
          { timeout: 5000 },
        )
        .toBe(true);
      await expect(selectAmmoDialog(page)).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("reloading a weapon fills its magazine from the loaded ammo", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Reload Weapon",
      data: {
        system: {
          isRanged: true,
          ammoVariety: ["medPistol"],
          magazine: { max: 6 },
          installedItems: { allowedTypes: ["itemUpgrade", "ammo"] },
        },
      },
    });
    const nines = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weapon.sheetId,
      itemType: "ammo",
      itemName: "Nines",
      data: { system: { variety: "medPistol", amount: 4 } },
    });
    let freshSheet = nines.sheetId;

    await test.step("with nothing loaded the reload glyph opens the select-ammo dialog", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      const glyph = row.locator('a.item-action[data-action="reload-ammo"]');
      await expect(glyph).toBeVisible();
      await glyph.click();

      const dialog = selectAmmoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const options = dialog.locator('select[name="selectedAmmo"] option');
      await expect(options).toHaveCount(1);
      const labels = await options.allTextContents();
      expect(labels.some((l) => /Nines.*\[x4\]/.test(l))).toBe(true);

      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
    });

    await test.step("confirming loads the ammo and partially fills the magazine", async () => {
      await page.waitForFunction(
        ({ aid, wid, ammoId }) => {
          const weapon = game.actors.get(aid).items.get(wid);
          return (
            weapon.system.installedItems.list.includes(ammoId) &&
            weapon.system.magazine.value === 4 &&
            game.actors.get(aid).items.get(ammoId).system.amount === 0
          );
        },
        { aid: actorId, wid: weapon.itemId, ammoId: nines.itemId },
        { timeout: 10000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("4/6");
    });

    await test.step("reloading with an empty clip warns and changes nothing", async () => {
      const glyph = gearRow(page, freshSheet, weapon.itemId).locator(
        'a.item-action[data-action="reload-ammo"]',
      );
      await expect(glyph).toBeVisible();
      await glyph.click();

      await expect
        .poll(() => page.consoleWarnings.some((t) => /out of ammo/.test(t)), {
          timeout: 5000,
        })
        .toBe(true);
      await expect(selectAmmoDialog(page)).toHaveCount(0);

      const state = await page.evaluate(
        ({ aid, wid, ammoId }) => ({
          magazineValue: game.actors.get(aid).items.get(wid).system.magazine
            .value,
          amount: game.actors.get(aid).items.get(ammoId).system.amount,
        }),
        { aid: actorId, wid: weapon.itemId, ammoId: nines.itemId },
      );
      expect(state).toEqual({ magazineValue: 4, amount: 0 });
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("reloading a partially loaded weapon tops it up from the reserve stack", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Topup Weapon",
      data: {
        system: {
          isRanged: true,
          ammoVariety: ["medPistol"],
          magazine: { max: 6, value: 4 },
          installedItems: { allowedTypes: ["itemUpgrade", "ammo"] },
        },
      },
    });
    const nines = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: weapon.sheetId,
      itemType: "ammo",
      itemName: "Topup Nines",
      data: { system: { variety: "medPistol", amount: 10 } },
    });
    let freshSheet = nines.sheetId;

    // The gear row only shows a value/max amount while ammo is installed
    // (hasAmmoLoaded), so verify the pre-seeded partial state at the data
    // level instead.
    await test.step("the weapon starts partially loaded with no ammo installed", async () => {
      const state = await page.evaluate(
        ({ aid, wid }) => {
          const w = game.actors.get(aid).items.get(wid);
          return {
            value: w.system.magazine.value,
            max: w.system.magazine.max,
            installed: w.system.installedItems.list.length,
          };
        },
        { aid: actorId, wid: weapon.itemId },
      );
      expect(state).toEqual({ value: 4, max: 6, installed: 0 });
    });

    await test.step("the reload glyph opens the select-ammo dialog", async () => {
      const glyph = gearRow(page, freshSheet, weapon.itemId).locator(
        'a.item-action[data-action="reload-ammo"]',
      );
      await expect(glyph).toBeVisible();
      await glyph.click();

      const dialog = selectAmmoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const options = dialog.locator('select[name="selectedAmmo"] option');
      await expect(options).toHaveCount(1);
      const labels = await options.allTextContents();
      expect(labels.some((l) => /Topup Nines.*\[x10\]/.test(l))).toBe(true);

      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
    });

    await test.step("confirming tops the magazine up to capacity from the reserve", async () => {
      await page.waitForFunction(
        ({ aid, wid, ammoId }) => {
          const weapon = game.actors.get(aid).items.get(wid);
          return (
            weapon.system.installedItems.list.includes(ammoId) &&
            weapon.system.magazine.value === 6 &&
            game.actors.get(aid).items.get(ammoId).system.amount === 8
          );
        },
        { aid: actorId, wid: weapon.itemId, ammoId: nines.itemId },
        { timeout: 10000 },
      );

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await expect(
        gearRow(page, freshSheet, weapon.itemId).locator(".gear-amount"),
      ).toHaveText("6/6");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("splitting a stack divides it into two rows and invalid amounts warn", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const drug = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "drug",
      itemName: "Split Drug",
      data: { system: { amount: 5 } },
    });
    let freshSheet = drug.sheetId;

    const splitDialog = page.locator(".cpr-dialog").filter({
      has: page.locator('input[name="splitAmount"]'),
    });

    await test.step("the split glyph opens a dialog prefilled with half the stack", async () => {
      const row = gearRow(page, freshSheet, drug.itemId);
      const glyph = row.locator('a.item-action[data-action-type="split"]');
      await expect(glyph).toBeVisible();
      await glyph.click();

      await expect(splitDialog).toBeVisible({ timeout: 5000 });
      await expect(splitDialog.locator(".dialog-header")).toHaveText(
        "You currently own 5 of Split Drug.",
      );
      await expect(
        splitDialog.locator('input[name="splitAmount"]'),
      ).toHaveValue("3");
    });

    await test.step("splitting off 2 leaves a stack of 3 and creates a stack of 2", async () => {
      await splitDialog.locator('input[name="splitAmount"]').fill("2");
      await splitDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(splitDialog).toHaveCount(0, { timeout: 5000 });

      const otherId = await page
        .waitForFunction(
          ({ aid, originalId }) => {
            const other = game.actors
              .get(aid)
              .itemTypes.drug.find((d) => d.id !== originalId);
            return other?.id ?? null;
          },
          { aid: actorId, originalId: drug.itemId },
          { timeout: 10000 },
        )
        .then((handle) => handle.jsonValue());

      const state = await page.evaluate(
        ({ aid, originalId, otherId }) => ({
          original: game.actors.get(aid).items.get(originalId).system.amount,
          other: game.actors.get(aid).items.get(otherId).system.amount,
          otherName: game.actors.get(aid).items.get(otherId).name,
        }),
        { aid: actorId, originalId: drug.itemId, otherId },
      );
      expect(state).toEqual({
        original: 3,
        other: 2,
        otherName: "Split Drug",
      });

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      const rows = page
        .locator(`#${freshSheet} li.item[data-item-category="drug"]`)
        .filter({ hasText: "Split Drug" });
      await expect(rows).toHaveCount(2);
      const inputs = rows.locator("input.gear-amount-input");
      const values = (
        await Promise.all([0, 1].map((i) => inputs.nth(i).inputValue()))
      ).sort();
      expect(values).toEqual(["2", "3"]);
    });

    await test.step("splitting off 0 warns and leaves both stacks unchanged", async () => {
      const row = gearRow(page, freshSheet, drug.itemId);
      await row.locator('a.item-action[data-action-type="split"]').click();
      await expect(splitDialog).toBeVisible({ timeout: 5000 });

      await splitDialog.locator('input[name="splitAmount"]').fill("0");
      await splitDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(splitDialog).toHaveCount(0, { timeout: 5000 });

      await expect
        .poll(
          () =>
            page.consoleWarnings.some((t) =>
              /You cannot split 0 of 3 from Split Drug\./.test(t),
            ),
          { timeout: 5000 },
        )
        .toBe(true);

      const amounts = await page.evaluate(
        (aid) =>
          Array.from(game.actors.get(aid).itemTypes.drug)
            .map((d) => d.system.amount)
            .sort((a, b) => a - b),
        actorId,
      );
      expect(amounts).toEqual([2, 3]);
    });

    await test.step("canceling leaves both stacks unchanged", async () => {
      const row = gearRow(page, freshSheet, drug.itemId);
      await row.locator('a.item-action[data-action-type="split"]').click();
      await expect(splitDialog).toBeVisible({ timeout: 5000 });

      await splitDialog.locator('input[name="splitAmount"]').fill("1");
      await splitDialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(splitDialog).toHaveCount(0, { timeout: 5000 });

      const amounts = await page.evaluate(
        (aid) =>
          Array.from(game.actors.get(aid).itemTypes.drug)
            .map((d) => d.system.amount)
            .sort((a, b) => a - b),
        actorId,
      );
      expect(amounts).toEqual([2, 3]);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("snorting a drug enables its active effect, decrements the amount, and logs it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    let freshSheet = sheetId;
    let stimId;

    const effectState = () =>
      page.evaluate(
        ({ aid, iid }) => {
          const actor = game.actors.get(aid);
          const itemEffect =
            actor.items.get(iid).effects.find((e) => e.name === "Stim")
              ?.disabled ?? null;
          const actorEffect = [...actor.allApplicableEffects()].find(
            (e) => e.name === "Stim",
          );
          return {
            itemEffect,
            actorActive: actorEffect ? actorEffect.active : null,
          };
        },
        { aid: actorId, iid: stimId },
      );

    await test.step("creating a snorted-usage drug with an active effect adds it to the character", async () => {
      const created = await createInventoryItemViaUI(page, {
        actorId,
        sheetId: freshSheet,
        itemType: "drug",
        itemName: "Stim",
      });
      stimId = created.itemId;
      freshSheet = created.sheetId;

      await gearRow(page, freshSheet, stimId).locator("a.item-edit").click();
      const itemSheetId = await openOwnedItemSheet(page, {
        actorId,
        itemId: stimId,
      });
      const itemSheet = page.locator(`#${itemSheetId}`);
      await itemSheet.locator('a.tab-label[data-tab="item-effects"]').click();

      await itemSheet.locator('a.effect-control[data-action="create"]').click();
      const effectSheet = page.locator(".active-effect-config");
      await expect(effectSheet).toBeVisible({ timeout: 10000 });
      await effectSheet.locator('input[name="name"]').fill("Stim");
      await effectSheet.locator('button[type="submit"]').click();
      await expect(effectSheet).toBeHidden({ timeout: 10000 });

      const usageSelect = itemSheet.locator('select[name="system.usage"]');
      await expect(usageSelect).toBeVisible({ timeout: 10000 });
      await usageSelect.selectOption("snorted");
      await page.waitForFunction(
        ({ aid, iid }) => {
          const item = game.actors.get(aid).items.get(iid);
          return (
            item.system.usage === "snorted" &&
            item.effects.find((e) => e.name === "Stim")?.disabled === true
          );
        },
        { aid: actorId, iid: stimId },
        { timeout: 10000 },
      );

      const consumedSelect = itemSheet.locator(
        'select[name="system.consumed"]',
      );
      await expect(consumedSelect).toBeVisible({ timeout: 10000 });
      await consumedSelect.selectOption("Stim");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.consumed === "Stim",
        { aid: actorId, iid: stimId },
        { timeout: 10000 },
      );

      await closeOwnedItemSheet(page, { actorId, itemId: stimId });
      await openGearTab(page, freshSheet);
      const input = gearRow(page, freshSheet, stimId).locator(
        "input.gear-amount-input",
      );
      await expect(input).toHaveValue("1");

      expect(await effectState()).toEqual({
        itemEffect: true,
        actorActive: false,
      });
    });

    await test.step("setting the amount to 3 persists", async () => {
      const input = gearRow(page, freshSheet, stimId).locator(
        "input.gear-amount-input",
      );
      await input.fill("3");
      await input.press("Tab");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.amount === 3,
        { aid: actorId, iid: stimId },
        { timeout: 5000 },
      );
    });

    await test.step("snorting confirms, enables the drug's active effect, and decrements the amount", async () => {
      const row = gearRow(page, freshSheet, stimId);
      await row.locator('a.item-action[data-action-type="snort"]').click();
      const dialog = yesNoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.locator(".cpr-dialog-message")).toContainText(
        "Are you sure you want to consume",
      );

      await resolveYesNo(dialog, "yes");
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.amount === 2,
        { aid: actorId, iid: stimId },
        { timeout: 10000 },
      );

      expect(await effectState()).toEqual({
        itemEffect: false,
        actorActive: true,
      });
      await expect
        .poll(
          () =>
            page.consoleLogs.some((t) =>
              /CPR LOG \| Stim\s+consumed\. Make it count!/.test(t),
            ),
          { timeout: 5000 },
        )
        .toBe(true);
    });

    await test.step("on a fresh render the amount and the enabled effect persist", async () => {
      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await openGearTab(page, freshSheet);
      await expect(
        gearRow(page, freshSheet, stimId).locator("input.gear-amount-input"),
      ).toHaveValue("2");
      expect(await effectState()).toEqual({
        itemEffect: false,
        actorActive: true,
      });
    });

    await test.step("declining the confirmation leaves the drug untouched", async () => {
      const row = gearRow(page, freshSheet, stimId);
      await row.locator('a.item-action[data-action-type="snort"]').click();
      const dialog = yesNoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await resolveYesNo(dialog, "no");
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      const amount = await page.evaluate(
        ({ aid, iid }) => game.actors.get(aid).items.get(iid).system.amount,
        { aid: actorId, iid: stimId },
      );
      expect(amount).toBe(2);
      expect(await effectState()).toEqual({
        itemEffect: false,
        actorActive: true,
      });
      const consumedLines = page.consoleLogs.filter((t) =>
        /consumed\. Make it count!/.test(t),
      );
      expect(consumedLines.length).toBe(1);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("clicking an item name opens its sheet; ctrl-click posts a chat card", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Card Weapon",
    });
    let freshSheet = weapon.sheetId;

    await test.step("clicking the name opens the item's sheet", async () => {
      await gearRow(page, freshSheet, weapon.itemId)
        .locator("a.name.item-edit")
        .click();
      const itemSheetId = await openOwnedItemSheet(page, {
        actorId,
        itemId: weapon.itemId,
      });
      expect(itemSheetId).toBeTruthy();
      await closeOwnedItemSheet(page, { actorId, itemId: weapon.itemId });
    });

    await test.step("ctrl-click posts a chat card and does not open the sheet", async () => {
      const messageCount = await chatMessageCount(page);
      await gearRow(page, freshSheet, weapon.itemId)
        .locator("a.name.item-edit")
        .click({ modifiers: CTRL_CLICK_MODIFIERS });

      const cardId = await page
        .waitForFunction(
          ({ count, name }) => {
            if (game.messages.size <= count) return null;
            const msg = game.messages.contents.at(-1);
            const el = document.createElement("div");
            el.innerHTML = msg.content;
            const cardName = el
              .querySelector(".item-card-name")
              ?.textContent?.trim();
            return cardName === name ? msg.id : null;
          },
          { count: messageCount, name: "Card Weapon" },
          { timeout: 10000 },
        )
        .then((handle) => handle.jsonValue());
      expect(cardId).toBeTruthy();

      const rendered = await page.evaluate(
        ({ aid, iid }) => game.actors.get(aid).items.get(iid).sheet.rendered,
        { aid: actorId, iid: weapon.itemId },
      );
      expect(rendered).toBe(false);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("each category's extra column shows its type-specific data", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const netarch = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "netarch",
      itemName: "Test Netarch",
      data: {
        system: {
          floors: [
            {
              blackice: "--",
              branch: "a",
              content: "CPR.netArchitecture.floor.options.password",
              description: "",
              dv: "N/A",
              floor: "1",
              index: 0,
            },
            {
              blackice: "--",
              branch: "b",
              content: "CPR.netArchitecture.floor.options.file",
              description: "",
              dv: "5",
              floor: "2",
              index: 1,
            },
          ],
        },
      },
    });
    const vehicle = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: netarch.sheetId,
      itemType: "vehicle",
      itemName: "Test Vehicle",
      data: { system: { seats: 6, sdp: 75, speedCombat: 40 } },
    });
    const deck = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: vehicle.sheetId,
      itemType: "cyberdeck",
      itemName: "Test Deck",
      data: { system: { installedItems: { slots: 3 } } },
    });
    const program = await createInventoryItemViaUI(page, {
      actorId,
      sheetId: deck.sheetId,
      itemType: "program",
      itemName: "Test Program",
    });
    let freshSheet = program.sheetId;

    const programSectionRows = (sid) =>
      page
        .locator(`#${sid} .collapsible`)
        .filter({ has: page.locator("#gearTab-program") })
        .locator('li.item[data-item-category="program"]');

    await test.step("the netarch row shows its floor count", async () => {
      await expect(
        gearRow(page, freshSheet, netarch.itemId).locator(
          ".gear-amount .gear-amount-value",
        ),
      ).toHaveText("x 2");
    });

    await test.step("the vehicle row shows seats, SDP and combat speed", async () => {
      const data = gearRow(page, freshSheet, vehicle.itemId).locator(
        ".gear-data",
      );
      await expect(data).toContainText("Seats: 6");
      await expect(data).toContainText("SDP: 75");
      await expect(data).toContainText("Combat Speed: 40");
    });

    await test.step("the cyberdeck row shows its slot count", async () => {
      await expect(
        gearRow(page, freshSheet, deck.itemId).locator(".gear-amount"),
      ).toHaveText("3");
    });

    await test.step("installing a program removes it from the Programs section and nests it under the deck", async () => {
      await expect(programSectionRows(freshSheet)).toHaveCount(1);

      await gearRow(page, freshSheet, deck.itemId)
        .locator('a[data-action-type="manage-programs"]')
        .click();
      const dialog = manageUpgradesDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${program.itemId}"]`,
      );
      await expect(checkbox).toBeVisible();
      await checkbox.check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      const afterSheet = await closeAndReopenActorSheet(page, actorId);
      freshSheet = afterSheet;
      await expect(programSectionRows(freshSheet)).toHaveCount(0);
      const nested = page.locator(
        `#${freshSheet} .sub-list[data-items-wrapper-for-parent="${deck.itemId}"] li[data-item-id="${program.itemId}"]`,
      );
      await expect(nested).toHaveCount(1);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});

test.describe("Character sheet — Gear (player read-only boundary)", () => {
  test("a LIMITED-permission player sees the gear tab without working controls", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    await enablePlayersCreateInventory(game);
    const { actorId, sheetId } = await createCharacterViaUI(game);
    const weapon = await createInventoryItemViaUI(game, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Boundary Weapon",
    });
    const drug = await createInventoryItemViaUI(game, {
      actorId,
      sheetId: weapon.sheetId,
      itemType: "drug",
      itemName: "Boundary Drug",
    });

    await test.step("the GM grants the harness player LIMITED ownership", async () => {
      const playerId = await game.evaluate(
        () => game.users.getName("E2E Player")?.id ?? null,
      );
      expect(playerId, "the harness player should exist").toBeTruthy();
      await game.evaluate(
        async ({ actorId, playerId }) => {
          const actor = game.actors.get(actorId);
          await actor.update({
            [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
          });
        },
        { actorId, playerId },
      );
    });

    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      let playerSheet;
      await test.step("the player opens the character's gear tab", async () => {
        playerSheet = await reopenActorSheetViaUI(player, actorId);
        await openGearTab(player, playerSheet);
        await expect(gearRow(player, playerSheet, weapon.itemId)).toBeVisible();
        await expect(gearRow(player, playerSheet, drug.itemId)).toBeVisible();
      });

      await test.step("the inline amount input is disabled", async () => {
        await expect(
          gearRow(player, playerSheet, drug.itemId).locator(
            "input.gear-amount-input",
          ),
        ).toBeDisabled();
      });

      await test.step("clicking an item name does nothing", async () => {
        const messageCount = await chatMessageCount(player);
        await gearRow(player, playerSheet, weapon.itemId)
          .locator("a.name.item-edit")
          .click();
        const state = await player.evaluate(
          ({ aid, iid }) => ({
            rendered: game.actors.get(aid).items.get(iid).sheet.rendered,
            messages: game.messages.size,
          }),
          { aid: actorId, iid: weapon.itemId },
        );
        expect(state.rendered).toBe(false);
        expect(state.messages).toBe(messageCount);
      });

      // we may want to hide these
      await test.step("the action glyphs still render (documenting current behaviour)", async () => {
        const weaponRow = gearRow(player, playerSheet, weapon.itemId);
        await expect(weaponRow.locator("a.equip")).toBeVisible();
        await expect(
          weaponRow.locator('a.item-action[data-action-type="delete"]'),
        ).toBeVisible();
        await expect(
          weaponRow.locator('a.item-action[data-action-type="favorite"]'),
        ).toBeVisible();
      });
    } finally {
      await context.close();
    }
  });
});
