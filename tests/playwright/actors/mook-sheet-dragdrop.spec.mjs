import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeAndReopenActorSheet,
  closeDocSheet,
  createItemViaUI,
  dragItemToActorSheet,
  dragOwnedItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openSidebarTab,
  positionActorSheet,
  setItemField,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  createMookViaUI,
  ownedItemIdsByNames,
} from "./mook-sheet-helpers.mjs";

/*
 * Drag an item of each Fight-pane type from the Items directory onto a mook sheet.
 * For a mook the drop is also the UI creation path: it embeds the item and
 * auto-equips equippables (handleMookDraggedItem), so a weapon/armor lands equipped
 * and renders in the always-visible fight block. This batch only proves the create +
 * drag flow — that each item shows up on the sheet after dragging, proven on a fresh
 * render. The Fight pane's own behaviors (fire modes, ablation, rolls, ...) live in
 * mook-sheet-fight.spec.mjs.
 */

const FIGHT_ITEMS = [
  { type: "weapon", rowSelector: MOOK_FIELD.weaponRow },
  { type: "armor", rowSelector: MOOK_FIELD.armorRow },
];

installConsoleErrorHarness();

test.describe("Drag and Drop", () => {
  for (const { type, rowSelector } of FIGHT_ITEMS) {
    test(`dragging a ${type} onto a mook shows it in the fight pane`, async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);

      const itemName = uniqueName(type);
      const itemId = await createItemViaUI(game, { type, name: itemName });
      await closeDocSheet(game, { collection: "items", id: itemId });

      await test.step(`dragging the ${type} onto the mook embeds it`, async () => {
        await dragItemToActorSheet(game, { itemId, sheetId, actorId });
      });

      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      const embeddedId = ids[itemName];
      expect(
        embeddedId,
        `the ${type} should be embedded on the mook`,
      ).toBeTruthy();

      await test.step(`the ${type} renders in the fight pane on a fresh render`, async () => {
        sheetId = await closeAndReopenActorSheet(game, actorId);
        await expect(
          game.locator(
            `#${sheetId} ${rowSelector}[data-item-id="${embeddedId}"]`,
          ),
        ).toBeVisible();
      });
    });
  }
});

const SPARE_AMMO = 50;

async function toggleItemCheckbox(
  page,
  { sheetId, itemId, target, expected = true },
) {
  const sheet = await openItemSettings(page, sheetId);
  await sheet.locator(`a.item-checkbox[data-target="${target}"]`).click();
  await page.waitForFunction(
    ({ itemId, target, expected }) =>
      foundry.utils.getProperty(game.items.get(itemId), target) === expected,
    { itemId, target, expected },
    { timeout: 10000 },
  );
}

async function createLoadableWeapon(page, { name }) {
  const weaponType = "heavyPistol";
  const itemId = await createItemViaUI(page, { type: "weapon", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  const settings = await openItemSettings(page, sheetId);
  await settings
    .locator('select[name="system.weaponType"]')
    .selectOption(weaponType);
  await page.waitForFunction(
    ({ itemId, weaponType }) =>
      foundry.utils.getProperty(game.items.get(itemId), "system.weaponType") ===
      weaponType,
    { itemId, weaponType },
    { timeout: 10000 },
  );
  await toggleItemCheckbox(page, {
    sheetId,
    itemId,
    target: "system.isRanged",
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.magazine.max",
    path: "system.magazine.max",
    value: 8,
  });

  await (await openItemSettings(page, sheetId))
    .locator(".manage-installable-types")
    .click();
  const installableTypesDialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedTypes"]') });
  await installableTypesDialog
    .locator('input[name="selectedTypes"][value="ammo"]')
    .check();
  await installableTypesDialog
    .locator('input[name="selectedTypes"][value="itemUpgrade"]')
    .check();
  await installableTypesDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction((id) => {
    const allowed = game.items.get(id).system.installedItems.allowedTypes;
    return allowed.includes("ammo") && allowed.includes("itemUpgrade");
  }, itemId);

  await (await openItemSettings(page, sheetId))
    .locator(".select-compatible-ammo")
    .click();
  const compatibleAmmoDialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedAmmo"]') });
  await compatibleAmmoDialog
    .locator(`input[name="selectedAmmo"][value="${weaponType}"]`)
    .check();
  await compatibleAmmoDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    ({ id, weaponType }) =>
      game.items.get(id).system.ammoVariety.includes(weaponType),
    { id: itemId, weaponType },
  );

  await closeDocSheet(page, { collection: "items", id: itemId });
  return itemId;
}

async function installUpgradeOnMook(
  page,
  { sheetId, actorId, upgradeEmbeddedId, weaponName },
) {
  const installGlyph = page.locator(
    `#${sheetId} ${MOOK_FIELD.upgradeInstallAction}[data-item-id="${upgradeEmbeddedId}"]`,
  );
  await installGlyph.click();
  const dialog = page
    .locator(".cpr-dialog")
    .filter({ has: page.locator('input[name="selectedTarget"]') });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  const weaponRow = dialog
    .locator(".dialog-item")
    .filter({ hasText: weaponName });
  await expect(weaponRow).toBeVisible();
  await weaponRow.locator('input[name="selectedTarget"]').check();
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(dialog).toHaveCount(0, { timeout: 10000 });
  await page.waitForFunction(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId).system.isInstalled === true,
    { actorId, itemId: upgradeEmbeddedId },
    { timeout: 10000 },
  );
}

