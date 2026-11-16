import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeDocSheet,
  createItemViaUI,
  expectSheetRendered,
  openItemSettings,
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Cyberware sheet: the type-specific Settings surface — the type and install
 * location selects, the two humanity-loss inputs, the Requires-Foundational
 * block (absent for fashionware/external cyberware), and the Is-a-weapon
 * toggle that injects the attackable partial. The common/electronic/
 * installable/loadable/physical/quality/upgradable/valuable sections are owned
 * by the composition and mixin specs; the actor-side install flow (drag onto a
 * character, humanity loss at install time) lives in the character gear specs.
 *
 * Three current behaviours are pinned as-is:
 * - The Requires-Foundational checkbox is inverted relative to the stored
 *   value: `isFoundational=true` renders the empty circle and `false` the
 *   checked one.
 * - A non-foundational implant shows an "Option Slots Usage (Size)" input
 *   instead of the container rows.
 * - Changing the type to fashionware/external/internal cyberware forces
 *   `isFoundational=false` in CPRItem.update, so those types never show the
 *   foundational block and always render the upgradable partial's generic
 *   "Slots" input (which non-foundational implants of other types also get).
 *
 * Other specs share this world run, so nothing below counts world items
 * globally — every assertion is scoped to this test's own item.
 */

test("the settings rows follow the cyberware type and foundational flag", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "cyberware",
    name: uniqueName("cyberware"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const settings = await openItemSettings(page, sheetId);

  const optionSlotsRow = settings
    .locator("li.item", {
      has: page.locator(
        'a.item-checkbox[data-target="system.installedItems.allowed"]',
      ),
    })
    .filter({ hasText: "Has option slots" });

  await test.step("a new cyberarm shows the foundational rows with schema defaults", async () => {
    const typeRow = settings.locator("li.item", {
      has: page.locator('select[name="system.type"]'),
    });
    await expect(typeRow.locator(".setting-name")).toHaveText("Type");
    await expect(settings.locator('select[name="system.type"]')).toHaveValue(
      "cyberArm",
    );
    await expect(
      settings.locator('select[name="system.type"] option'),
    ).toHaveCount(9);
    const installRow = settings.locator("li.item", {
      has: page.locator('select[name="system.installLocation"]'),
    });
    await expect(installRow.locator(".setting-name")).toHaveText("Install");
    await expect(
      settings.locator('select[name="system.installLocation"]'),
    ).toHaveValue("mall");
    await expect(
      settings.locator('select[name="system.installLocation"] option'),
    ).toHaveCount(4);

    await expect(
      settings.locator('input[name="system.humanityLoss.static"]'),
    ).toHaveValue("3");
    const rolledRow = settings.locator("li.item", {
      has: page.locator('input[name="system.humanityLoss.roll"]'),
    });
    await expect(rolledRow.locator(".setting-name")).toHaveText(
      "Rolled Humanity Loss",
    );
    await expect(
      settings.locator('input[name="system.humanityLoss.roll"]'),
    ).toHaveValue("1d6");

    const foundationalRow = settings.locator("li.item", {
      has: page.locator('a.item-checkbox[data-target="system.isFoundational"]'),
    });
    await expect(foundationalRow).toHaveCount(1);
    await expect(foundationalRow.locator(".setting-name")).toHaveText(
      "Requires Foundational",
    );
    await expect(foundationalRow.locator("i.far.fa-circle")).toHaveCount(1);

    await expect(optionSlotsRow.locator(".setting-name")).toHaveText(
      "Has option slots",
    );
    await expect(optionSlotsRow.locator("i.far.fa-circle-check")).toHaveCount(
      1,
    );
    await expect(
      settings.locator('input[name="system.installedItems.slots"]'),
    ).toHaveValue("3");

    await expect(settings.locator('input[name="system.size"]')).toHaveCount(0);
    await expect(settings.locator('input[name="system.rof"]')).toHaveCount(0);
  });

  await test.step("fashionware and external cyberware hide the foundational block", async () => {
    for (const type of ["fashionware", "cyberwareExternal"]) {
      await setItemSelected(page, {
        sheetId,
        itemId,
        name: "system.type",
        value: type,
      });
      await expect(
        settings.locator(
          'a.item-checkbox[data-target="system.isFoundational"]',
        ),
      ).toHaveCount(0);
      await expect(
        settings.locator("li.item", { hasText: "Has option slots" }),
      ).toHaveCount(0);
      // Changing to these types forces isFoundational=false (CPRItem.update),
      // so the upgradable partial renders its generic "Slots" input in place
      // of the type-partial "Option slots" row.
      await page.waitForFunction(
        (id) =>
          foundry.utils.getProperty(
            game.items.get(id),
            "system.isFoundational",
          ) === false,
        itemId,
        { timeout: 10000 },
      );
      await expect(
        settings.locator("li.item", { hasText: /Option slots/ }),
      ).toHaveCount(0);
      const slotsInputRow = settings.locator("li.item", {
        has: page.locator('input[name="system.installedItems.slots"]'),
      });
      await expect(slotsInputRow).toHaveCount(1);
      await expect(slotsInputRow.locator(".setting-name")).toHaveText("Slots");
      await expect(slotsInputRow.locator("input")).toHaveValue("3");
      await expect(settings.locator('input[name="system.size"]')).toHaveCount(
        0,
      );
    }
  });

  await test.step("disabling option slots hides the slots input", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.type",
      value: "cyberArm",
    });
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isFoundational",
      expected: true,
    });
    await optionSlotsRow.locator("a.item-checkbox").click();
    await page.waitForFunction(
      (id) =>
        foundry.utils.getProperty(
          game.items.get(id),
          "system.installedItems.allowed",
        ) === false,
      itemId,
      { timeout: 10000 },
    );
    await expect(
      settings.locator('input[name="system.installedItems.slots"]'),
    ).toHaveCount(0);
    await optionSlotsRow.locator("a.item-checkbox").click();
    await page.waitForFunction(
      (id) =>
        foundry.utils.getProperty(
          game.items.get(id),
          "system.installedItems.allowed",
        ) === true,
      itemId,
      { timeout: 10000 },
    );
    await expect(
      settings.locator('input[name="system.installedItems.slots"]'),
    ).toHaveValue("3");
  });

  await test.step("a non-foundational implant shows the size input instead", async () => {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isFoundational",
      expected: false,
    });
    await expect(
      settings.locator("li.item", { hasText: "Has option slots" }),
    ).toHaveCount(0);
    await expect(
      settings.locator("li.item", { hasText: /Option slots/ }),
    ).toHaveCount(0);
    const slotsInputRow = settings.locator("li.item", {
      has: page.locator('input[name="system.installedItems.slots"]'),
    });
    await expect(slotsInputRow).toHaveCount(1);
    await expect(slotsInputRow.locator(".setting-name")).toHaveText("Slots");
    await expect(slotsInputRow.locator("input")).toHaveValue("3");
    const sizeRow = settings.locator("li.item", {
      has: page.locator('input[name="system.size"]'),
    });
    await expect(sizeRow.locator(".setting-name")).toHaveText(
      "Option Slots Usage (Size)",
    );
    await expect(settings.locator('input[name="system.size"]')).toHaveValue(
      "1",
    );

    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isFoundational",
      expected: true,
    });
    await expect(settings.locator('input[name="system.size"]')).toHaveCount(0);
    await expect(
      settings.locator('input[name="system.installedItems.slots"]'),
    ).toHaveValue("3");
  });
});

