import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  createItemViaUI,
  dismissNotifications,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openSidebarTab,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  createMookViaUI,
  openInstallCyberwareDialog,
  confirmInstallCyberwareDialog,
  waitForNewChatMessage,
  ownedItemIdsByNames,
  closeAndReopenMookSheet,
  waitForMookFields,
  yesNoDialog,
  resolveYesNo,
  deleteKeyRemove,
  waitItemRemoved,
  installConsoleErrorHarness,
} from "./mook-sheet-helpers.mjs";

/*
 * Fight Pane — Weapons and Armor. The mook sheet has no tabs: the fight block is
 * always visible and a dropped weapon/armor is auto-equipped, so it renders
 * immediately after a drag. Each test builds a fresh mook with exactly the items
 * it needs and proves one behavior, asserting on a fresh render where an action
 * mutates state.
 *
 * Fire-mode selection lives in an actor flag (flags.<system>.firetype-<weaponId>),
 * set/cleared by _fireCheckboxToggle; DV/aim measurement is out of scope under the
 * noCanvas harness (see the plan). The loaded-ammo display and reload-fill behavior
 * are already covered by extended-magazine.spec.mjs, so they are not re-proven here.
 * Armor tracking drives a token resource bar that needs canvas, so under noCanvas
 * the visible proof is the star glyph; externalData reads are supporting evidence.
 */

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
  let { actorId, sheetId } = await createMookViaUI(page);

  for (const spec of weaponSpecs) {
    const itemId = await createConfiguredWeapon(page, spec);
    await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  }

  const byName = await ownedItemIdsByNames(
    page,
    actorId,
    weaponSpecs.map((s) => s.name),
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
  let { actorId, sheetId } = await createMookViaUI(page);

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

/**
 * Create an armor via the UI and configure its locations/SP. A fresh armor is
 * body-only with SP 7; the head SP input renders only once isHeadLocation is set,
 * so the checkbox toggles happen before any SP entry.
 */
async function createConfiguredArmor(
  page,
  { name, isHeadLocation = false, isBodyLocation = true, headSp, bodySp },
) {
  const itemId = await createItemViaUI(page, { type: "armor", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  if (isHeadLocation) {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isHeadLocation",
    });
  }
  if (!isBodyLocation) {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isBodyLocation",
      expected: false,
    });
  }
  if (headSp !== undefined) {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.headLocation.sp",
      path: "system.headLocation.sp",
      value: headSp,
    });
  }
  if (bodySp !== undefined) {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.bodyLocation.sp",
      path: "system.bodyLocation.sp",
      value: bodySp,
    });
  }

  await closeDocSheet(page, { collection: "items", id: itemId });
  return itemId;
}

/**
 * Build a fresh mook, create + drag the given armors onto it (auto-equipped), and
 * return its id, the freshly-reopened sheet id, and a name -> embedded-id map.
 */
async function setupMookWithArmors(page, armorSpecs) {
  let { actorId, sheetId } = await createMookViaUI(page);

  for (const spec of armorSpecs) {
    const itemId = await createConfiguredArmor(page, spec);
    await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  }

  const byName = await ownedItemIdsByNames(
    page,
    actorId,
    armorSpecs.map((s) => s.name),
  );

  sheetId = await closeAndReopenMookSheet(page, actorId);
  return { actorId, sheetId, byName };
}

const weaponRow = (page, sheetId, itemId) =>
  page.locator(`#${sheetId} ${MOOK_FIELD.weaponRow}[data-item-id="${itemId}"]`);

const armorRow = (page, sheetId, itemId) =>
  page.locator(`#${sheetId} ${MOOK_FIELD.armorRow}[data-item-id="${itemId}"]`);

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

async function weaponRollContent(
  page,
  sheetId,
  itemId,
  { rollType = "attack" } = {},
) {
  const messagesBefore = await chatMessageCount(page);
  await weaponRow(page, sheetId, itemId)
    .locator(`[data-roll-type="${rollType}"]`)
    .click();

  const rollDialog = page.locator(".application").filter({
    has: page.locator(".total-mods"),
  });
  await expect(rollDialog).toBeVisible({ timeout: 10000 });
  await rollDialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(rollDialog).toHaveCount(0, { timeout: 10000 });

  const messageId = await waitForNewChatMessage(page, messagesBefore, {
    requireRoll: true,
  });
  return page.evaluate((id) => {
    const msg = game.messages.get(id);
    return { messageId: id, content: msg.content };
  }, messageId);
}

/**
 * Prove the name-link behavior shared by equipped weapon and armor rows: a
 * ctrl-click sends the item card to chat, a plain click opens the owned item's
 * sheet. `row` is the rendered item row locator for the current sheet.
 */
