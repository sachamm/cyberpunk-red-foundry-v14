import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createActorViaUI,
  createItemViaUI,
  dismissNotifications,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openSidebarTab,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import { MOOK_FIELD, closeAndReopenMookSheet } from "./mook-sheet-helpers.mjs";

/*
 * Fight Pane — Weapons. The mook sheet has no tabs: the fight block is always
 * visible and a dropped weapon is auto-equipped, so it renders immediately after
 * a drag. Each test builds a fresh mook with exactly the weapons it needs and
 * proves one behavior, asserting on a fresh render where an action mutates state.
 *
 * Fire-mode selection lives in an actor flag (flags.<system>.firetype-<weaponId>),
 * set/cleared by _fireCheckboxToggle; DV/aim measurement is out of scope under the
 * noCanvas harness (see the plan). The loaded-ammo display and reload-fill behavior
 * are already covered by extended-magazine.spec.mjs, so they are not re-proven here.
 */

async function toggleItemCheckbox(page, { sheetId, itemId, target }) {
  const sheet = await openItemSettings(page, sheetId);
  await sheet.locator(`a.item-checkbox[data-target="${target}"]`).click();
  await page.waitForFunction(
    ({ itemId, target }) =>
      foundry.utils.getProperty(game.items.get(itemId), target) === true,
    { itemId, target },
    { timeout: 10000 },
  );
}

/**
 * Create a weapon via the UI and configure the fight-relevant fields. The ranged-only
 * inputs (autoFire, suppressiveFire, magazine.max) render only after isRanged is set.
 */
async function createConfiguredWeapon(
  page,
  {
    name,
    weaponType,
    isRanged = false,
    autoFire = 0,
    suppressiveFire = false,
    magazineMax = 0,
  },
) {
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

  if (isRanged) {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isRanged",
    });
    if (autoFire > 0) {
      await setItemField(page, {
        sheetId,
        itemId,
        name: "system.fireModes.autoFire",
        path: "system.fireModes.autoFire",
        value: autoFire,
      });
    }
    if (suppressiveFire) {
      await toggleItemCheckbox(page, {
        sheetId,
        itemId,
        target: "system.fireModes.suppressiveFire",
      });
    }
    if (magazineMax > 0) {
      await setItemField(page, {
        sheetId,
        itemId,
        name: "system.magazine.max",
        path: "system.magazine.max",
        value: magazineMax,
      });
    }
  }

  await closeDocSheet(page, { collection: "items", id: itemId });
  return itemId;
}

/**
 * Build a fresh mook, create + drag the given weapons onto it (auto-equipped), and
 * return its id, the freshly-reopened sheet id, and a name -> embedded-id map.
 */