test("type, install location, and humanity loss persist across a hard reopen", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "cyberware",
    name: uniqueName("cyberware"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  let settings = await openItemSettings(page, sheetId);

  await test.step("setting the type-specific fields stores them", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.type",
      value: "cyberEye",
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.installLocation",
      value: "clinic",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.humanityLoss.static",
      path: "system.humanityLoss.static",
      value: 5,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.humanityLoss.roll",
      path: "system.humanityLoss.roll",
      value: "2d6",
    });
  });

  await test.step("all four values survive a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    settings = await openItemSettings(page, sheetId);
    await expect(settings.locator('select[name="system.type"]')).toHaveValue(
      "cyberEye",
    );
    await expect(
      settings.locator('select[name="system.installLocation"]'),
    ).toHaveValue("clinic");
    await expect(
      settings.locator('input[name="system.humanityLoss.static"]'),
    ).toHaveValue("5");
    await expect(
      settings.locator('input[name="system.humanityLoss.roll"]'),
    ).toHaveValue("2d6");
  });
});

test("the foundational checkbox renders inverted relative to the stored value", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "cyberware",
    name: uniqueName("cyberware"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const settings = await openItemSettings(page, sheetId);
  const row = settings.locator("li.item", {
    has: page.locator('a.item-checkbox[data-target="system.isFoundational"]'),
  });

  await expect(row.locator("i.far.fa-circle")).toHaveCount(1);
  await expect(row.locator("i.far.fa-circle-check")).toHaveCount(0);

  await toggleItemCheckbox(page, {
    sheetId,
    itemId,
    target: "system.isFoundational",
    expected: false,
  });
  await expect(row.locator("i.far.fa-circle")).toHaveCount(0);
  await expect(row.locator("i.far.fa-circle-check")).toHaveCount(1);

  await toggleItemCheckbox(page, {
    sheetId,
    itemId,
    target: "system.isFoundational",
    expected: true,
  });
  await expect(row.locator("i.far.fa-circle")).toHaveCount(1);
});

