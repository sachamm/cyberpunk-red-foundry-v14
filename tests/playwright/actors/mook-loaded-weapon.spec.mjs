import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  createDocumentViaUI,
  dragItemToActorSheet,
  dragOwnedItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
  openItemSettings,
  positionActorSheet,
  reopenActorSheetViaUI,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

const INVENTORY_ACTOR_TYPES = ["character", "mook", "container"];
const MAGAZINE_SIZE = 30;
const STARTING_AMMO = 40;
const REMAINING_AMMO = STARTING_AMMO - MAGAZINE_SIZE;

const originalRegression = {
  sourceType: "character",
  targetType: "mook",
};
const transferCases = [
  originalRegression,
  ...INVENTORY_ACTOR_TYPES.flatMap((sourceType) =>
    INVENTORY_ACTOR_TYPES.map((targetType) => ({ sourceType, targetType })),
  ).filter(
    ({ sourceType, targetType }) =>
      sourceType !== originalRegression.sourceType ||
      targetType !== originalRegression.targetType,
  ),
];

async function createInventoryActor(page, type, label) {
  const actorId = await createDocumentViaUI(page, {
    documentTab: "actors",
    type,
    name: uniqueName(label),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });
  return { actorId, sheetId, type };
}

async function equipWeapon(page, { actorSheetId, actorId, itemId }) {
  for (const state of ["carried", "equipped"]) {
    const gear = await activateGearTab(page, actorSheetId);
    const row = await hoverGearRow(gear, itemId);
    await row.locator("a.equip").click();
    await page.waitForFunction(
      ({ actorId, itemId, state }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped === state,
      { actorId, itemId, state },
      { timeout: 10000 },
    );
  }
}

async function createLoadableWorldItems(page) {
  const weaponName = uniqueName("loaded-rifle");
  const weaponId = await createDocumentViaUI(page, {
    documentTab: "items",
    type: "weapon",
    name: weaponName,
  });
  const weaponSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: weaponId,
  });

  let weaponSheet = await openItemSettings(page, weaponSheetId);
  await weaponSheet
    .locator('select[name="system.weaponType"]')
    .selectOption("assaultRifle");
  await weaponSheet
    .locator('a.item-checkbox[data-target="system.isRanged"]')
    .click();
  await page.waitForFunction(
    (id) => game.items.get(id).system.isRanged === true,
    weaponId,
  );
  await setItemField(page, {
    sheetId: weaponSheetId,
    itemId: weaponId,
    name: "system.magazine.max",
    path: "system.magazine.max",
    value: MAGAZINE_SIZE,
  });

  weaponSheet = await openItemSettings(page, weaponSheetId);
  await weaponSheet.locator(".manage-installable-types").click();
  const installableTypesDialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedTypes"]') });
  await installableTypesDialog
    .locator('input[name="selectedTypes"][value="ammo"]')
    .check();
  await installableTypesDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    (id) =>
      game.items.get(id).system.installedItems.allowedTypes.includes("ammo"),
    weaponId,
  );

  weaponSheet = await openItemSettings(page, weaponSheetId);
  await weaponSheet.locator(".select-compatible-ammo").click();
  const compatibleAmmoDialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedAmmo"]') });
  await compatibleAmmoDialog
    .locator('input[name="selectedAmmo"][value="rifle"]')
    .check();
  await compatibleAmmoDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    (id) => game.items.get(id).system.ammoVariety.includes("rifle"),
    weaponId,
  );
  await closeDocSheet(page, { collection: "items", id: weaponId });

  const ammoName = uniqueName("rifle-ammo");
  const ammoId = await createDocumentViaUI(page, {
    documentTab: "items",
    type: "ammo",
    name: ammoName,
  });
  const ammoSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: ammoId,
  });
  const ammoSheet = await openItemSettings(page, ammoSheetId);
  await ammoSheet
    .locator('select[name="system.variety"]')
    .selectOption("rifle");
  await page.waitForFunction(
    (id) => game.items.get(id).system.variety === "rifle",
    ammoId,
  );
  await setItemField(page, {
    sheetId: ammoSheetId,
    itemId: ammoId,
    name: "system.amount",
    path: "system.amount",
    value: STARTING_AMMO,
  });
  await closeDocSheet(page, { collection: "items", id: ammoId });

  return { weaponId, weaponName, ammoId, ammoName };
}

