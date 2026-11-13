import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
  installUpgrade,
  openItemSettings,
  openOwnedItemSheet,
  openSidebarTab,
  reopenActorSheetViaUI,
  reopenItemSheetViaUI,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";
import {
  characterSkillRow,
  chatRollCard,
  confirmRollDialog,
  SKILL_FIELD,
  skillRollDialog,
  statValueInput,
} from "../actors/character-sheet-helpers.mjs";

test.beforeEach(async ({ page }) => gotoReadyWorld(page));

test("upgrade settings only show modifier sections with configurable fields", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "itemUpgrade",
    name: uniqueName("upgrade-settings"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const explanation =
    "Modifier types will be added/subtracted to the datapoint.";

  for (const [type, field] of [
    ["clothing", null],
    ["weapon", "attackmod"],
    ["gear", null],
    ["armor", "bodySp"],
    ["cyberware", null],
    ["cyberdeck", "slots"],
    ["vehicle", "sdp"],
  ]) {
    await test.step(`${type} only shows applicable modifier controls`, async () => {
      await setItemSelected(page, {
        sheetId,
        itemId,
        name: "system.type",
        value: type,
      });
      await closeDocSheet(page, { collection: "items", id: itemId });
      sheetId = await reopenItemSheetViaUI(page, itemId);
      const sheet = await openItemSettings(page, sheetId);
      const header = sheet
        .locator(".item-settings-tab")
        .getByText("Attribute", { exact: true });
      if (field) {
        await expect.soft(header).toBeVisible();
        await expect.soft(sheet).toContainText(explanation);
        await expect
          .soft(sheet.locator(`input[name="system.modifiers.${field}.value"]`))
          .toBeVisible();
      } else {
        await expect.soft(header).toHaveCount(0);
        await expect.soft(sheet).not.toContainText(explanation);
      }
    });
  }

  await test.step("cyberware still offers secondary-weapon settings", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.type",
      value: "cyberware",
    });
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    for (const expected of [true, false]) {
      await toggleItemCheckbox(page, {
        sheetId,
        itemId,
        target: "system.modifiers.secondaryWeapon.configured",
        expected,
      });
      await closeDocSheet(page, { collection: "items", id: itemId });
      sheetId = await reopenItemSheetViaUI(page, itemId);
      const sheet = await openItemSettings(page, sheetId);
      await expect
        .soft(sheet.locator('input[name="system.attackmod"]'))
        .toHaveCount(expected ? 1 : 0);
      await expect
        .soft(sheet.getByText("Attribute", { exact: true }))
        .toHaveCount(0);
      await expect.soft(sheet).not.toContainText(explanation);
    }
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
});

