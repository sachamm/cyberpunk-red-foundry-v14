import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  activateGearTab,
  addModViaUI,
  clickEffectActionViaUI,
  closeActiveEffectConfigViaUI,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createEffectViaUI,
  createInventoryItemViaUI,
  createItemViaUI,
  enablePlayersCreateInventory,
  equipWeapon,
  getEffectRowViaUI,
  hoverGearRow,
  openOwnedItemSheet,
  reopenItemSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createCharacterViaUI,
  gearRow,
} from "../actors/character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Effects mixin: the active effects an item carries and how its "usage"
 * gates them.
 *
 * - The effect glyphs on the item sheet's Effects tab drive the v13 effect
 *   editor: create (named "New Effect"), copy, toggle (rendered while usage
 *   is "toggled", the schema default), and delete; rows persist across full
 *   sheet reopens.
 * - The usage select only renders once the item has at least one effect and
 *   offers exactly the type's allowed usages (getAllowedUsage): weapon
 *   always/toggled/carried/equipped, drug adds snorted, program
 *   always/toggled/rezzed.
 * - A "equipped"-usage effect on an owned weapon is suppressed until the
 *   weapon is actually equipped, then applies to the actor's stat.
 * - Switching a drug's usage to "snorted" bulk-disables every effect; back
 *   to "equipped" re-enables them all (_setUsage).
 */

async function openEffectsTab(itemSheet) {
  await itemSheet.locator('a.tab-label[data-tab="item-effects"]').click();
}

async function expectUsageOptions(page, type, expected) {
  const itemId = await createItemViaUI(page, {
    type,
    name: uniqueName(type),
  });
  const itemSheet = page.locator(`#CPRItemSheet-Item-${itemId}`);
  await expect(itemSheet).toBeVisible();
  await openEffectsTab(itemSheet);

  const { aeConfig } = await createEffectViaUI(page, itemSheet, {
    ownerType: "item",
    ownerId: itemId,
  });
  await closeActiveEffectConfigViaUI(page, aeConfig);

  const usageSelect = itemSheet.locator('select[name="system.usage"]');
  await expect(usageSelect).toBeVisible({ timeout: 10000 });
  const options = await usageSelect
    .locator("option")
    .evaluateAll((opts) => opts.map((opt) => opt.value));
  expect(options).toEqual(expected);

  await closeDocSheet(page, { collection: "items", id: itemId });
}