async function findOwnedWeaponAndAmmo(page, { actorId, weaponName, ammoName }) {
  return page.evaluate(
    ({ actorId, weaponName, ammoName }) => {
      const actor = game.actors.get(actorId);
      return {
        weaponId: actor.items.find(
          (item) => item.type === "weapon" && item.name === weaponName,
        )?.id,
        ammoId: actor.items.find(
          (item) => item.type === "ammo" && item.name === ammoName,
        )?.id,
      };
    },
    { actorId, weaponName, ammoName },
  );
}

async function loadWeaponOnCharacter(
  page,
  { actorId, actorSheetId, worldItems },
) {
  for (const itemId of [worldItems.weaponId, worldItems.ammoId]) {
    await dragItemToActorSheet(page, {
      itemId,
      sheetId: actorSheetId,
      actorId,
    });
  }

  const embedded = await findOwnedWeaponAndAmmo(page, {
    actorId,
    weaponName: worldItems.weaponName,
    ammoName: worldItems.ammoName,
  });
  expect(embedded.weaponId, "the character should own the weapon").toBeTruthy();
  expect(embedded.ammoId, "the character should own the ammo").toBeTruthy();

  await equipWeapon(page, {
    actorSheetId,
    actorId,
    itemId: embedded.weaponId,
  });
  const characterSheet = page.locator(`#${actorSheetId}`);
  await characterSheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
  await characterSheet
    .locator(
      `.bottom-content-section .item-action[data-item-id="${embedded.weaponId}"][data-action="select-ammo"]`,
    )
    .click();
  const loadDialog = page
    .locator(".application")
    .filter({ has: page.locator('select[name="selectedAmmo"]') });
  await expect(loadDialog.locator('select[name="selectedAmmo"]')).toHaveValue(
    embedded.ammoId,
  );
  await loadDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction(
    ({ actorId, weaponId, ammoId, magazineSize, remainingAmmo }) => {
      const weapon = game.actors.get(actorId).items.get(weaponId);
      const ammo = game.actors.get(actorId).items.get(ammoId);
      return (
        weapon.system.magazine.value === magazineSize &&
        weapon.system.installedItems.list.length === 1 &&
        weapon.system.installedItems.list[0] === ammoId &&
        ammo.system.amount === remainingAmmo
      );
    },
    {
      actorId,
      weaponId: embedded.weaponId,
      ammoId: embedded.ammoId,
      magazineSize: MAGAZINE_SIZE,
      remainingAmmo: REMAINING_AMMO,
    },
    { timeout: 10000 },
  );

  return embedded;
}

async function placeSheetsSideBySide(
  page,
  { sourceActorId, sourceSheetId, targetActorId, targetSheetId },
) {
  const [sourceBox, targetBox] = await Promise.all([
    page.locator(`#${sourceSheetId}`).boundingBox(),
    page.locator(`#${targetSheetId}`).boundingBox(),
  ]);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const sourceLeft = 8;
  const targetLeft = Math.min(
    sourceLeft + sourceBox.width + 8,
    viewportWidth - targetBox.width - 8,
  );
  await positionActorSheet(page, {
    actorId: sourceActorId,
    left: sourceLeft,
    top: 8,
  });
  await positionActorSheet(page, {
    actorId: targetActorId,
    left: targetLeft,
    top: 8,
  });

  return {
    x:
      (Math.max(targetLeft, sourceLeft + sourceBox.width) +
        (targetLeft + targetBox.width)) /
        2 -
      targetLeft,
    y: targetBox.height / 2,
  };
}

function sourceWeaponRow(page, { sourceType, sourceSheetId, weaponId }) {
  if (sourceType === "mook") {
    return page.locator(
      `#${sourceSheetId} .mook-weapon-list .item.weapon-grid[data-item-id="${weaponId}"]`,
    );
  }
  if (sourceType === "container") {
    return page
      .locator(`#${sourceSheetId} li.item[data-item-id="${weaponId}"]`)
      .first();
  }
  if (sourceType === "character") return null;
  throw new Error(`No weapon row configured for actor type ${sourceType}`);
}

async function dragLoadedWeapon(
  page,
  { source, target, weaponId, dropPosition },
) {
  const row = sourceWeaponRow(page, {
    sourceType: source.type,
    sourceSheetId: source.sheetId,
    weaponId,
  });
  if (row) await expect(row).toBeVisible();

  await dragOwnedItemToActorSheet(page, {
    sourceActorId: source.actorId,
    sourceSheetId: source.sheetId,
    itemId: weaponId,
    targetActorId: target.actorId,
    targetSheetId: target.sheetId,
    requireUiDrag: true,
    dropPosition,
    sourceRowLocator: row,
  });
}