async function itemNameLinkActions(
  game,
  { actorId, itemId, row, nameKeyword },
) {
  await test.step("ctrl-clicking sends the item card to chat", async () => {
    const messagesBefore = await chatMessageCount(game);
    await row
      .locator(MOOK_FIELD.itemNameLink)
      .click({ modifiers: CTRL_CLICK_MODIFIERS });

    const messageId = await waitForNewChatMessage(game, messagesBefore, {
      requireContent: true,
    });

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

  await test.step("clicking the name opens the item's sheet", async () => {
    await row.locator(MOOK_FIELD.itemNameLink).click();
    await game.waitForFunction(
      ({ actorId, itemId }) =>
        game.actors.get(actorId).items.get(itemId)?.sheet?.rendered === true,
      { actorId, itemId },
      { timeout: 15000 },
    );
  });
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

installConsoleErrorHarness();

test.describe("Mook sheet - Fight Pane (weapons)", () => {
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

  test("an installed cyberware weapon shows up in the fight block's melee list", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);
    const itemName = uniqueName("cyberweapon");
    const itemId = await createItemViaUI(game, {
      type: "cyberware",
      name: itemName,
    });
    const itemSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: itemId,
    });

    // A fresh cyberware is foundational and of a non-core type (cyberArm), so it installs
    // directly on the mook. Marking it a weapon via its real checkbox is what makes it a
    // fight-block entry; no weaponType or fire mode is required for it to render.
    await toggleItemCheckbox(game, {
      sheetId: itemSheetId,
      itemId,
      target: "system.isWeapon",
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    const dialog = await openInstallCyberwareDialog(game, {
      itemId,
      sheetId,
      actorId,
    });
    await confirmInstallCyberwareDialog(dialog, { humanity: "none" });

    const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
    const embeddedId = ids[itemName];
    expect(
      embeddedId,
      "the cyberware should be embedded on the mook",
    ).toBeTruthy();
    await game.waitForFunction(
      ({ actorId, itemId }) =>
        game.actors.get(actorId).items.get(itemId).system.isInstalled === true,
      { actorId, itemId: embeddedId },
      { timeout: 10000 },
    );

    sheetId = await closeAndReopenMookSheet(game, actorId);

    await test.step("the cyberware weapon renders under the Melee section", async () => {
      const info = await game.evaluate(
        ({ sheetId, embeddedId }) => {
          const root = document.getElementById(sheetId);
          const row = root.querySelector(
            `.mook-weapon-list .item.weapon-grid[data-item-id="${embeddedId}"]`,
          );
          if (!row) return { found: false };
          let section = null;
          for (
            let sib = row.previousElementSibling;
            sib;
            sib = sib.previousElementSibling
          ) {
            if (sib.classList.contains("items-header")) {
              section = sib.textContent.trim();
              break;
            }
          }
          return {
            found: true,
            name: row.querySelector(".name")?.textContent.trim() ?? null,
            section,
            meleeLabel: game.i18n.localize(
              "CPR.characterSheet.bottomPane.fight.melee",
            ),
          };
        },
        { sheetId, embeddedId },
      );

      expect(info.found).toBe(true);
      expect(info.name).toBe(itemName);
      expect(info.section).toBe(info.meleeLabel);
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

    await itemNameLinkActions(game, {
      actorId,
      itemId: id,
      row: weaponRow(game, sheetId, id),
      nameKeyword: meleeName.split(" ")[1], // "melee"
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
      const { content } = await weaponRollContent(game, sheetId, id);
      expect(content).toContain(attackLabel);
      expect(content).not.toContain(autofireLabel);
    });

    await test.step("selecting autofire makes the attack use the Autofire skill", async () => {
      await row.locator('.fire-checkbox[data-fire-mode="autofire"]').click();
      const { content } = await weaponRollContent(game, sheetId, id);
      expect(content).toContain(autofireLabel);
    });

    await test.step("selecting suppressive also uses the Autofire skill", async () => {
      await row.locator('.fire-checkbox[data-fire-mode="suppressive"]').click();
      const { messageId, content } = await weaponRollContent(game, sheetId, id);
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

    await test.step("firing it shows a warning banner about the empty magazine", async () => {
      const needle = "you lack the bullets in your weapon";

      const localizedWarning = await game.evaluate(() =>
        game.i18n.localize("CPR.messages.weaponAttackOutOfBullets"),
      );
      expect(localizedWarning).toContain(needle);

      await weaponRollContent(game, sheetId, id);

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

    await test.step("a fresh render shows the loaded magazine", async () => {
      const freshSheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(weaponRow(game, freshSheetId, weaponId)).toContainText(
        "8 / 8",
      );
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
      const { messageId } = await weaponRollContent(game, sheetId, id);

      const rollInfo = await game.evaluate((messageId) => {
        const msg = game.messages.get(messageId);
        return {
          speakerActor: msg.speaker?.actor ?? null,
          rollClass: msg.rolls[0]?.constructor?.name ?? null,
          rollCount: msg.rolls.length,
        };
      }, messageId);
      expect(rollInfo.speakerActor).toBe(actorId);
      expect(rollInfo.rollClass).toBe("CPRAttackRoll");
      expect(rollInfo.rollCount).toBe(1);

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
      const { messageId } = await weaponRollContent(game, sheetId, id, {
        rollType: "damage",
      });

      const rollClass = await game.evaluate(
        (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
        messageId,
      );
      expect(rollClass).toBe("CPRDamageRoll");

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
      await deleteKeyRemove(
        game,
        weaponRow(game, sheetId, id).locator(MOOK_FIELD.itemNameLink),
      );

      const confirmDialog = yesNoDialog(game);
      await expect(confirmDialog).toBeVisible({ timeout: 10000 });
      await resolveYesNo(confirmDialog, "yes");
      await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

      await waitItemRemoved(game, { actorId, itemId: id });

      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(weaponRow(game, freshSheet, id).first()).toHaveCount(0);
    });
  });
});

test.describe("Mook sheet - Fight Pane (armor)", () => {
  test("displays each armor's location and SP in the fight block", async ({
    page: game,
  }) => {
    const { sheetId, byName } = await setupMookWithArmors(game, [
      { name: uniqueName("jacket") },
      {
        name: uniqueName("helmet"),
        isHeadLocation: true,
        isBodyLocation: false,
        headSp: 4,
      },
      { name: uniqueName("suit"), isHeadLocation: true, headSp: 4, bodySp: 5 },
    ]);
    const names = Object.keys(byName);
    const jacketId = byName[names[0]];
    const helmetId = byName[names[1]];
    const suitId = byName[names[2]];

    const labels = await game.evaluate(() => ({
      head: game.i18n.localize("CPR.global.location.head"),
      body: game.i18n.localize("CPR.global.location.body"),
      sp: game.i18n.localize("CPR.global.itemType.armor.sp"),
    }));

    await test.step("body-only armor shows a single Body block with its SP", async () => {
      const row = armorRow(game, sheetId, jacketId);
      await expect(row.locator(".armor-1-location")).toContainText(labels.body);
      await expect(row.locator(".armor-1-stats")).toHaveText("7/7");
      await expect(row.locator(".armor-1-type")).toContainText(labels.sp);
      await expect(row.locator(".armor-2-location")).toHaveCount(0);
    });

    await test.step("head-only armor shows a single Head block with its SP", async () => {
      const row = armorRow(game, sheetId, helmetId);
      await expect(row.locator(".armor-1-location")).toContainText(labels.head);
      await expect(row.locator(".armor-1-stats")).toHaveText("4/4");
      await expect(row.locator(".armor-2-location")).toHaveCount(0);
    });

    await test.step("dual-location armor shows a Head block and a Body block", async () => {
      const row = armorRow(game, sheetId, suitId);
      await expect(row.locator(".armor-1-location")).toContainText(labels.head);
      await expect(row.locator(".armor-1-stats")).toHaveText("4/4");
      await expect(row.locator(".armor-2-location")).toContainText(labels.body);
      await expect(row.locator(".armor-2-stats")).toHaveText("5/5");
    });
  });

  test("clicking an armor opens its item sheet; ctrl-click sends it to chat", async ({
    page: game,
  }) => {
    const jacketName = uniqueName("jacket");
    const { actorId, sheetId, byName } = await setupMookWithArmors(game, [
      { name: jacketName },
    ]);
    const id = Object.values(byName)[0];

    await itemNameLinkActions(game, {
      actorId,
      itemId: id,
      row: armorRow(game, sheetId, id),
      nameKeyword: jacketName.split(" ")[1], // "jacket"
    });
  });

  test("ablating armor via the ablate icon reduces its SP", async ({
    page: game,
  }) => {
    const { actorId, sheetId, byName } = await setupMookWithArmors(game, [
      { name: uniqueName("jacket") },
    ]);
    const id = Object.values(byName)[0];

    let currentSheet = sheetId;

    await test.step("clicking ablate reduces the displayed SP by one", async () => {
      await armorRow(game, currentSheet, id)
        .locator('.ablate[data-location="body"]')
        .click();
      await game.waitForFunction(
        ({ actorId, itemId }) =>
          foundry.utils.getProperty(
            game.actors.get(actorId).items.get(itemId),
            "system.bodyLocation.ablation",
          ) === 1,
        { actorId, itemId: id },
        { timeout: 10000 },
      );

      currentSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        armorRow(game, currentSheet, id).locator(".armor-1-stats"),
      ).toHaveText("6/7");
    });

    await test.step("ablating again accumulates to 5/7", async () => {
      await armorRow(game, currentSheet, id)
        .locator('.ablate[data-location="body"]')
        .click();
      await game.waitForFunction(
        ({ actorId, itemId }) =>
          foundry.utils.getProperty(
            game.actors.get(actorId).items.get(itemId),
            "system.bodyLocation.ablation",
          ) === 2,
        { actorId, itemId: id },
        { timeout: 10000 },
      );

      currentSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        armorRow(game, currentSheet, id).locator(".armor-1-stats"),
      ).toHaveText("5/7");
    });
  });

  test("switching the tracked armor via the star moves its SP resource", async ({
    page: game,
  }) => {
    const jacketName = uniqueName("jacket");
    const vestName = uniqueName("vest");
    const { actorId, sheetId, byName } = await setupMookWithArmors(game, [
      { name: jacketName },
      { name: vestName, bodySp: 5 },
    ]);
    const names = Object.keys(byName);
    const jacketId = byName[names[0]];
    const vestId = byName[names[1]];

    await test.step("fresh armor starts untracked (outline star)", async () => {
      for (const id of [jacketId, vestId]) {
        const row = armorRow(game, sheetId, id);
        await expect(
          row.locator('a.armor-current-untrack[data-location="body"]'),
        ).toBeVisible();
        await expect(
          row.locator('a.armor-current-track[data-location="body"]'),
        ).toHaveCount(0);
      }
    });

    let currentSheet = sheetId;

    await test.step("clicking the star tracks that armor", async () => {
      await armorRow(game, currentSheet, jacketId)
        .locator('a.armor-current-untrack[data-location="body"]')
        .click();
      await waitForMookFields(game, actorId, {
        "system.externalData.currentArmorBody.id": jacketId,
      });

      currentSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        armorRow(game, currentSheet, jacketId).locator(
          'a.armor-current-track[data-location="body"]',
        ),
      ).toBeVisible();
      await expect(
        armorRow(game, currentSheet, vestId).locator(
          'a.armor-current-untrack[data-location="body"]',
        ),
      ).toBeVisible();

      const tracked = await game.evaluate(
        ({ actorId }) => {
          const data =
            game.actors.get(actorId).system.externalData.currentArmorBody;
          return { id: data.id, value: data.value, max: data.max };
        },
        { actorId },
      );
      expect(tracked).toEqual({ id: jacketId, value: 7, max: 7 });
    });

    await test.step("tracking a second armor switches the resource to it", async () => {
      await armorRow(game, currentSheet, vestId)
        .locator('a.armor-current-untrack[data-location="body"]')
        .click();
      await waitForMookFields(game, actorId, {
        "system.externalData.currentArmorBody.id": vestId,
      });

      currentSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        armorRow(game, currentSheet, vestId).locator(
          'a.armor-current-track[data-location="body"]',
        ),
      ).toBeVisible();
      await expect(
        armorRow(game, currentSheet, jacketId).locator(
          'a.armor-current-untrack[data-location="body"]',
        ),
      ).toBeVisible();

      const tracked = await game.evaluate(
        ({ actorId }) => {
          const data =
            game.actors.get(actorId).system.externalData.currentArmorBody;
          return { id: data.id, value: data.value, max: data.max };
        },
        { actorId },
      );
      expect(tracked).toEqual({ id: vestId, value: 5, max: 5 });
    });

    await test.step("clicking the filled star untracks it", async () => {
      await armorRow(game, currentSheet, vestId)
        .locator('a.armor-current-track[data-location="body"]')
        .click();
      await waitForMookFields(game, actorId, {
        "system.externalData.currentArmorBody.id": null,
        "system.externalData.currentArmorBody.value": 0,
      });

      currentSheet = await closeAndReopenMookSheet(game, actorId);
      for (const id of [jacketId, vestId]) {
        const row = armorRow(game, currentSheet, id);
        await expect(
          row.locator('a.armor-current-untrack[data-location="body"]'),
        ).toBeVisible();
        await expect(
          row.locator('a.armor-current-track[data-location="body"]'),
        ).toHaveCount(0);
      }
    });
  });

  test("removes an armor with the Delete key", async ({ page: game }) => {
    const { actorId, sheetId, byName } = await setupMookWithArmors(game, [
      { name: uniqueName("jacket") },
    ]);
    const id = Object.values(byName)[0];

    await test.step("focusing the name and pressing Delete removes it", async () => {
      await deleteKeyRemove(
        game,
        armorRow(game, sheetId, id).locator(MOOK_FIELD.itemNameLink),
      );

      const confirmDialog = yesNoDialog(game);
      await expect(confirmDialog).toBeVisible({ timeout: 10000 });
      await resolveYesNo(confirmDialog, "yes");
      await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

      await waitItemRemoved(game, { actorId, itemId: id });

      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(armorRow(game, freshSheet, id).first()).toHaveCount(0);
    });
  });
});
