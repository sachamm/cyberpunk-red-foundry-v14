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

/*
 * Regression test for issue #1347: a damage "override" upgrade must replace the weapon's base
 * damage formula on the damage roll.
 *
 * An `itemUpgrade` installed on a weapon can carry a damage modifier of type "modifier" (stacks as
 * a +X mod) or "override" (replaces the base damage value). The override branch used to run after
 * `CPRDamageRoll.create()` had already fixed the roll's formula, and assigned the replacement into
 * the roll's no-op `formula` setter — so the override was silently ignored and the base damage
 * rolled instead. The fix resolves `getAllUpgradeMods("damage")` before construction and folds the
 * winning override value into the damage formula; modifier upgrades are still added as mods after
 * construction, exactly as before.
 *
 * Driven entirely through the UI, mirroring a real user: item fields are set on the item sheets,
 * the weapon is equipped from the Gear tab, the upgrade is installed via the actor sheet's install
 * flow, and the damage is rolled from the Fight tab. The proof is read off the verify-roll dialog —
 * its header shows the exact formula that will be rolled, and its Total Mods breakdown (the
 * `data-tooltip`) lists every applied modifier by source and value. page.evaluate is used only to
 * confirm setup persisted, never to perform the action under test.
 */

// Cycle an embedded weapon's equip state up to "equipped" (owned → carried → equipped) via the
// Gear-tab equip glyph, waiting for each transition.
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

// Read the applied-modifiers breakdown (source + value list) from an open verify-roll dialog's
// Total Mods tooltip. Returns null when no mods are applied (the tooltip attribute is omitted).
async function readTotalModsTooltip(dialog) {
  const totalMods = dialog.locator(".total-mods .dialog-item-input");
  await expect(totalMods).toBeVisible();
  return totalMods.getAttribute("data-tooltip");
}

// Assert the Total Mods tooltip carries a modifier entry for `source` whose value is `value`. The
// tooltip lists one entry per mod, each "<source> (<key label>): <+value>" and delimited by
// "<br/>", so splitting on "<br/>" anchors the value to its own modifier.
function expectModEntry(tooltip, source, value) {
  const entry = (tooltip ?? "").split("<br/>").find((e) => e.includes(source));
  expect(
    entry,
    `no mod entry for "${source}" in tooltip: ${tooltip}`,
  ).toBeTruthy();
  expect(entry, `mod entry for "${source}": ${entry}`).toContain(value);
}

// The damage verify dialog's header shows "Damage: <formula>" — the exact formula that will be
// rolled. The header has two centered lines (title and formula); the formula line is the one
// carrying the bold label span. Returns the normalized line text.
async function readDamageFormula(dialog) {
  const header = dialog.locator(".dialog-header .text-center:has(span.text-semi)");
  await expect(header).toBeVisible();
  return (await header.textContent()).replace(/\s+/g, " ").trim();
}

// Create a character plus a lightMelee weapon with the given base damage, all via the UI.
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
  // lightMelee keeps the test deterministic: no autofire row in the damage dialog, no ammo to
  // load, and no unarmed auto-calculation (which would replace `damage` with a BODY-based formula).
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

// Create a weapon-type itemUpgrade whose Damage modifier is `modType` ("override"/"modifier") with
// the given value.
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
  // itemUpgrade.system.type defaults to "weapon"; confirm before proceeding.
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

    // Put both on the character, equip the weapon, install the upgrade into it.
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

    // Roll the weapon's damage from the Fight tab.
    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageRoll = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(damageRoll).toBeVisible();
    await damageRoll.click();

    // The override replaces the base formula outright: flat "12", no dice — and it is not a mod,
    // so the Total Mods breakdown carries no entry for the upgrade.
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

    // Cancel the roll and tidy up.
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

    // Put all three on the character, equip the weapon, install both upgrades into it.
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

    // Roll the weapon's damage from the Fight tab.
    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageRoll = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(damageRoll).toBeVisible();
    await damageRoll.click();

    // With an override present, the largest override wins and the modifier is dropped — matching
    // the upgrade chip (getTotalUpgradeValues), which also shows only the override. The formula is
    // flat "9" and neither upgrade appears as a mod.
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

    // Cancel the roll and tidy up.
    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("still stacks a modifier upgrade onto the base damage formula", async ({
    page: game,
  }) => {
    // Regression guard for the modifier path: with no override installed, the base dice roll and
    // the upgrade stacks as a +X mod (unchanged by the fix).
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

    // Put both on the character, equip the weapon, install the upgrade into it.
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

    // Roll the weapon's damage from the Fight tab.
    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageRoll = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(damageRoll).toBeVisible();
    await damageRoll.click();

    // The base formula is untouched (still 2d6) and the upgrade appears as a +2 mod.
    const dialog = game
      .locator(".application")
      .filter({ has: game.locator(".total-mods") });
    await expect(dialog).toBeVisible();
    const formula = await readDamageFormula(dialog);
    expect(formula, `damage formula: ${formula}`).toMatch(/:\s*2d6/);
    const tooltip = await readTotalModsTooltip(dialog);
    expectModEntry(tooltip, upgradeName, "+2");

    // Cancel the roll and tidy up.
    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