async function readTransferState(
  page,
  { sourceActorId, targetActorId, weaponName, ammoName },
) {
  return page.evaluate(
    ({ sourceActorId, targetActorId, weaponName, ammoName }) => {
      const source = game.actors.get(sourceActorId);
      const target = game.actors.get(targetActorId);
      const sourceWeapons = source.items.filter(
        (item) => item.type === "weapon" && item.name === weaponName,
      );
      const sourceAmmo = source.items.filter(
        (item) => item.type === "ammo" && item.name === ammoName,
      );
      const targetWeapons = target.items.filter(
        (item) => item.type === "weapon" && item.name === weaponName,
      );
      const targetAmmo = target.items.filter(
        (item) => item.type === "ammo" && item.name === ammoName,
      );
      const weapon = targetWeapons[0];
      const ammo = targetAmmo[0];
      return {
        sourceWeaponCount: sourceWeapons.length,
        sourceAmmoCount: sourceAmmo.length,
        sourceAmmoAmounts: sourceAmmo.map((item) => item.system.amount),
        sourceZeroAmmoCount: sourceAmmo.filter(
          (item) => item.system.amount === 0,
        ).length,
        targetWeaponCount: targetWeapons.length,
        targetAmmoCount: targetAmmo.length,
        targetWeaponId: weapon?.id,
        targetAmmoId: ammo?.id,
        targetAmmoAmount: ammo?.system.amount,
        targetWeaponEquipped: weapon?.system.equipped,
        targetMagazineValue: weapon?.system.magazine.value,
        targetInstalledIds: weapon?.system.installedItems.list ?? [],
      };
    },
    { sourceActorId, targetActorId, weaponName, ammoName },
  );
}

async function expectTransferredWeapon(
  page,
  { source, target, sourceAmmoId, worldItems },
) {
  const stateArgs = {
    sourceActorId: source.actorId,
    targetActorId: target.actorId,
    weaponName: worldItems.weaponName,
    ammoName: worldItems.ammoName,
  };
  await expect
    .poll(async () => {
      const state = await readTransferState(page, stateArgs);
      return (
        state.sourceWeaponCount === 0 &&
        state.targetWeaponCount === 1 &&
        state.targetAmmoCount === 1 &&
        state.targetMagazineValue === MAGAZINE_SIZE &&
        state.targetInstalledIds.length === 1
      );
    })
    .toBe(true);

  const state = await readTransferState(page, stateArgs);
  expect(state.sourceWeaponCount, JSON.stringify(state)).toBe(0);
  expect(state.sourceZeroAmmoCount, JSON.stringify(state)).toBe(0);
  if (source.type === "character") {
    expect(state.sourceAmmoCount, JSON.stringify(state)).toBe(1);
    expect(state.sourceAmmoAmounts, JSON.stringify(state)).toEqual([
      REMAINING_AMMO,
    ]);
  } else {
    expect(state.sourceAmmoCount, JSON.stringify(state)).toBe(0);
    expect(state.sourceAmmoAmounts, JSON.stringify(state)).toEqual([]);
  }
  expect(state.targetWeaponCount, JSON.stringify(state)).toBe(1);
  expect(state.targetAmmoCount, JSON.stringify(state)).toBe(1);
  expect(state.targetAmmoAmount, JSON.stringify(state)).toBe(0);
  expect(state.targetWeaponEquipped, JSON.stringify(state)).toBe("equipped");
  expect(state.targetMagazineValue, JSON.stringify(state)).toBe(MAGAZINE_SIZE);
  expect(state.targetAmmoId, JSON.stringify(state)).not.toBe(sourceAmmoId);
  expect(state.targetInstalledIds, JSON.stringify(state)).toEqual([
    state.targetAmmoId,
  ]);
  return state;
}

