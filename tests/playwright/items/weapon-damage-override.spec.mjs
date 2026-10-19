import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  createDocumentViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
  installUpgrade,
  setItemField,
  setItemSelected,
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
      { timeout: 10000 },
    );
  }
}

async function readTotalModsTooltip(dialog) {
  const totalMods = dialog.locator(".total-mods .dialog-item-input");
  await expect(totalMods).toBeVisible();
  return totalMods.getAttribute("data-tooltip");
}

function expectModEntry(tooltip, source, value) {
  const entry = (tooltip ?? "").split("<br/>").find((e) => e.includes(source));
  expect(
    entry,
    `no mod entry for "${source}" in tooltip: ${tooltip}`,
  ).toBeTruthy();
  expect(entry, `mod entry for "${source}": ${entry}`).toContain(value);
}

async function readDamageFormula(dialog) {
  const header = dialog.locator(
    ".dialog-header .text-center:has(span.text-semi)",
  );
  await expect(header).toBeVisible();
  return (await header.textContent()).replace(/\s+/g, " ").trim();
}

async function createCharacterAndWeapon(game, { weaponName, damage }) {
  const actorId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "character",
    name: uniqueName("char"),
  });
  const actorSheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  const weaponId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "weapon",
    name: weaponName,
  });
  const weaponSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: weaponId,
  });
  await setItemSelected(game, {
    sheetId: weaponSheetId,
    itemId: weaponId,
    name: "system.weaponType",
    value: "lightMelee",
  });
  await setItemField(game, {
    sheetId: weaponSheetId,
    itemId: weaponId,
    name: "system.damage",
    path: "system.damage",
    value: damage,
  });
  await closeDocSheet(game, { collection: "items", id: weaponId });

  return { actorId, actorSheetId, weaponName, weaponId };
}