test("toggling Is a weapon shows the weapon rows without hands required", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "cyberware",
    name: uniqueName("cyberware"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  let settings = await openItemSettings(page, sheetId);

  await test.step("a new implant has no weapon rows", async () => {
    const weaponRow = settings.locator("li.item", {
      has: page.locator('a.item-checkbox[data-target="system.isWeapon"]'),
    });
    await expect(weaponRow).toHaveCount(1);
    await expect(weaponRow.locator(".setting-name")).toHaveText("Is a weapon");
    await expect(weaponRow.locator("i.far.fa-circle")).toHaveCount(1);
    for (const name of ["system.rof", "system.weaponType", "system.damage"]) {
      await expect(settings.locator(`[name="${name}"]`)).toHaveCount(0);
    }
  });

  await test.step("enabling it injects the attackable rows, minus hands required", async () => {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isWeapon",
      expected: true,
    });
    await expect(settings.locator('input[name="system.rof"]')).toHaveValue("1");
    await expect(
      settings.locator('select[name="system.weaponType"]'),
    ).toHaveCount(1);
    await expect(settings.locator('input[name="system.damage"]')).toHaveCount(
      1,
    );
    await expect(settings.locator('input[name="system.damage"]')).toHaveValue(
      "1d6",
    );
    await expect(settings.locator('input[name="system.handsReq"]')).toHaveCount(
      0,
    );
  });

  await test.step("the weapon flag and damage persist across a hard reopen", async () => {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.damage",
      path: "system.damage",
      value: "2d6",
    });
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    settings = await openItemSettings(page, sheetId);
    const weaponRow = settings.locator("li.item", {
      has: page.locator('a.item-checkbox[data-target="system.isWeapon"]'),
    });
    await expect(weaponRow.locator("i.far.fa-circle-check")).toHaveCount(1);
    await expect(settings.locator('input[name="system.rof"]')).toHaveValue("1");
    await expect(settings.locator('input[name="system.damage"]')).toHaveValue(
      "2d6",
    );
    await expect(settings.locator('input[name="system.handsReq"]')).toHaveCount(
      0,
    );
  });
});