test.describe("Item effects mixin", () => {
  test("the effect glyphs create, copy, toggle, and delete an item's active effects", async ({
    page,
  }) => {
    const itemId = await createItemViaUI(page, {
      type: "weapon",
      name: uniqueName("pistol"),
    });
    let itemSheet = page.locator(`#CPRItemSheet-Item-${itemId}`);
    await expect(itemSheet).toBeVisible();

    let aeConfig;
    let effectId;

    await test.step("the create glyph opens the v13 editor with a New Effect", async () => {
      await openEffectsTab(itemSheet);
      ({ aeConfig, effectId } = await createEffectViaUI(page, itemSheet, {
        ownerType: "item",
        ownerId: itemId,
      }));
      await expect(aeConfig.locator('input[name="name"]')).toHaveValue(
        "New Effect",
      );
      await expect(
        aeConfig.locator('input[name="disabled"]'),
      ).not.toBeChecked();
    });

    await test.step("a change added through the editor shows on the summary row", async () => {
      await aeConfig.locator('nav [data-tab="changes"]').click();
      const row = await addModViaUI(aeConfig);
      await row.locator(".key-cat").selectOption("combat");
      await page.waitForFunction(
        ({ itemId: id, effectId: eid }) =>
          game.items
            .get(id)
            .effects.get(eid)
            .getFlag(game.system.id, "changes.cats.0") === "combat",
        { itemId, effectId },
      );
      await row.locator("select.key-key").selectOption("bonuses.maxHp");
      await page.waitForFunction(
        ({ itemId: id, effectId: eid }) =>
          game.items.get(id).effects.get(eid).changes[0].key ===
          "bonuses.maxHp",
        { itemId, effectId },
      );
      const valueInput = aeConfig.locator('input[name="changes.0.value"]');
      await valueInput.fill("2");
      await valueInput.press("Tab");
      await page.waitForFunction(
        ({ itemId: id, effectId: eid }) =>
          game.items.get(id).effects.get(eid).changes[0].value === "2",
        { itemId, effectId },
      );

      await closeActiveEffectConfigViaUI(page, aeConfig);
      const summaryRow = await getEffectRowViaUI(itemSheet, "New Effect");
      await expect(summaryRow.first()).toContainText("Max Hit Points");
      await expect(summaryRow.first()).toContainText("+2");
    });

    await test.step("the row and its change persist across a full sheet reopen", async () => {
      await closeDocSheet(page, { collection: "items", id: itemId });
      const reopenedId = await reopenItemSheetViaUI(page, itemId);
      itemSheet = page.locator(`#${reopenedId}`);
      await openEffectsTab(itemSheet);

      const summaryRow = await getEffectRowViaUI(itemSheet, "New Effect");
      await expect(summaryRow).toHaveCount(1);
      await expect(summaryRow.first()).toContainText("Max Hit Points");
      await expect(summaryRow.first()).toContainText("+2");
    });

    await test.step("the copy glyph duplicates the effect", async () => {
      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      await clickEffectActionViaUI(rows.first(), "copy");
      await expect(rows).toHaveCount(2);

      const effects = await page.evaluate(
        (id) =>
          game.items.get(id).effects.contents.map((effect) => ({
            changes: effect.changes,
            flags: effect.getFlag(game.system.id, "changes"),
            disabled: effect.disabled,
          })),
        itemId,
      );
      expect(effects[1]).toEqual(effects[0]);
    });

    await test.step("the toggle glyph disables the effect and persists across a reopen", async () => {
      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      await expect(
        rows
          .first()
          .locator(
            'a.effect-control[data-action="toggle"] i.far.fa-circle-check',
          ),
      ).toHaveCount(1);

      const [firstId] = await page.evaluate(
        (id) => game.items.get(id).effects.contents.map((effect) => effect.id),
        itemId,
      );
      await clickEffectActionViaUI(rows.first(), "toggle");
      await page.waitForFunction(
        ({ itemId: id, effectId: eid }) =>
          game.items.get(id).effects.get(eid).disabled === true,
        { itemId, effectId: firstId },
      );
      await expect(
        rows
          .first()
          .locator('a.effect-control[data-action="toggle"] i.far.fa-circle'),
      ).toHaveCount(1);

      await closeDocSheet(page, { collection: "items", id: itemId });
      const reopenedId = await reopenItemSheetViaUI(page, itemId);
      itemSheet = page.locator(`#${reopenedId}`);
      await openEffectsTab(itemSheet);
      const reopenedRows = await getEffectRowViaUI(itemSheet, "New Effect");
      await expect(reopenedRows).toHaveCount(2);
      await expect(
        reopenedRows
          .first()
          .locator('a.effect-control[data-action="toggle"] i.far.fa-circle'),
      ).toHaveCount(1);
    });

    await test.step("the delete glyph removes the effects", async () => {
      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      await clickEffectActionViaUI(rows.nth(0), "delete");
      await expect(rows).toHaveCount(1);
      await clickEffectActionViaUI(rows.first(), "delete");
      await expect(rows).toHaveCount(0);

      const count = await page.evaluate(
        (id) => game.items.get(id).effects.contents.length,
        itemId,
      );
      expect(count).toBe(0);
      await expect(
        itemSheet.locator('select[name="system.usage"]'),
      ).toHaveCount(0);
    });

    await closeDocSheet(page, { collection: "items", id: itemId });
  });

  test("the usage select offers exactly the type's allowed usages", async ({
    page,
  }) => {
    await test.step("a weapon offers always, toggled, carried, and equipped", async () => {
      await expectUsageOptions(page, "weapon", [
        "always",
        "toggled",
        "carried",
        "equipped",
      ]);
    });

    await test.step("a drug adds snorted to the weapon set", async () => {
      await expectUsageOptions(page, "drug", [
        "always",
        "toggled",
        "snorted",
        "carried",
        "equipped",
      ]);
    });

    await test.step("a program offers only always, toggled, and rezzed", async () => {
      await expectUsageOptions(page, "program", [
        "always",
        "toggled",
        "rezzed",
      ]);
    });
  });

  test("an equipped-usage effect only applies while the weapon is equipped", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: uniqueName("pistol"),
    });
    let freshSheet = weapon.sheetId;

    const effectState = () =>
      page.evaluate(
        ({ aid, iid }) => {
          const item = game.actors.get(aid).items.get(iid);
          return {
            equipped: item.system.equipped,
            usage: item.system.usage,
            disabled: item.effects.contents[0].disabled,
            suppressed: item.effects.contents[0].system.isSuppressed,
            body: game.actors.get(aid).system.stats.body.value,
          };
        },
        { aid: actorId, iid: weapon.itemId },
      );

    await test.step("the owned weapon gets a +2 BODY effect with usage equipped", async () => {
      await gearRow(page, freshSheet, weapon.itemId)
        .locator("a.item-edit")
        .click();
      const itemSheetId = await openOwnedItemSheet(page, {
        actorId,
        itemId: weapon.itemId,
      });
      const itemSheet = page.locator(`#${itemSheetId}`);
      await openEffectsTab(itemSheet);

      await itemSheet.locator('a.effect-control[data-action="create"]').click();
      const aeConfig = page.locator(".application.active-effect-config");
      await expect(aeConfig).toBeVisible({ timeout: 10000 });

      await aeConfig.locator('nav [data-tab="changes"]').click();
      const row = await addModViaUI(aeConfig);
      await row.locator(".key-cat").selectOption("stat");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors
            .get(aid)
            .items.get(iid)
            .effects.contents[0].getFlag(game.system.id, "changes.cats.0") ===
          "stat",
        { aid: actorId, iid: weapon.itemId },
      );
      await row
        .locator("select.key-key")
        .selectOption("system.stats.body.value");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).effects.contents[0].changes[0]
            .key === "system.stats.body.value",
        { aid: actorId, iid: weapon.itemId },
      );
      const valueInput = aeConfig.locator('input[name="changes.0.value"]');
      await valueInput.fill("2");
      await valueInput.press("Tab");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).effects.contents[0].changes[0]
            .value === "2",
        { aid: actorId, iid: weapon.itemId },
      );

      await closeActiveEffectConfigViaUI(page, aeConfig);

      const usageSelect = itemSheet.locator('select[name="system.usage"]');
      await expect(usageSelect).toBeVisible({ timeout: 10000 });
      await usageSelect.selectOption("equipped");
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.usage === "equipped",
        { aid: actorId, iid: weapon.itemId },
      );

      await closeOwnedItemSheet(page, { actorId, itemId: weapon.itemId });
    });

    await test.step("while unequipped the effect is suppressed and BODY stays at base", async () => {
      await expect.poll(effectState, { timeout: 10000 }).toEqual({
        equipped: "owned",
        usage: "equipped",
        disabled: false,
        suppressed: true,
        body: 6,
      });
      await expect(
        page
          .locator(`#${freshSheet}`)
          .locator('input[name="system.stats.body.value"]'),
      ).toHaveValue("6");
    });

    await test.step("equipping the weapon applies the +2", async () => {
      await equipWeapon(page, {
        actorSheetId: freshSheet,
        actorId,
        itemId: weapon.itemId,
      });
      await expect.poll(effectState, { timeout: 10000 }).toMatchObject({
        equipped: "equipped",
        suppressed: false,
        body: 8,
      });

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        page
          .locator(`#${freshSheet}`)
          .locator('input[name="system.stats.body.value"]'),
      ).toHaveValue("8");
    });

    await test.step("unequipping reverts the stat", async () => {
      const gear = await activateGearTab(page, freshSheet);
      const row = await hoverGearRow(gear, weapon.itemId);
      await row.locator("a.equip").click();
      await page.waitForFunction(
        ({ aid, iid }) =>
          game.actors.get(aid).items.get(iid).system.equipped !== "equipped",
        { aid: actorId, iid: weapon.itemId },
        { timeout: 10000 },
      );
      await expect.poll(effectState, { timeout: 10000 }).toMatchObject({
        suppressed: true,
        body: 6,
      });

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        page
          .locator(`#${freshSheet}`)
          .locator('input[name="system.stats.body.value"]'),
      ).toHaveValue("6");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("changing a drug's usage bulk-disables or re-enables its effects", async ({
    page,
  }) => {
    const itemId = await createItemViaUI(page, {
      type: "drug",
      name: uniqueName("stim"),
    });
    let itemSheet = page.locator(`#CPRItemSheet-Item-${itemId}`);
    await expect(itemSheet).toBeVisible();
    await openEffectsTab(itemSheet);

    const effectStates = () =>
      page.evaluate(
        (id) =>
          game.items.get(id).effects.contents.map((effect) => effect.disabled),
        itemId,
      );

    await test.step("two effects created on the drug are both enabled", async () => {
      for (let i = 0; i < 2; i++) {
        const { aeConfig } = await createEffectViaUI(page, itemSheet, {
          ownerType: "item",
          ownerId: itemId,
        });
        await closeActiveEffectConfigViaUI(page, aeConfig);
      }

      expect(await effectStates()).toEqual([false, false]);
      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      await expect(rows).toHaveCount(2);
      for (const index of [0, 1]) {
        await expect(
          rows.nth(index).locator("i.far.fa-circle-check"),
        ).toHaveCount(1);
      }
    });

    await test.step("switching usage to snorted disables every effect", async () => {
      const usageSelect = itemSheet.locator('select[name="system.usage"]');
      await usageSelect.selectOption("snorted");
      await page.waitForFunction(
        (id) =>
          game.items
            .get(id)
            .effects.contents.every((effect) => effect.disabled),
        itemId,
        { timeout: 10000 },
      );

      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      for (const index of [0, 1]) {
        await expect(
          rows.nth(index).locator('a.effect-control[data-action="toggle"]'),
        ).toHaveCount(0);
      }
      await expect(
        itemSheet.locator('select[name="system.consumed"]'),
      ).toBeVisible();
    });

    await test.step("switching back to equipped re-enables every effect", async () => {
      const usageSelect = itemSheet.locator('select[name="system.usage"]');
      await usageSelect.selectOption("equipped");
      await page.waitForFunction(
        (id) =>
          game.items
            .get(id)
            .effects.contents.every((effect) => !effect.disabled),
        itemId,
        { timeout: 10000 },
      );

      await usageSelect.selectOption("toggled");
      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      for (const index of [0, 1]) {
        await expect(
          rows.nth(index).locator("i.far.fa-circle-check"),
        ).toHaveCount(1);
      }
    });

    await test.step("the re-enabled state persists across a sheet reopen", async () => {
      await closeDocSheet(page, { collection: "items", id: itemId });
      const reopenedId = await reopenItemSheetViaUI(page, itemId);
      itemSheet = page.locator(`#${reopenedId}`);
      await openEffectsTab(itemSheet);

      expect(await effectStates()).toEqual([false, false]);
      const rows = await getEffectRowViaUI(itemSheet, "New Effect");
      await expect(rows).toHaveCount(2);
      for (const index of [0, 1]) {
        await expect(
          rows.nth(index).locator("i.far.fa-circle-check"),
        ).toHaveCount(1);
      }
    });

    await closeDocSheet(page, { collection: "items", id: itemId });
  });
});