async function createDamageUpgrade(game, { upgradeName, modType, value }) {
  const upgradeId = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "itemUpgrade",
    name: upgradeName,
  });
  const upgradeSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: upgradeId,
  });
  expect(
    await game.evaluate((id) => game.items.get(id).system.type, upgradeId),
  ).toBe("weapon");
  await setItemSelected(game, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.modifiers.damage.type",
    value: modType,
  });
  await setItemField(game, {
    sheetId: upgradeSheetId,
    itemId: upgradeId,
    name: "system.modifiers.damage.value",
    path: "system.modifiers.damage.value",
    value,
  });
  await closeDocSheet(game, { collection: "items", id: upgradeId });
  return upgradeId;
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Weapon damage override upgrades (#1347)", () => {
  test("replaces the base damage formula with the override value", async ({
    page: game,
  }) => {
    const { actorId, actorSheetId, weaponName, weaponId } =
      await createCharacterAndWeapon(game, {
        weaponName: uniqueName("pistol"),
        damage: "2d6",
      });
    const upgradeName = uniqueName("barrel");
    const upgradeId = await createDamageUpgrade(game, {
      upgradeName,
      modType: "override",
      value: 12,
    });

    await dragItemToActorSheet(game, {
      itemId: weaponId,
      sheetId: actorSheetId,
      actorId,
    });
    await dragItemToActorSheet(game, {
      itemId: upgradeId,
      sheetId: actorSheetId,
      actorId,
    });
    const embeddedWeaponId = await game.evaluate(
      ({ actorId, weaponName }) =>
        game.actors.get(actorId).items.find((i) => i.name === weaponName).id,
      { actorId, weaponName },
    );
    const embeddedUpgradeId = await game.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName).id,
      { actorId, upgradeName },
    );
    await equipWeapon(game, {
      actorSheetId,
      actorId,
      itemId: embeddedWeaponId,
    });
    await installUpgrade(game, {
      actorSheetId,
      actorId,
      upgradeId: embeddedUpgradeId,
      targetId: embeddedWeaponId,
    });

    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageRoll = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(damageRoll).toBeVisible();
    await damageRoll.click();

    const dialog = game
      .locator(".application")
      .filter({ has: game.locator(".total-mods") });
    await expect(dialog).toBeVisible();
    const formula = await readDamageFormula(dialog);
    expect(formula, `damage formula: ${formula}`).toMatch(/:\s*12$/);
    const tooltip = await readTotalModsTooltip(dialog);
    expect(
      (tooltip ?? "").split("<br/>").find((e) => e.includes(upgradeName)),
      `override must not appear as a mod: ${tooltip}`,
    ).toBeUndefined();

    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("uses the largest override when an override and a modifier are installed", async ({
    page: game,
  }) => {
    const { actorId, actorSheetId, weaponName, weaponId } =
      await createCharacterAndWeapon(game, {
        weaponName: uniqueName("smg"),
        damage: "2d6",
      });
    const overrideName = uniqueName("heavyBarrel");
    const modifierName = uniqueName("damagingRounds");
    const overrideId = await createDamageUpgrade(game, {
      upgradeName: overrideName,
      modType: "override",
      value: 9,
    });
    const modifierId = await createDamageUpgrade(game, {
      upgradeName: modifierName,
      modType: "modifier",
      value: 2,
    });

    for (const itemId of [weaponId, overrideId, modifierId]) {
      await dragItemToActorSheet(game, {
        itemId,
        sheetId: actorSheetId,
        actorId,
      });
    }
    const embeddedWeaponId = await game.evaluate(
      ({ actorId, weaponName }) =>
        game.actors.get(actorId).items.find((i) => i.name === weaponName).id,
      { actorId, weaponName },
    );
    const embeddedOverrideId = await game.evaluate(
      ({ actorId, overrideName }) =>
        game.actors.get(actorId).items.find((i) => i.name === overrideName).id,
      { actorId, overrideName },
    );
    const embeddedModifierId = await game.evaluate(
      ({ actorId, modifierName }) =>
        game.actors.get(actorId).items.find((i) => i.name === modifierName).id,
      { actorId, modifierName },
    );
    await equipWeapon(game, {
      actorSheetId,
      actorId,
      itemId: embeddedWeaponId,
    });
    await installUpgrade(game, {
      actorSheetId,
      actorId,
      upgradeId: embeddedOverrideId,
      targetId: embeddedWeaponId,
    });
    await installUpgrade(game, {
      actorSheetId,
      actorId,
      upgradeId: embeddedModifierId,
      targetId: embeddedWeaponId,
    });

    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageRoll = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(damageRoll).toBeVisible();
    await damageRoll.click();

    const dialog = game
      .locator(".application")
      .filter({ has: game.locator(".total-mods") });
    await expect(dialog).toBeVisible();
    const formula = await readDamageFormula(dialog);
    expect(formula, `damage formula: ${formula}`).toMatch(/:\s*9$/);
    const tooltip = await readTotalModsTooltip(dialog);
    for (const name of [overrideName, modifierName]) {
      expect(
        (tooltip ?? "").split("<br/>").find((e) => e.includes(name)),
        `neither upgrade may appear as a mod: ${tooltip}`,
      ).toBeUndefined();
    }

    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("still stacks a modifier upgrade onto the base damage formula", async ({
    page: game,
  }) => {
    const { actorId, actorSheetId, weaponName, weaponId } =
      await createCharacterAndWeapon(game, {
        weaponName: uniqueName("baton"),
        damage: "2d6",
      });
    const upgradeName = uniqueName("shockTip");
    const upgradeId = await createDamageUpgrade(game, {
      upgradeName,
      modType: "modifier",
      value: 2,
    });

    await dragItemToActorSheet(game, {
      itemId: weaponId,
      sheetId: actorSheetId,
      actorId,
    });
    await dragItemToActorSheet(game, {
      itemId: upgradeId,
      sheetId: actorSheetId,
      actorId,
    });
    const embeddedWeaponId = await game.evaluate(
      ({ actorId, weaponName }) =>
        game.actors.get(actorId).items.find((i) => i.name === weaponName).id,
      { actorId, weaponName },
    );
    const embeddedUpgradeId = await game.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName).id,
      { actorId, upgradeName },
    );
    await equipWeapon(game, {
      actorSheetId,
      actorId,
      itemId: embeddedWeaponId,
    });
    await installUpgrade(game, {
      actorSheetId,
      actorId,
      upgradeId: embeddedUpgradeId,
      targetId: embeddedWeaponId,
    });

    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageRoll = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(damageRoll).toBeVisible();
    await damageRoll.click();

    const dialog = game
      .locator(".application")
      .filter({ has: game.locator(".total-mods") });
    await expect(dialog).toBeVisible();
    const formula = await readDamageFormula(dialog);
    expect(formula, `damage formula: ${formula}`).toMatch(/:\s*2d6/);
    const tooltip = await readTotalModsTooltip(dialog);
    expectModEntry(tooltip, upgradeName, "+2");

    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
