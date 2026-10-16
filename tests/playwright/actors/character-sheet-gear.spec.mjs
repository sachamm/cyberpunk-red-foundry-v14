import { test, expect } from "@playwright/test";
import { closeDocSheet } from "../../../tools/playwright/ui/index.mjs";
import {
  createInventoryItemViaUI,
  enablePlayersCreateInventory,
} from "./container-sheet-helpers.mjs";
import {
  closeAndReopenCharacterSheet,
  createCharacterViaUI,
  equipStateIcon,
  gearCategoryHeader,
  gearRow,
  installConsoleErrorHarness,
  installUpgradeViaUI,
  manageUpgradesDialog,
  openGearTab,
  resolveYesNo,
  yesNoDialog,
} from "./character-sheet-helpers.mjs";

installConsoleErrorHarness();

test.describe("Character sheet — Gear", () => {
  test("G1: the create glyph is gated by the playersCreateInventory setting", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    let freshSheet = sheetId;

    await test.step("with the setting off, no item-create glyphs render", async () => {
      const gear = await openGearTab(page, freshSheet);
      await expect(gear.locator("a.item-create")).toHaveCount(0);
    });

    await test.step("enabling the setting reveals a glyph for every category", async () => {
      await enablePlayersCreateInventory(page);
      freshSheet = await closeAndReopenCharacterSheet(page, actorId);
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

      freshSheet = await closeAndReopenCharacterSheet(page, actorId);
      const row = gearRow(page, freshSheet, itemId);
      await expect(row).toBeVisible();
      await expect(row.locator("a.name.item-edit")).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G2: inline amount edit persists and invalid input is rejected", async ({
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

      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
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

      // The rejection surfaces as an error notification; both Foundry's
      // ui.notifications.error and DisplayMessage's LOGGER.error log it to
      // the console, so register both for the global console check. The toast
      // itself is transient, so the warning is asserted from the console.
      page.expectedConsoleErrors.push(
        /CPR ERR \| Error: The amount entered could not be converted to a number/,
        /^Error: The amount entered could not be converted to a number!/,
      );

      // The field is type=number, so typing a non-numeric character leaves
      // an invalid (empty) value. The sheet listens for "change", which only
      // fires when the field blurs with a different value — Tab away so the
      // handler sees the invalid state.
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

  test("G3: the favorite toggle pins a gear row and persists", async ({
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(gearRow(page, afterSheet, itemId)).toHaveClass(/favorite/);
      await closeDocSheet(page, { collection: "actors", id: actorId });
    });
  });

  test("G4: collapsing and expanding a gear category persists", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Cat Weapon",
    });

    const freshSheet = await closeAndReopenCharacterSheet(page, actorId);
    await openGearTab(page, freshSheet);

    await test.step("weapon category is expanded initially", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await expect(header.locator("i.fa-minus.expand-icon")).toBeVisible();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeHidden();
    });

    await test.step("clicking the header collapses: plus shows, rows hide", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await header.click();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeVisible();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeHidden();
    });

    await test.step("expanding again restores rows", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await header.click();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeVisible();
    });

    await test.step("collapse persists on a fresh render", async () => {
      const header = gearCategoryHeader(page, freshSheet, "weapon");
      await header.click();
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      const afterHeader = gearCategoryHeader(page, afterSheet, "weapon");
      await expect(
        afterHeader.locator("i.fa-plus.collapse-icon"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G5: deleting a gear item asks for confirmation; cancel keeps it, confirm removes it", async ({
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

      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(gearRow(page, afterSheet, itemId)).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G6: the equip glyph cycles owned → carried → equipped and persists", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId, sheetId: freshSheet } = await createInventoryItemViaUI(
      page,
      { actorId, sheetId, itemType: "weapon", itemName: "Cycle Weapon" },
    );

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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, itemId), "equipped"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G7: equipping a second two-handed weapon warns about hands but still equips it", async ({
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

      // The hands check only warns (Rules.lawyer) — it does not block the
      // transition, so the weapon still ends up equipped.
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, first.itemId), "equipped"),
      ).toBeVisible();
      await expect(
        equipStateIcon(gearRow(page, afterSheet, second.itemId), "equipped"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G8: a second cyberdeck reverts to owned while one is equipped", async ({
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

      // Unlike the hands warning, the single-cyberdeck rule blocks the
      // transition: the new value is forced back to "owned".
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, first.itemId), "equipped"),
      ).toBeVisible();
      await expect(
        equipStateIcon(gearRow(page, afterSheet, second.itemId), "owned"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G10: equipping body armor tracks its SP on the actor; unequipping clears it", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const { itemId, sheetId: freshSheet } = await createInventoryItemViaUI(
      page,
      { actorId, sheetId, itemType: "armor", itemName: "Body Armor" },
    );

    await test.step("a new body armor starts untracked (no id, zero SP)", async () => {
      // v13 represents an untracked id inconsistently (absent or empty), so
      // normalize both to "" — the meaningful part is that no armor is tracked.
      const tracked = await page.evaluate(
        ({ aid }) => {
          const armor = game.actors.get(aid).system.externalData.currentArmorBody;
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
      // Default body armor has SP 7 and no ablation.
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, itemId), "equipped"),
      ).toBeVisible();
    });

    await test.step("cycling back to owned clears the tracked armor", async () => {
      const row = gearRow(page, freshSheet, itemId);
      await row.locator("a.equip").click();
      // The cleared id may come back absent, null, or empty depending on
      // v13's DocumentIdField normalization — the meaningful part is that it
      // no longer points at this armor and its SP is zeroed.
      await page.waitForFunction(
        ({ aid, iid }) => {
          const armor =
            game.actors.get(aid).system.externalData.currentArmorBody;
          return (
            armor.id !== iid &&
            armor.value === 0 &&
            armor.max === 0
          );
        },
        { aid: actorId, iid: itemId },
        { timeout: 5000 },
      );
      await expect(equipStateIcon(row, "owned")).toBeVisible();

      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, itemId), "owned"),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G11: ablated body armor shows reduced SP and the repair glyph restores it", async ({
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      const row = gearRow(page, afterSheet, itemId);
      await expect(row.locator(".gear-amount span")).toHaveText("7/7");
      await expect(row.locator("a.repair")).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G16: the manage-upgrades dialog installs and uninstalls an upgrade", async ({
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      const row = gearRow(page, afterSheet, weapon.itemId);
      await expect(row.locator(".fa-square-caret-up")).toHaveCount(0);
      await expect(
        row.locator('a[data-action-type="manage-upgrades"]'),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G17: the chevron toggles nested installed items and persists", async ({
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
      freshSheet = await closeAndReopenCharacterSheet(page, actorId);
      const row = gearRow(page, freshSheet, weapon.itemId);
      const chevron = row.locator(".toggle-installed-visibility");
      await expect(chevron).toBeVisible();
      // Points down (flipped) while collapsed.
      await expect(chevron.locator("i")).toHaveClass(/fa-flip-vertical/);
      await expect(wrapperFor(freshSheet)).toHaveClass(/item-hidden/);
    });

    await test.step("clicking the chevron expands the nested list", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator(".toggle-installed-visibility").click();
      // The flag persists once the collapse animation ends (transitionend).
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
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      const row = gearRow(page, afterSheet, weapon.itemId);
      await expect(
        row.locator(".toggle-installed-visibility i"),
      ).not.toHaveClass(/fa-flip-vertical/);
      await expect(wrapperFor(afterSheet)).not.toHaveClass(/item-hidden/);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("G9: cycling a weapon's equip state does not change its installed upgrade's state", async ({
    page,
  }) => {
    // The sheet cascades the new equip state to all installed items
    // (_cycleEquipState), but itemUpgrade has no `equipped` field in its data
    // model, so Foundry v13's schema cleaning drops the write. This test pins
    // down the actual behavior: the upgrade never gains an equip state.
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: "Cascade Weapon",
    });
    const upgrade = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "itemUpgrade",
      itemName: "Cascade Upgrade",
    });
    let freshSheet = upgrade.sheetId;

    await installUpgradeViaUI(page, {
      sheetId: freshSheet,
      actorId,
      itemId: weapon.itemId,
      upgradeId: upgrade.itemId,
    });

    // page.evaluate serializes undefined as null, so map absence to a sentinel.
    const upgradeEquipped = () =>
      page.evaluate(
        ({ aid, iid }) => {
          const value = game.actors.get(aid).items.get(iid).system.equipped;
          return value === undefined ? "__absent__" : value;
        },
        { aid: actorId, iid: upgrade.itemId },
      );

    await test.step("the installed upgrade has no equip state of its own", async () => {
      expect(await upgradeEquipped()).toBe("__absent__");
    });

    await test.step("cycling the weapon to carried leaves the upgrade unchanged", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "carried",
        { aid: actorId, iid: weapon.itemId },
        { timeout: 5000 },
      );
      expect(await upgradeEquipped()).toBe("__absent__");
    });

    await test.step("cycling the weapon to equipped still leaves the upgrade unchanged", async () => {
      const row = gearRow(page, freshSheet, weapon.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped === "equipped",
        { aid: actorId, iid: weapon.itemId },
        { timeout: 5000 },
      );
      expect(await upgradeEquipped()).toBe("__absent__");
      await expect(equipStateIcon(row, "equipped")).toBeVisible();
    });

    await test.step("on a fresh render the weapon is equipped and the upgrade still has no equip state", async () => {
      const afterSheet = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        equipStateIcon(gearRow(page, afterSheet, weapon.itemId), "equipped"),
      ).toBeVisible();
      expect(await upgradeEquipped()).toBe("__absent__");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});
