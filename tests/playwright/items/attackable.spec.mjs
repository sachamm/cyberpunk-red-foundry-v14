import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  activateGearTab,
  chatMessageCount,
  createInventoryItemViaUI,
  dismissNotifications,
  enablePlayersCreateInventory,
  hoverGearRow,
  openSidebarTab,
  uniqueName,
  waitForNewChatMessage,
  waitForSkillLevel,
} from "../../../tools/playwright/ui/index.mjs";
import {
  SKILL_FIELD,
  characterSkillRow,
  chatRollCard,
  createCharacterViaUI,
  rollCardTotal,
  rollDiceSum,
  statValueInput,
} from "../actors/character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Attackable mixin: what a weapon's attack and damage rolls read at roll time.
 *
 * - A ranged (non-thrown) attack rolls REF plus the level of the skill named in
 *   the weapon's `weaponSkill`, and both are re-read from the actor when the roll
 *   is built, so stat/skill changes made after equipping show up on the next roll.
 * - An unarmed weapon with automatic calculation enabled derives its damage
 *   formula from BODY at roll time: 2d6 at BODY 6 or less, 3d6 at 10 or less,
 *   otherwise 4d6.
 * - The RAW damage critical (two dice showing the die's max face) is marked on
 *   the damage card ("Critical Damage: 5") and rides the apply-damage button as
 *   `data-bonus-damage`, but it is not added to the displayed total.
 */

// Equip a weapon with two clicks (carried, then equipped), waiting for each
// persisted state.
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

// The attack roll verify dialog (the one with the stat/skill inputs).
function attackRollDialog(page) {
  return page.locator(".application").filter({
    has: page.locator('input[name="statValue"]'),
  });
}

// The damage roll verify dialog.
function damageRollDialog(page) {
  return page.locator(".application").filter({
    has: page.locator(".total-mods"),
  });
}

// The "Damage: <formula>" line in the damage dialog header. The formula is the
// eval formula, so it carries the `dmg` crit marker (e.g. "2d6dmg").
async function readDamageFormula(dialog) {
  const header = dialog.locator(
    ".dialog-header .text-center:has(span.text-semi)",
  );
  await expect(header).toBeVisible();
  return (await header.textContent()).replace(/\s+/g, " ").trim();
}

// Confirm the open damage roll dialog with each die forced to the next face in
// `faces` (the same CONFIG.Dice.randomUniform mapping as damage-crit.spec.mjs),
// returning the id of the posted chat message. The override stays until the
// message exists — the roll evaluates asynchronously after the click — and is
// restored afterwards. Confirmed dialogs close with a short animation, so this
// also waits for the dialog to leave the DOM before returning; without that a
// follow-up roll's dialog is ambiguous while the old one is still closing.
async function confirmForcedDamageRoll(
  page,
  { messagesBefore, dieFaces, faces },
) {
  const dialog = damageRollDialog(page);
  await expect(dialog).toBeVisible();
  await page.evaluate(
    ({ dieFaces, faces }) => {
      window.__cprOriginalRandomUniform = CONFIG.Dice.randomUniform;
      const queue = faces.map((f) => 1 - (f - 0.5) / dieFaces);
      let i = 0;
      CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
    },
    { dieFaces, faces },
  );
  let messageId;
  try {
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    messageId = await waitForNewChatMessage(page, messagesBefore, {
      requireRoll: true,
    });
  } finally {
    await page.evaluate(() => {
      if (window.__cprOriginalRandomUniform) {
        CONFIG.Dice.randomUniform = window.__cprOriginalRandomUniform;
        delete window.__cprOriginalRandomUniform;
      }
    });
  }
  await expect(dialog).toHaveCount(0);
  return messageId;
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Item attackable mixin", () => {
  test("a ranged attack reads REF and the weapon skill live at roll time", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // The seeded Handgun skill starts at level 0; raise it to 2.
    const levelInput = characterSkillRow(page, sheetId, "Handgun").locator(
      SKILL_FIELD.levelInput,
    );
    await expect(levelInput).toHaveValue("0");
    await levelInput.fill("2");
    await levelInput.press("Tab");
    await waitForSkillLevel(page, actorId, "Handgun", 2);

    // Raise DEX to 8 so the stat choice (REF for a ranged weapon) is observable:
    // every other stat stays at 6.
    const dexInput = page.locator(`#${sheetId} ${statValueInput("dex")}`);
    await dexInput.fill("8");
    await dexInput.press("Tab");
    await page.waitForFunction(
      ({ actorId }) => game.actors.get(actorId).system.stats.dex.value === 8,
      { actorId },
      { timeout: 10000 },
    );

    // A ranged pistol that attacks with the Handgun skill.
    const weaponName = uniqueName("pistol");
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: {
        system: {
          isRanged: true,
          weaponType: "medPistol",
          ammoVariety: ["medPistol"],
          weaponSkill: "Handgun",
        },
      },
    });

    await equipWeapon(page, {
      actorSheetId: weapon.sheetId,
      actorId,
      itemId: weapon.itemId,
    });

    const sheet = page.locator(`#${weapon.sheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const attackRoll = sheet.locator(
      `.bottom-content-section a.rollable[data-roll-type="attack"][data-item-id="${weapon.itemId}"]`,
    );
    await expect(attackRoll).toBeVisible();

    await test.step("the dialog shows REF (not DEX) and the Handgun level", async () => {
      await attackRoll.click();
      const dialog = attackRollDialog(page);
      await expect(dialog).toBeVisible();
      // All stats start at 6 and DEX is 8, so a value of 6 proves REF was read.
      await expect(dialog.locator('input[name="statValue"]')).toHaveValue("6");
      await expect(dialog.locator('input[name="skillValue"]')).toHaveValue("2");
      const refLabel = await page.evaluate(() =>
        game.i18n.localize("CPR.global.stats.ref"),
      );
      await expect(dialog.locator(".dialog-item-name").first()).toContainText(
        refLabel,
      );
    });

    await test.step("the posted card totals the die + REF + Handgun", async () => {
      const messagesBefore = await chatMessageCount(page);
      const dialog = attackRollDialog(page);
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      const messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      const dice = await rollDiceSum(page, messageId);
      expect(
        (await rollCardTotal(card)) - dice,
        "card total minus the rolled die",
      ).toBe(6 + 2);
    });

    await test.step("bumping REF to 8 changes the next roll's total", async () => {
      const refInput = page.locator(
        `#${weapon.sheetId} ${statValueInput("ref")}`,
      );
      await refInput.fill("8");
      await refInput.press("Tab");
      await page.waitForFunction(
        ({ actorId }) => game.actors.get(actorId).system.stats.ref.value === 8,
        { actorId },
        { timeout: 10000 },
      );

      const messagesBefore = await chatMessageCount(page);
      // Ctrl-click skips the roll dialog and posts straight to chat.
      await attackRoll.click({ modifiers: CTRL_CLICK_MODIFIERS });
      const messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      const dice = await rollDiceSum(page, messageId);
      expect(
        (await rollCardTotal(card)) - dice,
        "card total minus the rolled die",
      ).toBe(8 + 2);
    });

    // Firing a pistol with no ammo warns (console + toast) but still rolls.
    await dismissNotifications(page);
  });

  test("unarmed damage auto-calculates from BODY", async ({ page }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // A plain unarmed weapon: the schema defaults keep automatic calculation on.
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: uniqueName("fists"),
      data: { system: { weaponType: "unarmed" } },
    });

    await equipWeapon(page, {
      actorSheetId: weapon.sheetId,
      actorId,
      itemId: weapon.itemId,
    });

    const sheet = page.locator(`#${weapon.sheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageGlyph = sheet.locator(
      `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${weapon.itemId}"]`,
    );
    await expect(damageGlyph).toBeVisible();

    for (const [body, formula] of [
      [6, "2d6"],
      [8, "3d6"],
      [11, "4d6"],
    ]) {
      if (body !== 6) {
        const bodyInput = page.locator(
          `#${weapon.sheetId} ${statValueInput("body")}`,
        );
        await bodyInput.fill(String(body));
        await bodyInput.press("Tab");
        await page.waitForFunction(
          ({ actorId, body }) =>
            game.actors.get(actorId).system.stats.body.value === body,
          { actorId, body },
          { timeout: 10000 },
        );
      }

      await test.step(`BODY ${body} rolls ${formula}`, async () => {
        await damageGlyph.click();
        const dialog = damageRollDialog(page);
        // The formula is the eval formula, so it carries the `dmg` crit marker.
        const header = await readDamageFormula(dialog);
        expect(header, `damage formula at BODY ${body}`).toMatch(
          new RegExp(`:\\s*${formula}`),
        );
        await dialog
          .locator('button.cpr-dialog-button[data-action="cancel"]')
          .click();
        await expect(dialog).toHaveCount(0, { timeout: 5000 });
      });
    }

    // Each damage roll created with no token targeted raises a warning toast.
    await dismissNotifications(page);
  });

  test("RAW crits mark the damage card and ride the apply button", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

    // A melee weapon with 2d6 damage and the schema's RAW crit defaults
    // (two dice at max face -> +5).
    const weaponName = uniqueName("bat");
    const weapon = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: { system: { weaponType: "lightMelee", damage: "2d6" } },
    });

    await equipWeapon(page, {
      actorSheetId: weapon.sheetId,
      actorId,
      itemId: weapon.itemId,
    });

    const sheet = page.locator(`#${weapon.sheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const damageGlyph = sheet.locator(
      `.bottom-content-section a.rollable[data-roll-type="damage"][data-item-id="${weapon.itemId}"]`,
    );
    await expect(damageGlyph).toBeVisible();

    await test.step("two max faces crit: the card shows the +5 without adding it to the total", async () => {
      const messagesBefore = await chatMessageCount(page);
      await damageGlyph.click();
      const messageId = await confirmForcedDamageRoll(page, {
        messagesBefore,
        dieFaces: 6,
        faces: [6, 6],
      });

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      // The displayed total is the dice only; the crit bonus is not added.
      await expect(card.locator(".d6-number-div span.clickable")).toHaveText(
        "12",
      );
      await expect(card.locator(".d6-data-div")).toContainText(
        "Critical Damage: 5",
      );
      const applyButton = card.locator('a[data-action="applyDamage"]');
      await expect(applyButton).toHaveAttribute("data-total-damage", "12");
      await expect(applyButton).toHaveAttribute("data-bonus-damage", "5");
    });

    await test.step("one max face is no crit and carries no bonus", async () => {
      const messagesBefore = await chatMessageCount(page);
      await damageGlyph.click();
      const messageId = await confirmForcedDamageRoll(page, {
        messagesBefore,
        dieFaces: 6,
        faces: [5, 6],
      });

      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible();
      await expect(card.locator(".d6-number-div span.clickable")).toHaveText(
        "11",
      );
      await expect(card.locator(".d6-data-div")).not.toContainText(
        "Critical Damage",
      );
      const applyButton = card.locator('a[data-action="applyDamage"]');
      await expect(applyButton).toHaveAttribute("data-total-damage", "11");
      await expect(applyButton).toHaveAttribute("data-bonus-damage", "0");
    });

    // Each damage roll created with no token targeted raises a warning toast.
    await dismissNotifications(page);
  });
});