async function setupMookWithWeapons(page, weaponSpecs) {
  const actorId = await createActorViaUI(page, {
    type: "mook",
    name: uniqueName("mook"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  for (const spec of weaponSpecs) {
    const itemId = await createConfiguredWeapon(page, spec);
    await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  }

  const byName = await page.evaluate(
    ({ actorId, names }) => {
      const items = game.actors.get(actorId).items;
      const out = {};
      for (const n of names) {
        const item = items.find((i) => i.name === n);
        if (item) out[n] = item.id;
      }
      return out;
    },
    { actorId, names: weaponSpecs.map((s) => s.name) },
  );

  sheetId = await closeAndReopenMookSheet(page, actorId);
  return { actorId, sheetId, byName };
}

/**
 * Create a ranged weapon via the UI that can actually hold and load ammo: set its
 * type + magazine, add "ammo" to its installable types, and mark a compatible ammo
 * variety. Without those the change-ammo dialog has no valid ammo to offer. A fresh
 * ammo item defaults to the heavyPistol variety, which is what this accepts.
 */
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

  // Add "ammo" to the weapon's installable types so it can hold a magazine.
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
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await page.waitForFunction((id) => {
    const allowedTypes = game.items.get(id).system.installedItems.allowedTypes;
    return allowedTypes.includes("ammo");
  }, itemId);

  // Mark a compatible ammo variety so the load dialog has a valid option.
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

/**
 * Build a fresh mook with one loadable ranged weapon and an ammo item, both dragged
 * onto it (auto-equipped). Returns the ids needed to drive the change-ammo flow.
 */
async function setupMookWithLoadableWeapon(page) {
  const actorId = await createActorViaUI(page, {
    type: "mook",
    name: uniqueName("mook"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  const weaponId = await createLoadableWeapon(page, {
    name: uniqueName("pistol"),
  });
  const ammoId = await createItemViaUI(page, {
    type: "ammo",
    name: uniqueName("ammo"),
  });
  const ammoSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: ammoId,
  });
  await setItemField(page, {
    sheetId: ammoSheetId,
    itemId: ammoId,
    name: "system.amount",
    path: "system.amount",
    value: 20,
  });
  await closeDocSheet(page, { collection: "items", id: ammoId });

  for (const itemId of [weaponId, ammoId]) {
    await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  }

  sheetId = await closeAndReopenMookSheet(page, actorId);
  return { actorId, sheetId, weaponId, ammoId };
}

const weaponRow = (page, sheetId, itemId) =>
  page.locator(`#${sheetId} ${MOOK_FIELD.weaponRow}[data-item-id="${itemId}"]`);

const fireFlag = (page, actorId, weaponId) =>
  page.evaluate(
    ({ actorId, weaponId }) => {
      const actor = game.actors.get(actorId);
      return (
        foundry.utils.getProperty(
          actor,
          `flags.${game.system.id}.firetype-${weaponId}`,
        ) ?? null
      );
    },
    { actorId, weaponId },
  );

async function attackRollContent(page, sheetId, itemId) {
  const messagesBefore = await page.evaluate(() => game.messages.size);
  await weaponRow(page, sheetId, itemId)
    .locator('[data-roll-type="attack"]')
    .click();

  const rollDialog = page.locator(".application").filter({
    has: page.locator(".total-mods"),
  });
  await expect(rollDialog).toBeVisible({ timeout: 10000 });
  await rollDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(rollDialog).toHaveCount(0, { timeout: 10000 });

  const messageId = await page.waitForFunction(
    (before) => {
      if (game.messages.size <= before) return false;
      const msg = game.messages.contents.at(-1);
      return msg && msg.rolls.length ? msg.id : false;
    },
    messagesBefore,
    { timeout: 10000 },
  );
  return page.evaluate((id) => {
    const msg = game.messages.get(id);
    return { messageId: id, content: msg.content };
  }, messageId);
}

/**
 * Open the change-ammo dialog on the mook's fight pane and confirm it. For an
 * unloaded weapon the only valid ammo is pre-selected (a load); pass selectUnload to
 * pick the empty "unload" option on an already-loaded weapon instead.
 */
async function confirmChangeAmmo(
  page,
  sheetId,
  itemId,
  { selectUnload = false } = {},
) {
  await weaponRow(page, sheetId, itemId)
    .locator('[data-action="select-ammo"]')
    .click();
  const loadDialog = page.locator(".application").filter({
    has: page.locator('select[name="selectedAmmo"]'),
  });
  await expect(loadDialog).toBeVisible({ timeout: 10000 });
  if (selectUnload) {
    await loadDialog.locator('select[name="selectedAmmo"]').selectOption("");
  }
  await loadDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(loadDialog).toHaveCount(0, { timeout: 10000 });
}

test.describe("Mook sheet - Fight Pane (weapons)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoReadyWorld(page);
  });

  test("groups equipped weapons into ranged and melee sections", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("melee"), weaponType: "lightMelee" },
      {
        name: uniqueName("pistol"),
        weaponType: "medPistol",
        isRanged: true,
        magazineMax: 15,
      },
    ]);

    await test.step("ranged weapons list under the Ranged header, before Melee", async () => {
      const names = Object.keys(byName);
      const order = await game.evaluate(
        ({ sheetId, rangedId, meleeId }) => {
          const root = document.getElementById(sheetId);
          const rows = [
            ...root.querySelectorAll(".weapon-content .item.weapon-grid"),
          ].map((el) => el.dataset.itemId);
          const headers = [
            ...root.querySelectorAll(".weapon-content .items-header"),
          ].map((el) => el.textContent.trim());
          const rangedLabel = game.i18n.localize(
            "CPR.characterSheet.bottomPane.fight.ranged",
          );
          return {
            rows,
            rangedIndex: rows.indexOf(rangedId),
            meleeIndex: rows.indexOf(meleeId),
            hasRangedHeader: headers.includes(rangedLabel),
          };
        },
        {
          sheetId,
          rangedId: byName[names[1]],
          meleeId: byName[names[0]],
        },
      );

      expect(order.hasRangedHeader).toBe(true);
      expect(order.rangedIndex).toBeGreaterThanOrEqual(0);
      expect(order.meleeIndex).toBeGreaterThan(order.rangedIndex);
    });
  });

  test("clicking a weapon opens its item sheet; ctrl-click sends it to chat", async ({
    page: game,
  }) => {
    const meleeName = uniqueName("melee");
    const { actorId, sheetId, byName } = await setupMookWithWeapons(game, [
      { name: meleeName, weaponType: "lightMelee" },
    ]);
    const id = Object.values(byName)[0];

    // macOS Chromium treats Ctrl+click as a right-click (context menu) and never
    // dispatches `click`, so use Cmd there. The handler accepts both ctrlKey/metaKey.
    const modifier = process.platform === "darwin" ? ["Meta"] : ["Control"];

    await test.step("ctrl-clicking sends the item card to chat", async () => {
      const messagesBefore = await game.evaluate(() => game.messages.size);
      await weaponRow(game, sheetId, id)
        .locator(MOOK_FIELD.itemNameLink)
        .click({ modifiers: modifier });

      const messageId = await game.waitForFunction(
        (before) => {
          if (game.messages.size <= before) return false;
          const msg = game.messages.contents.at(-1);
          return msg && msg.content ? msg.id : false;
        },
        messagesBefore,
        { timeout: 10000 },
      );
      await expect(messageId).toBeTruthy();

      const nameKeyword = meleeName.split(" ")[1]; // "melee"
      const cardContent = await game.evaluate(
        (id) => game.messages.get(id).content,
        messageId,
      );
      expect(cardContent).toContain(nameKeyword);

      await openSidebarTab(game, "chat");
      const chatMessage = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(chatMessage).toBeVisible({ timeout: 10000 });
    });

    await test.step("clicking the name opens the weapon's item sheet", async () => {
      await weaponRow(game, sheetId, id)
        .locator(MOOK_FIELD.itemNameLink)
        .click();
      await game.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId)?.sheet?.rendered === true,
        { actorId, itemId: id },
        { timeout: 15000 },
      );
    });
  });

  test("shows fire-mode checkboxes for the modes a weapon supports", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("pistol"), weaponType: "medPistol", isRanged: true },
      {
        name: uniqueName("rifle"),
        weaponType: "assaultRifle",
        isRanged: true,
        autoFire: 10,
        suppressiveFire: true,
      },
    ]);
    const names = Object.keys(byName);
    const pistolId = byName[names[0]];
    const rifleId = byName[names[1]];

    await test.step("a weapon with no auto/suppressive shows only Aimed", async () => {
      const row = weaponRow(game, sheetId, pistolId);
      await expect(
        row.locator('.fire-checkbox[data-fire-mode="aimed"]'),
      ).toBeVisible();
      await expect(
        row.locator('.fire-checkbox[data-fire-mode="autofire"]'),
      ).toHaveCount(0);
      await expect(
        row.locator('.fire-checkbox[data-fire-mode="suppressive"]'),
      ).toHaveCount(0);
    });

    await test.step("a weapon with autoFire and suppressive shows all three", async () => {
      const row = weaponRow(game, sheetId, rifleId);
      for (const mode of ["aimed", "autofire", "suppressive"]) {
        await expect(
          row.locator(`.fire-checkbox[data-fire-mode="${mode}"]`),
        ).toBeVisible();
      }
    });
  });

  test("toggling a fire mode updates the weapon's fire-type flag", async ({
    page: game,
  }) => {
    const { actorId, sheetId, byName } = await setupMookWithWeapons(game, [
      {
        name: uniqueName("rifle"),
        weaponType: "assaultRifle",
        isRanged: true,
        autoFire: 10,
      },
    ]);
    const id = Object.values(byName)[0];

    await test.step("selecting a mode sets the flag; re-selecting clears it", async () => {
      const row = weaponRow(game, sheetId, id);

      await row.locator('.fire-checkbox[data-fire-mode="aimed"]').click();
      await expect.poll(() => fireFlag(game, actorId, id)).toBe("aimed");

      await row.locator('.fire-checkbox[data-fire-mode="autofire"]').click();
      await expect.poll(() => fireFlag(game, actorId, id)).toBe("autofire");

      await row.locator('.fire-checkbox[data-fire-mode="autofire"]').click();
      await expect.poll(() => fireFlag(game, actorId, id)).toBeNull();
    });
  });

  test("selecting a fire mode changes the attack roll's skill", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      {
        name: uniqueName("rifle"),
        weaponType: "assaultRifle",
        isRanged: true,
        autoFire: 10,
        suppressiveFire: true,
      },
    ]);
    const id = Object.values(byName)[0];
    const row = weaponRow(game, sheetId, id);

    const { autofireLabel, attackLabel } = await game.evaluate(() => ({
      autofireLabel: game.i18n.localize("CPR.global.itemType.skill.autofire"),
      attackLabel: game.i18n.localize("CPR.rolls.attack"),
    }));

    await test.step("a plain attack uses the weapon's own skill, not Autofire", async () => {
      const { content } = await attackRollContent(game, sheetId, id);
      expect(content).toContain(attackLabel);
      expect(content).not.toContain(autofireLabel);
    });

    await test.step("selecting autofire makes the attack use the Autofire skill", async () => {
      await row.locator('.fire-checkbox[data-fire-mode="autofire"]').click();
      const { content } = await attackRollContent(game, sheetId, id);
      expect(content).toContain(autofireLabel);
    });

    await test.step("selecting suppressive also uses the Autofire skill", async () => {
      await row.locator('.fire-checkbox[data-fire-mode="suppressive"]').click();
      const { messageId, content } = await attackRollContent(game, sheetId, id);
      expect(content).toContain(autofireLabel);

      await openSidebarTab(game, "chat");
      await expect(
        game.locator(`#chat .chat-message[data-message-id="${messageId}"]`),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test("attacking with an unloaded ranged weapon warns you're out of bullets", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      {
        name: uniqueName("unloaded"),
        weaponType: "medPistol",
        isRanged: true,
        magazineMax: 15,
      },
    ]);
    const id = Object.values(byName)[0];

    await test.step("the fresh ranged weapon reads Unloaded (empty magazine)", async () => {
      const unloaded = await game.evaluate(() =>
        game.i18n.localize("CPR.mookSheet.items.unloaded"),
      );
      await expect(weaponRow(game, sheetId, id)).toContainText(unloaded);
    });

    await test.step("firing it shows a warning banner about the empty magazine", async () => {
      const needle = "you lack the bullets in your weapon";

      const localizedWarning = await game.evaluate(() =>
        game.i18n.localize("CPR.messages.weaponAttackOutOfBullets"),
      );
      expect(localizedWarning).toContain(needle);

      await attackRollContent(game, sheetId, id);

      const banner = game
        .locator(".notification.warning")
        .filter({ hasText: needle });
      await expect(banner).toBeVisible();
      await dismissNotifications(game);
    });
  });

  test("checking suppressive hides the weapon's damage roll", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      {
        name: uniqueName("rifle"),
        weaponType: "assaultRifle",
        isRanged: true,
        suppressiveFire: true,
      },
    ]);
    const id = Object.values(byName)[0];
    const row = weaponRow(game, sheetId, id);

    await test.step("damage roll is visible until suppressive is checked", async () => {
      await expect(row.locator('[data-roll-type="damage"]')).toBeVisible();
      await row.locator('.fire-checkbox[data-fire-mode="suppressive"]').click();
      await expect(row.locator('[data-roll-type="damage"]')).toHaveCount(0);
    });

    await test.step("unchecking suppressive restores the damage roll", async () => {
      await row.locator('.fire-checkbox[data-fire-mode="suppressive"]').click();
      await expect(row.locator('[data-roll-type="damage"]')).toBeVisible();
    });
  });

  test("shows Unloaded for a fresh ranged weapon and Melee for a melee weapon", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("melee"), weaponType: "lightMelee" },
      {
        name: uniqueName("pistol"),
        weaponType: "medPistol",
        isRanged: true,
        magazineMax: 15,
      },
    ]);
    const names = Object.keys(byName);
    const meleeId = byName[names[0]];
    const pistolId = byName[names[1]];

    await test.step("the fresh ranged weapon reads Unloaded", async () => {
      const unloaded = await game.evaluate(() =>
        game.i18n.localize("CPR.mookSheet.items.unloaded"),
      );
      await expect(
        weaponRow(game, sheetId, pistolId).locator(".weapon-ammo"),
      ).toContainText(unloaded);
    });

    await test.step("the melee weapon reads Melee", async () => {
      const melee = await game.evaluate(() =>
        game.i18n.localize("CPR.global.itemType.skill.meleeWeapon"),
      );
      await expect(
        weaponRow(game, sheetId, meleeId).locator(".weapon-ammo"),
      ).toContainText(melee);
    });
  });

  test("shows the change-ammo action for ranged weapons only", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("melee"), weaponType: "lightMelee" },
      {
        name: uniqueName("pistol"),
        weaponType: "medPistol",
        isRanged: true,
        magazineMax: 15,
      },
    ]);
    const names = Object.keys(byName);
    const meleeId = byName[names[0]];
    const pistolId = byName[names[1]];

    await test.step("ranged weapon exposes change-ammo; melee does not", async () => {
      await expect(
        weaponRow(game, sheetId, pistolId).locator(
          '[data-action="select-ammo"]',
        ),
      ).toBeVisible();
      await expect(
        weaponRow(game, sheetId, meleeId).locator(
          '[data-action="select-ammo"]',
        ),
      ).toHaveCount(0);
    });
  });

  test("shows the reload action while a ranged weapon's magazine is not full", async ({
    page: game,
  }) => {
    const { actorId, sheetId, byName } = await setupMookWithWeapons(game, [
      {
        name: uniqueName("pistol"),
        weaponType: "medPistol",
        isRanged: true,
        magazineMax: 15,
      },
    ]);
    const id = Object.values(byName)[0];

    await test.step("an empty (0/15) magazine offers the reload action", async () => {
      const mag = await game.evaluate(
        ({ actorId, itemId }) => {
          const weapon = game.actors.get(actorId).items.get(itemId);
          return foundry.utils.getProperty(weapon, "system.magazine");
        },
        { actorId, itemId: id },
      );
      expect(mag.value).toBe(0);
      expect(mag.max).toBe(15);

      await expect(
        weaponRow(game, sheetId, id).locator('[data-action="reload-ammo"]'),
      ).toBeVisible();
    });
  });

  test("loads ammo into an empty ranged weapon via the change-ammo action", async ({
    page: game,
  }) => {
    const { actorId, sheetId, weaponId } =
      await setupMookWithLoadableWeapon(game);

    await test.step("the fresh weapon reads Unloaded with an empty magazine", async () => {
      const unloaded = await game.evaluate(() =>
        game.i18n.localize("CPR.mookSheet.items.unloaded"),
      );
      await expect(weaponRow(game, sheetId, weaponId)).toContainText(unloaded);
    });

    await test.step("confirming the change-ammo dialog loads a full magazine", async () => {
      await confirmChangeAmmo(game, sheetId, weaponId);
      const mag = await game.evaluate(
        ({ actorId, itemId }) => {
          const weapon = game.actors.get(actorId).items.get(itemId);
          return {
            value: foundry.utils.getProperty(weapon, "system.magazine.value"),
            max: foundry.utils.getProperty(weapon, "system.magazine.max"),
            loaded: foundry.utils.getProperty(weapon, "system.hasAmmoLoaded"),
          };
        },
        { actorId, itemId: weaponId },
      );
      expect(mag.loaded).toBe(true);
      expect(mag.value).toBe(mag.max);
    });

    await test.step("a fresh render shows the loaded magazine instead of Unloaded", async () => {
      const freshSheetId = await closeAndReopenMookSheet(game, actorId);
      const weapon = await game.evaluate(
        ({ actorId, itemId }) => {
          const w = game.actors.get(actorId).items.get(itemId);
          return foundry.utils.getProperty(w, "system.magazine");
        },
        { actorId, itemId: weaponId },
      );
      const unloaded = await game.evaluate(() =>
        game.i18n.localize("CPR.mookSheet.items.unloaded"),
      );
      const row = weaponRow(game, freshSheetId, weaponId);
      await expect(row).not.toContainText(unloaded);
      // The ammo cell renders "<type>: <value> / <max>" (spaces around the slash).
      await expect(row).toContainText(`${weapon.value} / ${weapon.max}`);
    });
  });

  test("unloads a loaded ranged weapon via the change-ammo action", async ({
    page: game,
  }) => {
    const { actorId, sheetId, weaponId } =
      await setupMookWithLoadableWeapon(game);

    await test.step("load the weapon first so there is ammo to unload", async () => {
      await confirmChangeAmmo(game, sheetId, weaponId);
      await game.waitForFunction(
        ({ actorId, itemId }) =>
          foundry.utils.getProperty(
            game.actors.get(actorId).items.get(itemId),
            "system.hasAmmoLoaded",
          ) === true,
        { actorId, itemId: weaponId },
        { timeout: 10000 },
      );
    });

    await test.step("picking the unload option empties the magazine", async () => {
      await confirmChangeAmmo(game, sheetId, weaponId, { selectUnload: true });
      const state = await game.evaluate(
        ({ actorId, itemId }) => {
          const weapon = game.actors.get(actorId).items.get(itemId);
          return {
            value: foundry.utils.getProperty(weapon, "system.magazine.value"),
            loaded: foundry.utils.getProperty(weapon, "system.hasAmmoLoaded"),
          };
        },
        { actorId, itemId: weaponId },
      );
      expect(state.loaded).toBe(false);
      expect(state.value).toBe(0);
    });

    await test.step("a fresh render reads Unloaded again", async () => {
      const freshSheetId = await closeAndReopenMookSheet(game, actorId);
      const unloaded = await game.evaluate(() =>
        game.i18n.localize("CPR.mookSheet.items.unloaded"),
      );
      await expect(weaponRow(game, freshSheetId, weaponId)).toContainText(
        unloaded,
      );
    });
  });

  test("rolls the melee weapon's attack to chat", async ({ page: game }) => {
    const { actorId, sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("melee"), weaponType: "lightMelee" },
    ]);
    const id = Object.values(byName)[0];

    await test.step("the attack roll posts a roll card to chat", async () => {
      const messagesBefore = await game.evaluate(() => game.messages.size);
      await weaponRow(game, sheetId, id)
        .locator('[data-roll-type="attack"]')
        .click();

      const rollDialog = game.locator(".application").filter({
        has: game.locator(".total-mods"),
      });
      await expect(rollDialog).toBeVisible({ timeout: 10000 });
      await rollDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(rollDialog).toHaveCount(0, { timeout: 10000 });

      const messageId = await game.waitForFunction(
        (before) => {
          if (game.messages.size <= before) return false;
          const msg = game.messages.contents.at(-1);
          return msg && msg.rolls.length ? msg.id : false;
        },
        messagesBefore,
        { timeout: 10000 },
      );
      await expect(messageId).toBeTruthy();

      const rollInfo = await game.evaluate((messageId) => {
        const msg = game.messages.get(messageId);
        return {
          speakerActor: msg.speaker?.actor ?? null,
          rolls: msg.rolls.map((r) => r.total),
        };
      }, messageId);
      expect(rollInfo.speakerActor).toBe(actorId);
      expect(rollInfo.rolls.length).toBe(1);

      await openSidebarTab(game, "chat");
      const chatMessage = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(chatMessage).toBeVisible({ timeout: 10000 });
    });
  });

  test("rolls the weapon's damage to chat", async ({ page: game }) => {
    const { sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("melee"), weaponType: "lightMelee" },
    ]);
    const id = Object.values(byName)[0];

    await test.step("the damage roll posts a damage card to chat", async () => {
      const messagesBefore = await game.evaluate(() => game.messages.size);
      await weaponRow(game, sheetId, id)
        .locator('[data-roll-type="damage"]')
        .click();

      const rollDialog = game.locator(".application").filter({
        has: game.locator(".total-mods"),
      });
      await expect(rollDialog).toBeVisible({ timeout: 10000 });
      await rollDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(rollDialog).toHaveCount(0, { timeout: 10000 });

      const messageId = await game.waitForFunction(
        (before) => {
          if (game.messages.size <= before) return false;
          const msg = game.messages.contents.at(-1);
          return msg && msg.rolls.length ? msg.id : false;
        },
        messagesBefore,
        { timeout: 10000 },
      );
      await expect(messageId).toBeTruthy();

      await openSidebarTab(game, "chat");
      const chatMessage = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(chatMessage).toBeVisible({ timeout: 10000 });
    });
  });

  test("removes a weapon with the Delete key", async ({ page: game }) => {
    const { actorId, sheetId, byName } = await setupMookWithWeapons(game, [
      { name: uniqueName("melee"), weaponType: "lightMelee" },
    ]);
    const id = Object.values(byName)[0];

    await test.step("focusing the name and pressing Delete removes it", async () => {
      await weaponRow(game, sheetId, id)
        .locator(MOOK_FIELD.itemNameLink)
        .focus();
      await game.keyboard.press("Delete");

      const confirmDialog = game.locator(".cpr-dialog").filter({
        has: game.locator(".cpr-dialog-message"),
      });
      await expect(confirmDialog).toBeVisible({ timeout: 10000 });
      await confirmDialog.locator('button[data-action="yes"]').click();
      await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

      await game.waitForFunction(
        ({ actorId, itemId }) => !game.actors.get(actorId).items.has(itemId),
        { actorId, itemId: id },
        { timeout: 10000 },
      );

      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(weaponRow(game, freshSheet, id).first()).toHaveCount(0);
    });
  });
});
