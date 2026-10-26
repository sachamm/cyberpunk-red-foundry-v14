import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  createInventoryItemViaUI,
  dismissNotifications,
  enablePlayersCreateInventory,
  equipWeapon,
  openSidebarTab,
  readDamageFormula,
  uniqueName,
  verifyRollDialog,
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

function attackRollDialog(page) {
  return page.locator(".application").filter({
    has: page.locator('input[name="statValue"]'),
  });
}

async function confirmForcedDamageRoll(
  page,
  { messagesBefore, dieFaces, faces },
) {
  const dialog = await verifyRollDialog(page);
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

    const levelInput = characterSkillRow(page, sheetId, "Handgun").locator(
      SKILL_FIELD.levelInput,
    );
    await expect(levelInput).toHaveValue("0");
    await levelInput.fill("2");
    await levelInput.press("Tab");
    await waitForSkillLevel(page, actorId, "Handgun", 2);

    const dexInput = page.locator(`#${sheetId} ${statValueInput("dex")}`);
    await dexInput.fill("8");
    await dexInput.press("Tab");
    await page.waitForFunction(
      ({ actorId }) => game.actors.get(actorId).system.stats.dex.value === 8,
      { actorId },
      { timeout: 10000 },
    );

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

    await dismissNotifications(page);
  });

  test("unarmed damage auto-calculates from BODY", async ({ page }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

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
        const dialog = await verifyRollDialog(page);
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

    await dismissNotifications(page);
  });

  test("RAW crits mark the damage card and ride the apply button", async ({
    page,
  }) => {
    await enablePlayersCreateInventory(page);
    const { actorId, sheetId } = await createCharacterViaUI(page);

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

    await dismissNotifications(page);
  });
});
