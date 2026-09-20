import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  closeOwnedItemSheet,
  createDocumentViaUI,
  dragItemToActorSheet,
  dragOwnedItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
  openItemSettings,
  openOwnedItemSheet,
  positionActorSheet,
  reopenActorSheetViaUI,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

async function equipWeapon(page, { actorSheetId, actorId, itemId }) {
  for (const state of ["carried", "equipped"]) {
    const gear = await activateGearTab(page, actorSheetId);
    const row = await hoverGearRow(gear, itemId);
    await row.locator("a.equip").click();
    await page.waitForFunction(
      ({ actorId, itemId, state }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped === state,
      { actorId, itemId, state },
    );
  }
}

async function dragWorldItemAndGetId(page, { actorId, actorSheetId, itemId }) {
  const before = await page.evaluate(
    (id) => game.actors.get(id).items.map((item) => item.id),
    actorId,
  );
  await dragItemToActorSheet(page, {
    itemId,
    sheetId: actorSheetId,
    actorId,
  });
  return page.evaluate(
    ({ actorId, before }) =>
      game.actors.get(actorId).items.find((item) => !before.includes(item.id))
        .id,
    { actorId, before },
  );
}

async function loadWeapon(page, { actorId, actorSheetId, weaponId, ammoId }) {
  await equipWeapon(page, { actorSheetId, actorId, itemId: weaponId });
  const actorSheet = page.locator(`#${actorSheetId}`);
  await actorSheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
  await actorSheet
    .locator(
      `.bottom-content-section .item-action[data-item-id="${weaponId}"][data-action="select-ammo"]`,
    )
    .click();
  const loadDialog = page
    .locator(".application")
    .filter({ has: page.locator('select[name="selectedAmmo"]') });
  await expect(loadDialog.locator('select[name="selectedAmmo"]')).toHaveValue(
    ammoId,
  );
  await loadDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    ({ actorId, weaponId, ammoId }) => {
      const weapon = game.actors.get(actorId).items.get(weaponId);
      return (
        weapon.system.magazine.value === 30 &&
        weapon.system.installedItems.list.includes(ammoId)
      );
    },
    { actorId, weaponId, ammoId },
  );
}