async function loadWeaponAmmo(page, { sheetId, weaponEmbeddedId }) {
  await page
    .locator(
      `#${sheetId} ${MOOK_FIELD.weaponRow}[data-item-id="${weaponEmbeddedId}"] [data-action="select-ammo"]`,
    )
    .click();
  const loadDialog = page
    .locator(".application")
    .filter({ has: page.locator('select[name="selectedAmmo"]') });
  await expect(loadDialog).toBeVisible({ timeout: 10000 });
  await loadDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(loadDialog).toHaveCount(0, { timeout: 10000 });
}

test.describe("Drag off / transfer", () => {
  test("dragging an equipped, loaded, upgraded weapon to another mook transfers it with its upgrade and keeps it loaded", async ({
    page: game,
  }) => {
    const source = await createMookViaUI(game);
    const target = await createMookViaUI(game);

    const weaponName = uniqueName("pistol");
    const upgradeName = uniqueName("upgrade");
    const spareAmmoName = uniqueName("spare-ammo");

    let sourceSheetId;
    let embedded;
    let preMagazine;

    await test.step("build an equipped, loaded, upgraded weapon plus a spare pile on the source mook", async () => {
      const weaponWorldId = await createLoadableWeapon(game, {
        name: weaponName,
      });
      const upgradeWorldId = await createItemViaUI(game, {
        type: "itemUpgrade",
        name: upgradeName,
      });

      const loadAmmoWorldId = await createItemViaUI(game, {
        type: "ammo",
        name: uniqueName("ammo"),
      });
      const loadAmmoSheetId = await expectSheetRendered(game, {
        collection: "items",
        id: loadAmmoWorldId,
      });
      await setItemField(game, {
        sheetId: loadAmmoSheetId,
        itemId: loadAmmoWorldId,
        name: "system.amount",
        path: "system.amount",
        value: 20,
      });
      await closeDocSheet(game, { collection: "items", id: loadAmmoWorldId });

      const spareWorldId = await createItemViaUI(game, {
        type: "ammo",
        name: spareAmmoName,
      });
      const spareSheetId = await expectSheetRendered(game, {
        collection: "items",
        id: spareWorldId,
      });
      await setItemField(game, {
        sheetId: spareSheetId,
        itemId: spareWorldId,
        name: "system.amount",
        path: "system.amount",
        value: SPARE_AMMO,
      });
      await closeDocSheet(game, { collection: "items", id: spareWorldId });

      for (const worldId of [
        weaponWorldId,
        upgradeWorldId,
        loadAmmoWorldId,
        spareWorldId,
      ]) {
        await dragItemToActorSheet(game, {
          itemId: worldId,
          sheetId: source.sheetId,
          actorId: source.actorId,
        });
      }

      const ids = await ownedItemIdsByNames(game, source.actorId, [
        weaponName,
        upgradeName,
      ]);
      embedded = { weaponId: ids[weaponName], upgradeId: ids[upgradeName] };
      expect(
        embedded.weaponId && embedded.upgradeId,
        "the weapon and upgrade should be embedded on the mook",
      ).toBeTruthy();

      sourceSheetId = await closeAndReopenActorSheet(game, source.actorId);
      await installUpgradeOnMook(game, {
        sheetId: sourceSheetId,
        actorId: source.actorId,
        upgradeEmbeddedId: embedded.upgradeId,
        weaponName,
      });
      await loadWeaponAmmo(game, {
        sheetId: sourceSheetId,
        weaponEmbeddedId: embedded.weaponId,
      });

      preMagazine = await game.evaluate(
        ({ actorId, itemId }) =>
          foundry.utils.getProperty(
            game.actors.get(actorId).items.get(itemId),
            "system.magazine.value",
          ),
        { actorId: source.actorId, itemId: embedded.weaponId },
      );
      expect(
        preMagazine,
        "the weapon should be loaded before the transfer",
      ).toBeGreaterThan(0);
    });

    const targetSheetId = await closeAndReopenActorSheet(game, target.actorId);
    sourceSheetId = await closeAndReopenActorSheet(game, source.actorId);
    const [sourceBox, targetBox] = await Promise.all([
      game.locator(`#${sourceSheetId}`).boundingBox(),
      game.locator(`#${targetSheetId}`).boundingBox(),
    ]);
    const viewportWidth = await game.evaluate(() => window.innerWidth);
    const sourceLeft = 8;
    const targetLeft = Math.min(
      sourceLeft + sourceBox.width + 8,
      viewportWidth - targetBox.width - 8,
    );
    await positionActorSheet(game, {
      actorId: source.actorId,
      left: sourceLeft,
      top: 8,
    });
    await positionActorSheet(game, {
      actorId: target.actorId,
      left: targetLeft,
      top: 8,
    });

    const weaponRow = game.locator(
      `#${sourceSheetId} ${MOOK_FIELD.weaponRow}[data-item-id="${embedded.weaponId}"]`,
    );
    await expect(weaponRow).toBeVisible();

    await test.step("drag the weapon from the source mook onto the target mook", async () => {
      await dragOwnedItemToActorSheet(game, {
        sourceActorId: source.actorId,
        sourceSheetId,
        itemId: embedded.weaponId,
        targetActorId: target.actorId,
        targetSheetId,
        sourceRowLocator: weaponRow,
        dropPosition: {
          x:
            (Math.max(targetLeft, sourceLeft + sourceBox.width) +
              (targetLeft + targetBox.width)) /
              2 -
            targetLeft,
          y: targetBox.height / 2,
        },
      });
    });

    await test.step("the weapon lands on the target still loaded, with its upgrade; the source keeps only its spare pile", async () => {
      const state = ({ sId, tId, weaponId, upgradeName, spareAmmoName }) =>
        game.evaluate(
          ({ sId, tId, weaponId, upgradeName, spareAmmoName }) => {
            const s = game.actors.get(sId);
            const t = game.actors.get(tId);
            const targetWeapon = t.items.get(weaponId);
            const list = targetWeapon?.system.installedItems.list ?? [];
            const targetUpgrade = t.items.find((i) => i.name === upgradeName);
            return {
              sourceHasWeapon: s.items.has(weaponId),
              targetHasWeapon: !!targetWeapon,
              targetMagazine: targetWeapon?.system.magazine.value ?? null,
              targetUpgradeInstalled:
                !!targetUpgrade && list.includes(targetUpgrade.id),
              sourceHasUpgrade: !!s.items.find((i) => i.name === upgradeName),
              sourceSpareAmount:
                s.items.find((i) => i.name === spareAmmoName)?.system.amount ??
                null,
            };
          },
          { sId, tId, weaponId, upgradeName, spareAmmoName },
        );
      await expect
        .poll(() =>
          state({
            sId: source.actorId,
            tId: target.actorId,
            weaponId: embedded.weaponId,
            upgradeName,
            spareAmmoName,
          }),
        )
        .toEqual({
          sourceHasWeapon: false,
          targetHasWeapon: true,
          targetMagazine: preMagazine,
          targetUpgradeInstalled: true,
          sourceHasUpgrade: false,
          sourceSpareAmount: SPARE_AMMO,
        });
    });
  });
});