test("migrated clothing effects follow installation and the equipped host", async ({
  page,
}) => {
  const actorId = await createActorViaUI(page, {
    name: uniqueName("clothing-bonuses"),
  });
  let actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });
  const originalCool = Number(
    await page
      .locator(`#${actorSheetId} ${statValueInput("cool")}`)
      .inputValue(),
  );
  const originalBase = Number(
    await characterSkillRow(page, actorSheetId, "Wardrobe & Style")
      .locator(SKILL_FIELD.base)
      .innerText(),
  );
  const ownedIds = [];
  let worldUpgradeId;
  let upgradeName;

  await test.step("import saved clothing bonuses and copy the items to an actor", async () => {
    for (const type of ["clothing", "itemUpgrade"]) {
      const name = uniqueName(type);
      const itemId = await createItemViaUI(page, { type, name });
      const sheetId = await expectSheetRendered(page, {
        collection: "items",
        id: itemId,
      });
      if (type === "itemUpgrade") {
        worldUpgradeId = itemId;
        upgradeName = name;
        await setItemSelected(page, {
          sheetId,
          itemId,
          name: "system.type",
          value: "clothing",
        });
        await closeDocSheet(page, { collection: "items", id: itemId });
        const legacy = await page.evaluate(
          (id) => game.items.get(id).toObject(),
          itemId,
        );
        legacy.system.modifiers.cool = {
          type: "modifier",
          value: 2,
          isSituational: true,
          onByDefault: false,
        };
        legacy.system.modifiers["Wardrobe & Style"] = {
          type: "modifier",
          value: 3,
          isSituational: true,
          onByDefault: true,
        };
        legacy.flags["cyberpunk-red-core"] = { _migration: { current: 48 } };
        await openSidebarTab(page, "items");
        await page
          .locator(`#items [data-entry-id="${itemId}"]`)
          .click({ button: "right" });
        await page
          .locator("#context-menu")
          .getByText("Import Data", { exact: true })
          .click();
        const importer = page
          .locator(".application")
          .filter({ has: page.locator('input[type="file"]') });
        await importer.locator('input[type="file"]').setInputFiles({
          name: "legacy-clothing-upgrade.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(legacy)),
        });
        await importer.locator('button[data-action="import"]').click();
        await page.waitForFunction(
          (id) => game.items.get(id).system.modifiers.cool?.value === 2,
          itemId,
        );
      } else {
        await closeDocSheet(page, { collection: "items", id: itemId });
      }
      await dragItemToActorSheet(page, {
        actorId,
        itemId,
        sheetId: actorSheetId,
      });
      ownedIds.push(
        await page.evaluate(
          ({ actorId, name }) =>
            game.actors.get(actorId).items.find((item) => item.name === name)
              .id,
          { actorId, name },
        ),
      );
    }
    actorSheetId = await closeAndReopenActorSheet(page, actorId);
    await expect(
      page.locator(`#${actorSheetId} ${statValueInput("cool")}`),
    ).toHaveValue(String(originalCool));
  });
  const [clothingId, upgradeId] = ownedIds;

  await test.step("run the real world migration and reopen the converted item", async () => {
    await page.evaluate(() =>
      game.settings.set(game.system.id, "dataModelVersion", 48),
    );
    await page.reload();
    const migration = page.locator("#cpr-migration");
    const confirm = migration.locator('[data-action="confirmMigration"]');
    await expect(confirm).toBeVisible();
    await confirm.hover();
    await page.mouse.down();
    await expect(confirm).toHaveCount(0);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const runner = game.cpr.MigrationRunner;
          return runner.error
            ? String(runner.error.cause?.stack ?? runner.error)
            : runner.migrationSuccessful;
        }),
      )
      .toBe(true);
    const refresh = migration.locator('[data-action="refresh"]');
    await expect(refresh).toBeVisible();
    await page.waitForFunction(
      () =>
        game.settings.get(game.system.id, "dataModelVersion") ===
        String(game.cpr.MigrationRunner.newDataModelVersion),
    );
    await page.evaluate(() =>
      game.settings.set(game.system.id, "justMigrated", false),
    );
    await refresh.click();
    await page.waitForFunction(() => globalThis.game?.ready);
    const sheetId = await reopenItemSheetViaUI(page, worldUpgradeId);
    const sheet = await openItemSettings(page, sheetId);
    await expect(
      sheet.locator('input[name="system.modifiers.cool.value"]'),
    ).toHaveCount(0);
    await expect(
      sheet.locator('input[name="system.modifiers.Wardrobe & Style.value"]'),
    ).toHaveCount(0);
    await sheet.locator('.navtabs-item [data-tab="item-effects"]').click();
    const effectRow = sheet
      .locator("li.effect")
      .filter({ hasText: upgradeName });
    await expect(effectRow).toContainText("+2");
    await expect(effectRow).toContainText("+3");
    await effectRow.locator('[data-action="edit"]').click();
    const config = page.locator(".application.active-effect-config");
    await config.locator('nav [data-tab="changes"]').click();
    await expect(
      config.locator('input[name="system.changes.0.value"]'),
    ).toHaveValue("2");
    await expect(
      config.locator('.changes-list > li[data-index="0"] .toggle-situational'),
    ).not.toBeChecked();
    await expect(
      config.locator('.changes-list > li[data-index="1"] .toggle-situational'),
    ).toBeChecked();
    await expect(
      config.locator(
        '.changes-list > li[data-index="1"] .toggle-on-by-default',
      ),
    ).toBeChecked();
    await config.locator('[data-action="close"]').click();
    for (const id of [worldUpgradeId, upgradeId]) {
      const migrated = await page.evaluate(
        ({ id, actorId, worldUpgradeId }) => {
          const item =
            id === worldUpgradeId
              ? game.items.get(id)
              : game.actors.get(actorId).items.get(id);
          return {
            effects: item.effects.size,
            legacy: item.getFlag(game.system.id, "legacyClothingModifiers"),
          };
        },
        { id, actorId, worldUpgradeId },
      );
      expect(migrated.effects).toBe(1);
      expect(migrated.legacy.cool.isSituational).toBe(true);
      expect(migrated.legacy["Wardrobe & Style"].value).toBe(3);
    }
    await closeDocSheet(page, { collection: "items", id: worldUpgradeId });
    actorSheetId = await reopenActorSheetViaUI(page, actorId);
  });

  await test.step("installing into unequipped clothing does not grant bonuses", async () => {
    await installUpgrade(page, {
      actorSheetId,
      actorId,
      upgradeId,
      targetId: clothingId,
    });
    actorSheetId = await closeAndReopenActorSheet(page, actorId);
    await expect(
      page.locator(`#${actorSheetId} ${statValueInput("cool")}`),
    ).toHaveValue(String(originalCool));
  });

  for (const [state, bonus] of [
    ["carried", 0],
    ["equipped", 2],
    ["owned", 0],
    ["carried", 0],
    ["equipped", 2],
  ]) {
    await test.step(`${state} clothing applies the bonuses exactly once`, async () => {
      const row = await hoverGearRow(
        await activateGearTab(page, actorSheetId),
        clothingId,
      );
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ actorId, clothingId, state }) =>
          game.actors.get(actorId).items.get(clothingId).system.equipped ===
          state,
        { actorId, clothingId, state },
      );
      actorSheetId = await closeAndReopenActorSheet(page, actorId);
      const sheet = page.locator(`#${actorSheetId}`);
      await expect
        .soft(sheet.locator(statValueInput("cool")))
        .toHaveValue(String(originalCool + bonus));
      await sheet.locator('.navtabs-right [data-tab="skills"]').click();
      await expect
        .soft(
          characterSkillRow(page, actorSheetId, "Wardrobe & Style").locator(
            SKILL_FIELD.base,
          ),
        )
        .toHaveText(String(originalBase + bonus));
    });
  }

  await test.step("the actual skill roll receives the STAT and situational bonus", async () => {
    const before = await chatMessageCount(page);
    await characterSkillRow(page, actorSheetId, "Wardrobe & Style")
      .locator("a.rollable")
      .click();
    const dialog = skillRollDialog(page);
    await expect(dialog.locator('input[name="statValue"]')).toHaveValue(
      String(originalCool + 2),
    );
    await expect(
      dialog.locator(".situational-mod-name").filter({ hasText: upgradeName }),
    ).toBeVisible();
    await expect(dialog.locator(".total-mod-value")).toHaveText("+3");
    await confirmRollDialog(dialog);
    const message = await waitForNewChatMessage(page, before, {
      requireRoll: true,
    });
    await expect(chatRollCard(page, await message.jsonValue())).toContainText(
      "COOL + 8",
    );
  });

  await test.step("the Actor Effects tab edits the real upgrade effect", async () => {
    const sheet = page.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-right [data-tab="effects"]').click();
    const effect = sheet
      .locator(".effects-tab li.effect")
      .filter({ hasText: upgradeName })
      .filter({ hasText: "COOL" });
    await effect.locator('[data-action="edit"]').click();
    let config = page.locator(".application.active-effect-config");
    await config.locator('nav [data-tab="changes"]').click();
    await config
      .locator('.changes-list > li[data-index="1"] .toggle-situational')
      .uncheck();
    await page.waitForFunction(
      ({ actorId, upgradeId }) =>
        !game.actors
          .get(actorId)
          .items.get(upgradeId)
          .effects.contents[0].getFlag(
            game.system.id,
            "changes.situational.1.isSituational",
          ),
      { actorId, upgradeId },
    );
    await config.locator('[data-action="close"]').click();
    await effect.locator('[data-action="edit"]').click();
    config = page.locator(".application.active-effect-config");
    await config.locator('nav [data-tab="changes"]').click();
    await expect(
      config.locator('.changes-list > li[data-index="1"] .toggle-situational'),
    ).not.toBeChecked();
    await config.locator('[data-action="close"]').click();
    actorSheetId = await closeAndReopenActorSheet(page, actorId);
    await page
      .locator(`#${actorSheetId} .navtabs-right [data-tab="skills"]`)
      .click();
    await expect(
      characterSkillRow(page, actorSheetId, "Wardrobe & Style").locator(
        SKILL_FIELD.base,
      ),
    ).toHaveText(String(originalBase + 5));
  });

  await test.step("uninstalling removes bonuses without deleting the editable effect", async () => {
    const row = await hoverGearRow(
      await activateGearTab(page, actorSheetId),
      clothingId,
    );
    await row.locator(".item-edit").click();
    const sheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: clothingId,
    });
    const sheet = await openItemSettings(page, sheetId);
    await sheet
      .locator(
        `a.uninstall-single-item[data-item-id="${upgradeId}"]:not([data-direct-parent])`,
      )
      .click();
    const dialog = page
      .locator(".cpr-dialog")
      .filter({ has: page.locator('input[name="selectedItems"]') });
    await dialog.locator('button[data-action="confirm"]').click();
    await page.waitForFunction(
      ({ actorId, upgradeId }) =>
        !game.actors.get(actorId).items.get(upgradeId).system.isInstalled,
      { actorId, upgradeId },
    );
    await closeOwnedItemSheet(page, { actorId, itemId: clothingId });
    actorSheetId = await closeAndReopenActorSheet(page, actorId);
    await expect(
      page.locator(`#${actorSheetId} ${statValueInput("cool")}`),
    ).toHaveValue(String(originalCool));
    await page
      .locator(`#${actorSheetId} .navtabs-right [data-tab="skills"]`)
      .click();
    await expect(
      characterSkillRow(page, actorSheetId, "Wardrobe & Style").locator(
        SKILL_FIELD.base,
      ),
    ).toHaveText(String(originalBase));
    expect(
      await page.evaluate(
        ({ actorId, upgradeId }) =>
          game.actors.get(actorId).items.get(upgradeId).effects.size,
        { actorId, upgradeId },
      ),
    ).toBe(1);
  });
  await closeDocSheet(page, { collection: "actors", id: actorId });
});