async function placeSheetsSideBySide(
  page,
  { leftActorId, leftSheetId, rightActorId, rightSheetId },
) {
  const [leftBox, rightBox] = await Promise.all([
    page.locator(`#${leftSheetId}`).boundingBox(),
    page.locator(`#${rightSheetId}`).boundingBox(),
  ]);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const left = 8;
  const right = Math.min(
    left + leftBox.width + 8,
    viewportWidth - rightBox.width - 8,
  );
  await positionActorSheet(page, { actorId: leftActorId, left, top: 8 });
  await positionActorSheet(page, {
    actorId: rightActorId,
    left: right,
    top: 8,
  });
  return {
    dropPosition: {
      x:
        (Math.max(right, left + leftBox.width) + (right + rightBox.width)) / 2 -
        right,
      y: rightBox.height / 2,
    },
  };
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.setTimeout(180000);

test("transferring one loaded weapon preserves shared empty ammo used by the others (#1386)", async ({
  page: game,
}) => {
  const characterId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "character",
    name: uniqueName("shared-ammo-character"),
  });
  let characterSheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: characterId,
  });
  const containerId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "container",
    name: uniqueName("shared-ammo-container"),
  });
  await expectSheetRendered(game, {
    collection: "actors",
    id: containerId,
  });
  await closeDocSheet(game, { collection: "actors", id: containerId });
  let containerSheetId;

  const weaponName = uniqueName("shared-ammo-rifle");
  const worldWeaponId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "weapon",
    name: weaponName,
  });
  const weaponSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: worldWeaponId,
  });
  let weaponSheet = await openItemSettings(game, weaponSheetId);
  await weaponSheet
    .locator('select[name="system.weaponType"]')
    .selectOption("assaultRifle");
  await weaponSheet
    .locator('a.item-checkbox[data-target="system.isRanged"]')
    .click();
  await game.waitForFunction(
    (id) => game.items.get(id).system.isRanged === true,
    worldWeaponId,
  );
  await setItemField(game, {
    sheetId: weaponSheetId,
    itemId: worldWeaponId,
    name: "system.magazine.max",
    path: "system.magazine.max",
    value: 30,
  });
  weaponSheet = await openItemSettings(game, weaponSheetId);
  await weaponSheet.locator(".manage-installable-types").click();
  const installableDialog = game
    .locator(".application")
    .filter({ has: game.locator('input[name="selectedTypes"]') });
  await installableDialog
    .locator('input[name="selectedTypes"][value="ammo"]')
    .check();
  await installableDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await game.waitForFunction(
    (id) =>
      game.items.get(id).system.installedItems.allowedTypes.includes("ammo"),
    worldWeaponId,
  );
  weaponSheet = await openItemSettings(game, weaponSheetId);
  await weaponSheet.locator(".select-compatible-ammo").click();
  const compatibleDialog = game
    .locator(".application")
    .filter({ has: game.locator('input[name="selectedAmmo"]') });
  await compatibleDialog
    .locator('input[name="selectedAmmo"][value="rifle"]')
    .check();
  await compatibleDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await game.waitForFunction(
    (id) => game.items.get(id).system.ammoVariety.includes("rifle"),
    worldWeaponId,
  );
  await closeDocSheet(game, { collection: "items", id: worldWeaponId });

  const ammoName = uniqueName("shared-rifle-ammo");
  const worldAmmoId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "ammo",
    name: ammoName,
  });
  const ammoSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: worldAmmoId,
  });
  const ammoSheet = await openItemSettings(game, ammoSheetId);
  await ammoSheet
    .locator('select[name="system.variety"]')
    .selectOption("rifle");
  await game.waitForFunction(
    (id) => game.items.get(id).system.variety === "rifle",
    worldAmmoId,
  );
  await setItemField(game, {
    sheetId: ammoSheetId,
    itemId: worldAmmoId,
    name: "system.amount",
    path: "system.amount",
    value: 99,
  });
  await closeDocSheet(game, { collection: "items", id: worldAmmoId });

  const ammoId = await dragWorldItemAndGetId(game, {
    actorId: characterId,
    actorSheetId: characterSheetId,
    itemId: worldAmmoId,
  });
  const weaponIds = [];
  for (let index = 0; index < 3; index += 1) {
    weaponIds.push(
      await dragWorldItemAndGetId(game, {
        actorId: characterId,
        actorSheetId: characterSheetId,
        itemId: worldWeaponId,
      }),
    );
  }
  for (const weaponId of weaponIds) {
    await loadWeapon(game, {
      actorId: characterId,
      actorSheetId: characterSheetId,
      weaponId,
      ammoId,
    });
  }

  containerSheetId = await reopenActorSheetViaUI(game, containerId);
  let layout = await placeSheetsSideBySide(game, {
    leftActorId: characterId,
    leftSheetId: characterSheetId,
    rightActorId: containerId,
    rightSheetId: containerSheetId,
  });
  await dragOwnedItemToActorSheet(game, {
    sourceActorId: characterId,
    sourceSheetId: characterSheetId,
    itemId: weaponIds[0],
    targetActorId: containerId,
    targetSheetId: containerSheetId,
    requireUiDrag: true,
    dropPosition: layout.dropPosition,
  });

  await game.evaluate(
    ({ actorId, ammoId }) =>
      game.actors.get(actorId).items.get(ammoId).sheet.render(true),
    { actorId: characterId, ammoId },
  );
  const ownedAmmoSheetId = await openOwnedItemSheet(game, {
    actorId: characterId,
    itemId: ammoId,
  });
  const ownedAmmoSheet = await openItemSettings(game, ownedAmmoSheetId);
  const amountInput = ownedAmmoSheet.locator('input[name="system.amount"]');
  await amountInput.fill("0");
  await amountInput.blur();
  await expect
    .poll(() =>
      game.evaluate(
        ({ actorId, ammoId }) =>
          game.actors.get(actorId).items.get(ammoId).system.amount,
        { actorId: characterId, ammoId },
      ),
    )
    .toBe(0);
  await closeOwnedItemSheet(game, { actorId: characterId, itemId: ammoId });

  await dragOwnedItemToActorSheet(game, {
    sourceActorId: characterId,
    sourceSheetId: characterSheetId,
    itemId: weaponIds[1],
    targetActorId: containerId,
    targetSheetId: containerSheetId,
    requireUiDrag: true,
    dropPosition: layout.dropPosition,
  });

  let state = await game.evaluate(
    ({ characterId, containerId, ammoId, remainingWeaponId }) => {
      const character = game.actors.get(characterId);
      const container = game.actors.get(containerId);
      const sourceAmmo = character.items.get(ammoId);
      const remainingWeapon = character.items.get(remainingWeaponId);
      const targetWeapons = container.itemTypes.weapon;
      const targetAmmo = container.itemTypes.ammo[0];
      return {
        sourceAmmoAmount: sourceAmmo?.system.amount,
        sourceAmmoInstalledIn: sourceAmmo?.system.installedIn,
        remainingMagazine: remainingWeapon?.system.magazine.value,
        remainingReferences: remainingWeapon?.system.installedItems.list,
        targetWeaponIds: targetWeapons.map((weapon) => weapon.id),
        targetAmmoId: targetAmmo?.id,
        targetAmmoAmount: targetAmmo?.system.amount,
        targetReferences: targetWeapons.map(
          (weapon) => weapon.system.installedItems.list,
        ),
      };
    },
    {
      characterId,
      containerId,
      ammoId,
      remainingWeaponId: weaponIds[2],
    },
  );
  expect(state.sourceAmmoAmount, JSON.stringify(state)).toBe(0);
  expect(state.sourceAmmoInstalledIn, JSON.stringify(state)).toEqual([
    weaponIds[2],
  ]);
  expect(state.remainingMagazine, JSON.stringify(state)).toBe(30);
  expect(state.remainingReferences, JSON.stringify(state)).toEqual([ammoId]);
  expect(state.targetAmmoAmount, JSON.stringify(state)).toBe(0);
  expect(state.targetWeaponIds, JSON.stringify(state)).toHaveLength(2);
  expect(state.targetReferences, JSON.stringify(state)).toEqual([
    [state.targetAmmoId],
    [state.targetAmmoId],
  ]);

  await closeDocSheet(game, { collection: "actors", id: characterId });
  await closeDocSheet(game, { collection: "actors", id: containerId });
  characterSheetId = await reopenActorSheetViaUI(game, characterId);
  containerSheetId = await reopenActorSheetViaUI(game, containerId);
  layout = await placeSheetsSideBySide(game, {
    leftActorId: containerId,
    leftSheetId: containerSheetId,
    rightActorId: characterId,
    rightSheetId: characterSheetId,
  });
  const sourceRow = game
    .locator(
      `#${containerSheetId} li.item[data-item-id="${state.targetWeaponIds[0]}"]`,
    )
    .first();
  await dragOwnedItemToActorSheet(game, {
    sourceActorId: containerId,
    sourceSheetId: containerSheetId,
    itemId: state.targetWeaponIds[0],
    targetActorId: characterId,
    targetSheetId: characterSheetId,
    dropPosition: layout.dropPosition,
    requireUiDrag: true,
    sourceRowLocator: sourceRow,
  });

  const targetAmmoId = state.targetAmmoId;
  const remainingContainerWeaponId = state.targetWeaponIds[1];
  state = await game.evaluate(
    ({ containerId, targetAmmoId, remainingContainerWeaponId }) => {
      const container = game.actors.get(containerId);
      const ammo = container.items.get(targetAmmoId);
      const weapon = container.items.get(remainingContainerWeaponId);
      return {
        ammoAmount: ammo?.system.amount,
        ammoInstalledIn: ammo?.system.installedIn,
        magazine: weapon?.system.magazine.value,
        weaponReferences: weapon?.system.installedItems.list,
      };
    },
    {
      containerId,
      targetAmmoId,
      remainingContainerWeaponId,
    },
  );
  expect(state.ammoAmount, JSON.stringify(state)).toBe(0);
  expect(state.ammoInstalledIn, JSON.stringify(state)).toEqual([
    remainingContainerWeaponId,
  ]);
  expect(state.magazine, JSON.stringify(state)).toBe(30);
  expect(state.weaponReferences, JSON.stringify(state)).toEqual([targetAmmoId]);

  await closeDocSheet(game, { collection: "actors", id: characterId });
  await closeDocSheet(game, { collection: "actors", id: containerId });
});
