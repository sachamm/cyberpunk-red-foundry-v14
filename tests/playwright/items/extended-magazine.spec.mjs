import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createDocumentViaUI,
  dragItemToActorSheet,
  equipWeapon,
  expectSheetRendered,
  installUpgrade,
  openItemSettings,
  setItemField,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("keeps upgraded magazine capacity after firing and unloads the remaining ammo (#1302)", async ({
  page: game,
}) => {
  const actorId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "character",
    name: uniqueName("char"),
  });
  const actorSheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  const weaponName = uniqueName("pistol");
  const weaponId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "weapon",
    name: weaponName,
  });
  const weaponSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: weaponId,
  });
  const weaponSheet = await openItemSettings(game, weaponSheetId);
  await weaponSheet
    .locator('select[name="system.weaponType"]')
    .selectOption("heavyPistol");
  await toggleItemCheckbox(game, {
    sheetId: weaponSheetId,
    itemId: weaponId,
    target: "system.isRanged",
    expected: true,
  });
  await setItemField(game, {
    sheetId: weaponSheetId,
    itemId: weaponId,
    name: "system.magazine.max",
    path: "system.magazine.max",
    value: 8,
  });
  await (await openItemSettings(game, weaponSheetId))
    .locator(".manage-installable-types")
    .click();
  const installableTypesDialog = game
    .locator(".application")
    .filter({ has: game.locator('input[name="selectedTypes"]') });
  await installableTypesDialog
    .locator('input[name="selectedTypes"][value="ammo"]')
    .check();
  await installableTypesDialog
    .locator('input[name="selectedTypes"][value="itemUpgrade"]')
    .check();
  await installableTypesDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await game.waitForFunction((id) => {
    const allowedTypes = game.items.get(id).system.installedItems.allowedTypes;
    return (
      allowedTypes.includes("ammo") && allowedTypes.includes("itemUpgrade")
    );
  }, weaponId);

  await (await openItemSettings(game, weaponSheetId))
    .locator(".select-compatible-ammo")
    .click();
  const compatibleAmmoDialog = game
    .locator(".application")
    .filter({ has: game.locator('input[name="selectedAmmo"]') });
  await compatibleAmmoDialog
    .locator('input[name="selectedAmmo"][value="heavyPistol"]')
    .check();
  await compatibleAmmoDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await game.waitForFunction(
    (id) => game.items.get(id).system.ammoVariety.includes("heavyPistol"),
    weaponId,
  );
  await closeDocSheet(game, { collection: "items", id: weaponId });

  const ammoName = uniqueName("ammo");
  const ammoId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "ammo",
    name: ammoName,
  });
  const ammoSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: ammoId,
  });
  await setItemField(game, {
    sheetId: ammoSheetId,
    itemId: ammoId,
    name: "system.amount",
    path: "system.amount",
    value: 20,
  });
  await closeDocSheet(game, { collection: "items", id: ammoId });

  const upgradeName = uniqueName("extended-magazine");
  const upgradeId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "itemUpgrade",
    name: upgradeName,
  });
  const upgradeSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: upgradeId,
  });
  const upgradeSheet = await openItemSettings(game, upgradeSheetId);
  await upgradeSheet
    .locator('select[name="system.modifiers.magazine.type"]')
    .selectOption("override");
  await setItemField(game, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.modifiers.magazine.value",
    path: "system.modifiers.magazine.value",
    value: 12,
  });
  await closeDocSheet(game, { collection: "items", id: upgradeId });

  for (const itemId of [weaponId, ammoId, upgradeId]) {
    await dragItemToActorSheet(game, {
      itemId,
      sheetId: actorSheetId,
      actorId,
    });
  }

  const embeddedIds = await game.evaluate(
    ({ actorId, weaponName, ammoName, upgradeName }) => {
      const actor = game.actors.get(actorId);
      return {
        weaponId: actor.items.find((item) => item.name === weaponName).id,
        ammoId: actor.items.find((item) => item.name === ammoName).id,
        upgradeId: actor.items.find((item) => item.name === upgradeName).id,
      };
    },
    { actorId, weaponName, ammoName, upgradeName },
  );

  await equipWeapon(game, {
    actorSheetId,
    actorId,
    itemId: embeddedIds.weaponId,
  });
  await installUpgrade(game, {
    actorSheetId,
    actorId,
    upgradeId: embeddedIds.upgradeId,
    targetId: embeddedIds.weaponId,
  });

  const actorSheet = game.locator(`#${actorSheetId}`);
  await actorSheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
  await actorSheet
    .locator(
      `.bottom-content-section .item-action[data-item-id="${embeddedIds.weaponId}"][data-action="select-ammo"]`,
    )
    .click();
  const loadDialog = game
    .locator(".application")
    .filter({ has: game.locator('select[name="selectedAmmo"]') });
  await expect(loadDialog.locator('select[name="selectedAmmo"]')).toHaveValue(
    embeddedIds.ammoId,
  );
  await loadDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(loadDialog).toHaveCount(0);
  await game.waitForFunction(
    ({ actorId, weaponId }) =>
      game.actors.get(actorId).items.get(weaponId).system.magazine.value === 12,
    { actorId, weaponId: embeddedIds.weaponId },
    { timeout: 10000 },
  );

  await actorSheet
    .locator(
      `a.rollable[data-roll-type="attack"][data-item-id="${embeddedIds.weaponId}"]`,
    )
    .click();
  const rollDialog = game
    .locator(".application")
    .filter({ has: game.locator(".total-mods") });
  await rollDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await game.waitForFunction(
    ({ actorId, weaponId }) =>
      game.actors.get(actorId).items.get(weaponId).system.magazine.value === 11,
    { actorId, weaponId: embeddedIds.weaponId },
  );

  await actorSheet
    .locator(
      `.bottom-content-section .item-action[data-item-id="${embeddedIds.weaponId}"][data-action="select-ammo"]`,
    )
    .click();
  const unloadDialog = game
    .locator(".application")
    .filter({ has: game.locator('select[name="selectedAmmo"]') });
  await expect(async () => {
    await unloadDialog.locator('select[name="selectedAmmo"]').selectOption("");
    await unloadDialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(unloadDialog).toHaveCount(0, { timeout: 2000 });
  }).toPass({ timeout: 20000 });

  await expect
    .poll(() =>
      game.evaluate(
        ({ actorId, weaponId, ammoId }) => {
          const actor = game.actors.get(actorId);
          return {
            loaded: actor.items.get(weaponId).system.hasAmmoLoaded,
            magazine: actor.items.get(weaponId).system.magazine.value,
            ammo: actor.items.get(ammoId).system.amount,
          };
        },
        {
          actorId,
          weaponId: embeddedIds.weaponId,
          ammoId: embeddedIds.ammoId,
        },
      ),
    )
    .toEqual({ loaded: false, magazine: 0, ammo: 19 });
});