test.describe("Cyberware drag failure", () => {
  test("dragging unsatisfiable cyberware onto a mook warns and removes it", async ({
    page: game,
  }) => {
    const { actorId } = await createMookViaUI(game);

    const itemName = uniqueName("cyberware");
    const itemId = await createItemViaUI(game, {
      type: "cyberware",
      name: itemName,
    });
    const itemSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: itemId,
    });

    await setItemSelected(game, {
      sheetId: itemSheetId,
      itemId,
      name: "system.type",
      value: "cyberEye",
    });
    await toggleItemCheckbox(game, {
      sheetId: itemSheetId,
      itemId,
      target: "system.isFoundational",
      expected: false,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    let sheetId = await closeAndReopenActorSheet(game, actorId);
    await test.step("dragging the cyberware warns and leaves no item or install dialog after reopening", async () => {
      await openSidebarTab(game, "items");
      const entry = game.locator(`#items [data-entry-id="${itemId}"]`);
      const mookSheet = game.locator(`#${sheetId}`);
      const warning = game.locator(".notification.warning").filter({
        hasText: "No Foundational Cyberware found for this type.",
      });
      await expect(entry).toBeVisible();
      await expect(mookSheet).toBeVisible();
      await expect(warning).toHaveCount(0);

      await Promise.all([
        expect(warning).toBeVisible(),
        entry.dragTo(mookSheet, { timeout: 5000 }),
      ]);

      await expect
        .poll(async () => {
          const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
          return ids[itemName];
        })
        .toBeFalsy();
      await expect(
        game.locator(".cpr-dialog").filter({
          has: game.locator('select[name="humanityLossType"]'),
        }),
      ).toHaveCount(0);

      sheetId = await closeAndReopenActorSheet(game, actorId);
      await expect(
        game
          .locator(`#${sheetId} ${MOOK_FIELD.cyberwareItem}`)
          .filter({ hasText: itemName }),
      ).toHaveCount(0);
      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      expect(ids[itemName]).toBeFalsy();
    });
  });
});