async function expectTransferredWeaponRendered(page, { target, weaponId }) {
  await closeDocSheet(page, { collection: "actors", id: target.actorId });
  const sheetId = await reopenActorSheetViaUI(page, target.actorId);

  if (target.type === "character") {
    const gear = await activateGearTab(page, sheetId);
    await expect(await hoverGearRow(gear, weaponId)).toBeVisible();
  } else if (target.type === "mook") {
    await expect(
      page.locator(
        `#${sheetId} .mook-weapon-list .item.weapon-grid[data-item-id="${weaponId}"]`,
      ),
    ).toBeVisible();
  } else if (target.type === "container") {
    await expect(
      page.locator(`#${sheetId} li.item[data-item-id="${weaponId}"]`).first(),
    ).toBeVisible();
  } else {
    throw new Error(`No weapon row configured for actor type ${target.type}`);
  }
}

test.beforeEach(async ({ page }) => {
  page.consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") page.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    page.consoleErrors.push(`uncaught exception: ${error.message}`);
  });
  await gotoReadyWorld(page);
});

test.afterEach(async ({ page }) => {
  expect(
    page.consoleErrors,
    `console errors during test:\n${page.consoleErrors.join("\n")}`,
  ).toEqual([]);
});

test.describe("Loaded weapon transfers between inventory actors", () => {
  test.setTimeout(180000);

  for (const { sourceType, targetType } of transferCases) {
    test(`loaded weapon transfers from ${sourceType} to ${targetType}`, async ({
      page: game,
    }) => {
      const source = await createInventoryActor(
        game,
        sourceType,
        `${sourceType}-source`,
      );
      const target = await createInventoryActor(
        game,
        targetType,
        `${targetType}-target`,
      );
      await closeDocSheet(game, {
        collection: "actors",
        id: target.actorId,
      });

      let loader = source;
      if (sourceType !== "character") {
        await closeDocSheet(game, {
          collection: "actors",
          id: source.actorId,
        });
        loader = await createInventoryActor(
          game,
          "character",
          `${sourceType}-loader`,
        );
      }

      const worldItems = await createLoadableWorldItems(game);
      const initiallyLoaded = await loadWeaponOnCharacter(game, {
        actorId: loader.actorId,
        actorSheetId: loader.sheetId,
        worldItems,
      });

      if (sourceType !== "character") {
        await closeDocSheet(game, {
          collection: "actors",
          id: loader.actorId,
        });
        source.sheetId = await reopenActorSheetViaUI(game, source.actorId);
        loader.sheetId = await reopenActorSheetViaUI(game, loader.actorId);
        const seedDropPosition = await placeSheetsSideBySide(game, {
          sourceActorId: loader.actorId,
          sourceSheetId: loader.sheetId,
          targetActorId: source.actorId,
          targetSheetId: source.sheetId,
        });
        await test.step(`prepare the loaded ${sourceType} source`, async () => {
          await dragLoadedWeapon(game, {
            source: loader,
            target: source,
            weaponId: initiallyLoaded.weaponId,
            dropPosition: seedDropPosition,
          });
        });
        await closeDocSheet(game, {
          collection: "actors",
          id: loader.actorId,
        });
      }

      await closeDocSheet(game, {
        collection: "actors",
        id: source.actorId,
      });
      target.sheetId = await reopenActorSheetViaUI(game, target.actorId);
      source.sheetId = await reopenActorSheetViaUI(game, source.actorId);
      const sourceItems = await findOwnedWeaponAndAmmo(game, {
        actorId: source.actorId,
        weaponName: worldItems.weaponName,
        ammoName: worldItems.ammoName,
      });
      expect(
        sourceItems.weaponId,
        "the source should own the weapon",
      ).toBeTruthy();
      expect(sourceItems.ammoId, "the source should own the ammo").toBeTruthy();

      const dropPosition = await placeSheetsSideBySide(game, {
        sourceActorId: source.actorId,
        sourceSheetId: source.sheetId,
        targetActorId: target.actorId,
        targetSheetId: target.sheetId,
      });

      await test.step(`drag the loaded weapon from ${sourceType} to ${targetType}`, async () => {
        await dragLoadedWeapon(game, {
          source,
          target,
          weaponId: sourceItems.weaponId,
          dropPosition,
        });
      });

      let transferred;
      await test.step("the target receives one loaded weapon with remapped ammo", async () => {
        transferred = await expectTransferredWeapon(game, {
          source,
          target,
          sourceAmmoId: sourceItems.ammoId,
          worldItems,
        });
      });

      await test.step("the transferred weapon renders after reopening the target", async () => {
        await expectTransferredWeaponRendered(game, {
          target,
          weaponId: transferred.targetWeaponId,
        });
      });
    });
  }
});
