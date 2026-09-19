import { test, expect } from "@playwright/test";
import {
  createItemViaUI,
  expectSheetRendered,
  closeDocSheet,
  openSidebarTab,
  openItemSettings,
  setItemField,
  dragItemToActorSheet,
  openOwnedItemSheet,
  closeOwnedItemSheet,
  uniqueName,
  dismissNotifications,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  chatMessageCount,
  createMookViaUI,
  waitForNewChatMessage,
  ownedItemIdsByNames,
  closeAndReopenMookSheet,
  openMookSkillDialog,
  mookSkillDialogRow,
  setMookSkillDialogLevel,
  confirmMookSkillDialog,
  cancelMookSkillDialog,
  ownedSkillLevel,
  waitForSkillLevel,
  installConsoleErrorHarness,
} from "./mook-sheet-helpers.mjs";

/*
 * Mook skill pane: the bulk edit dialog (structure, Confirm persistence, Cancel/X
 * discard), Delete-key reset, the display setting, the alphabetical list of leveled
 * skills, the custom-skill glyph, and rolling a visible skill. A fresh mook owns 63
 * seeded skills, 13 of them level 2 — those are exactly what the pane lists (the
 * filter is level !== 0). Exactly one default is non-core, "Local Expert (Your
 * Home)", so even a fresh sheet already shows one raw-named entry with the edit glyph.
 */

/**
 * Create a custom (non-core) skill item at the given level via its own sheet and
 * drag it onto the mook, returning its name and embedded id. Skills are not
 * equippable, so the drop just embeds the item.
 */
async function addLeveledCustomSkill(game, { actorId, sheetId, level }) {
  const name = uniqueName("skill");
  const itemId = await createItemViaUI(game, { type: "skill", name });
  const itemSheetId = await expectSheetRendered(game, {
    collection: "items",
    id: itemId,
  });
  await setItemField(game, {
    sheetId: itemSheetId,
    itemId,
    name: "system.level",
    path: "system.level",
    value: level,
  });
  await closeDocSheet(game, { collection: "items", id: itemId });

  await dragItemToActorSheet(game, { itemId, sheetId, actorId });

  const ids = await ownedItemIdsByNames(game, actorId, [name]);
  expect(
    ids[name],
    "the custom skill should be embedded on the mook",
  ).toBeTruthy();
  return { name, embeddedId: ids[name] };
}

async function createMookWithCustomSkill(game, level) {
  const { actorId, sheetId } = await createMookViaUI(game);
  const skill = await addLeveledCustomSkill(game, { actorId, sheetId, level });
  const freshSheetId = await closeAndReopenMookSheet(game, actorId);
  return { actorId, sheetId: freshSheetId, ...skill };
}

async function setSkillDisplaySetting(game, value) {
  await game.evaluate(
    (v) => game.settings.set(game.system.id, "mookSheetSkillDisplay", v),
    value,
  );
}

installConsoleErrorHarness();

test.describe("Mook Skills", () => {
  test("the bulk skill dialog lists every owned skill and Confirm persists an edit", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);

    let dialog;
    await test.step("the pen glyph opens the dialog with all 63 owned skills", async () => {
      dialog = await openMookSkillDialog(game, sheetId);
      await expect(dialog.locator(".window-header")).toContainText(
        "Add or Modify a Mook's Skill",
      );
      await expect(dialog.locator(".mook-skills-column")).toHaveCount(2);
      await expect(
        dialog.locator(".mook-skill-category-header").first(),
      ).toBeVisible();
      await expect(dialog.locator("li.dialog-item.skill-name")).toHaveCount(63);
    });

    await test.step("each row shows the skill's base stat, level input, and total", async () => {
      const handgun = mookSkillDialogRow(dialog, "Handgun");
      await expect(handgun).toHaveCount(1);
      await expect(handgun.locator(".skill-base")).toHaveText("+6");
      await expect(handgun.locator("input.number.skill-input")).toHaveValue(
        "0",
      );
      await expect(handgun.locator(".skill-total")).toHaveText("6");
      await expect(
        mookSkillDialogRow(dialog, "Local Expert (Your Home)"),
      ).toHaveCount(1);
    });

    await test.step("a leveled skill's total is its base stat plus its level", async () => {
      const athletics = mookSkillDialogRow(dialog, "Athletics");
      await expect(athletics.locator(".skill-base")).toHaveText("+6");
      await expect(athletics.locator("input.number.skill-input")).toHaveValue(
        "2",
      );
      await expect(athletics.locator(".skill-total")).toHaveText("8");
    });

    await test.step("setting Handgun to 2 and confirming persists it", async () => {
      await setMookSkillDialogLevel(mookSkillDialogRow(dialog, "Handgun"), 2);
      await confirmMookSkillDialog(dialog);

      const banner = game
        .locator(".notification")
        .filter({ hasText: "mook skills updated" });
      await expect(banner).toBeVisible();
      // only Handgun changed; the count must be exactly one (guards against a
      // type-mismatched comparison counting every row as updated)
      await expect(banner).toHaveText("1 mook skills updated");
      await waitForSkillLevel(game, actorId, "Handgun", 2);
      await dismissNotifications(game);
    });

    await test.step("the fresh render shows Handgun at its base value", async () => {
      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      const entry = game
        .locator(`#${freshSheet} ${MOOK_FIELD.skillEntry}`)
        .filter({ hasText: "Handgun" });
      await expect(entry).toHaveCount(1);
      await expect(entry.locator(MOOK_FIELD.skillRollable)).toHaveText(
        "Handgun (+8)",
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("bulk dialog Cancel and Escape discard edits", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);

    await test.step("Cancel discards multiple changed levels", async () => {
      const dialog = await openMookSkillDialog(game, sheetId);
      await setMookSkillDialogLevel(mookSkillDialogRow(dialog, "Handgun"), 2);
      await setMookSkillDialogLevel(mookSkillDialogRow(dialog, "Stealth"), 0);
      await cancelMookSkillDialog(dialog);

      expect(await ownedSkillLevel(game, actorId, "Handgun")).toBe(0);
      expect(await ownedSkillLevel(game, actorId, "Stealth")).toBe(2);
    });

    await test.step("Escape discards a different set of changed levels", async () => {
      const dialog = await openMookSkillDialog(game, sheetId);
      await setMookSkillDialogLevel(mookSkillDialogRow(dialog, "Brawling"), 3);
      await setMookSkillDialogLevel(
        mookSkillDialogRow(dialog, "Persuasion"),
        1,
      );
      await game.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0, { timeout: 5000 });

      expect(await ownedSkillLevel(game, actorId, "Brawling")).toBe(2);
      expect(await ownedSkillLevel(game, actorId, "Persuasion")).toBe(2);
    });

    await test.step("the fresh render is unchanged", async () => {
      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      const entries = game.locator(`#${freshSheet} ${MOOK_FIELD.skillEntry}`);
      await expect(entries.filter({ hasText: "Handgun" })).toHaveCount(0);
      await expect(
        entries
          .filter({ hasText: "Stealth" })
          .locator(MOOK_FIELD.skillRollable),
      ).toHaveText("Stealth (+8)");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the Delete key resets a skill to 0 without deleting it", async ({
    page: game,
  }) => {
    const { actorId, sheetId, name } = await createMookWithCustomSkill(game, 2);

    await test.step("the custom skill is visible in the pane at its base value", async () => {
      const entry = game
        .locator(`#${sheetId} ${MOOK_FIELD.skillEntry}`)
        .filter({ hasText: name });
      await expect(entry.locator(MOOK_FIELD.skillRollable)).toHaveText(
        `${name} (+8)`,
      );
    });

    await test.step("focusing the entry and pressing Delete resets it to 0 with no dialog", async () => {
      const entry = game
        .locator(`#${sheetId} ${MOOK_FIELD.skillEntry}`)
        .filter({ hasText: name });
      await entry.focus();
      await game.keyboard.press("Delete");
      await expect(game.locator(".cpr-dialog")).toHaveCount(0);
      await waitForSkillLevel(game, actorId, name, 0);
    });

    await test.step("the entry is gone from the pane on a fresh render", async () => {
      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game
          .locator(`#${freshSheet} ${MOOK_FIELD.skillEntry}`)
          .filter({ hasText: name }),
      ).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the skill display setting renders level, base, and total", async ({
    page: game,
  }) => {
    const { actorId, name } = await createMookWithCustomSkill(game, 2);
    const cases = [
      ["level", "(+2)"],
      ["base", "(+8)"],
      ["total", "(+8)"],
    ];
    try {
      for (const [setting, suffix] of cases) {
        await test.step(`the "${setting}" display renders ${suffix}`, async () => {
          await setSkillDisplaySetting(game, setting);
          const freshSheet = await closeAndReopenMookSheet(game, actorId);
          const entry = game
            .locator(`#${freshSheet} ${MOOK_FIELD.skillEntry}`)
            .filter({ hasText: name });
          await expect(entry.locator(MOOK_FIELD.skillRollable)).toHaveText(
            `${name} ${suffix}`,
          );
        });
      }
    } finally {
      await setSkillDisplaySetting(game, "base");
    }

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the pane lists leveled skills alphabetically with base values", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);

    await test.step("a fresh mook lists exactly the 13 pack-default level-2 skills in name order", async () => {
      const entries = game.locator(
        `#${sheetId} ${MOOK_FIELD.skillsContent} ${MOOK_FIELD.skillRollable}`,
      );
      await expect(entries).toHaveCount(13);
      const texts = await entries.allInnerTexts();
      expect(texts).toEqual([
        "Athletics (+8)",
        "Brawling (+8)",
        "Concentration (+8)",
        "Conversation (+8)",
        "Education (+8)",
        "Evasion (+8)",
        "First Aid (+8)",
        "Human Perception (+8)",
        "Language (Streetslang) (+8)",
        "Local Expert (Your Home) (+8)",
        "Perception (+8)",
        "Persuasion (+8)",
        "Stealth (+8)",
      ]);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("non-core skills show the edit glyph; core skills do not", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);

    await test.step("a fresh mook has exactly one glyph, on Local Expert (Your Home)", async () => {
      const entries = game.locator(`#${sheetId} ${MOOK_FIELD.skillEntry}`);
      await expect(entries.locator(MOOK_FIELD.skillCustomGlyph)).toHaveCount(1);
      const localExpert = entries.filter({
        hasText: "Local Expert (Your Home)",
      });
      await expect(localExpert).toHaveCount(1);
      await expect(localExpert.locator(MOOK_FIELD.skillRollable)).toHaveText(
        "Local Expert (Your Home) (+8)",
      );
      await expect(
        localExpert.locator(MOOK_FIELD.skillCustomGlyph),
      ).toHaveCount(1);
      const athletics = entries.filter({ hasText: "Athletics" });
      await expect(athletics.locator(MOOK_FIELD.skillCustomGlyph)).toHaveCount(
        0,
      );
    });

    let freshSheet = sheetId;
    let skill;
    await test.step("adding a custom skill adds a second glyph with its base value", async () => {
      skill = await addLeveledCustomSkill(game, { actorId, sheetId, level: 3 });
      freshSheet = await closeAndReopenMookSheet(game, actorId);
      const entries = game.locator(`#${freshSheet} ${MOOK_FIELD.skillEntry}`);
      await expect(entries.locator(MOOK_FIELD.skillCustomGlyph)).toHaveCount(2);
      const custom = entries.filter({ hasText: skill.name });
      await expect(custom).toHaveCount(1);
      await expect(custom.locator(MOOK_FIELD.skillRollable)).toHaveText(
        `${skill.name} (+9)`,
      );
    });

    await test.step("clicking the custom glyph opens the owned skill's item sheet", async () => {
      const entry = game
        .locator(`#${freshSheet} ${MOOK_FIELD.skillEntry}`)
        .filter({ hasText: skill.name });
      await entry.locator(MOOK_FIELD.skillCustomGlyph).click();
      const itemSheetId = await openOwnedItemSheet(game, {
        actorId,
        itemId: skill.embeddedId,
      });
      const settings = await openItemSettings(game, itemSheetId);
      await expect(settings.locator('input[name="system.level"]')).toHaveValue(
        "3",
      );
      await closeOwnedItemSheet(game, {
        actorId,
        itemId: skill.embeddedId,
      });
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("rolling a visible skill posts its roll card to chat", async ({
    page: game,
  }) => {
    const { actorId, sheetId, name } = await createMookWithCustomSkill(game, 2);

    let messageId = null;
    const messagesBefore = await chatMessageCount(game);

    await test.step("the verify dialog shows the stat and the skill level", async () => {
      const entry = game
        .locator(`#${sheetId} ${MOOK_FIELD.skillEntry}`)
        .filter({ hasText: name });
      await entry.locator(MOOK_FIELD.skillRollable).click();

      const dialog = game.locator(".application").filter({
        has: game.locator('input[name="skillValue"]'),
      });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      const statInput = dialog.locator('input[name="statValue"]');
      await expect(statInput).toBeDisabled();
      await expect(statInput).toHaveValue("6");
      const skillInput = dialog.locator('input[name="skillValue"]');
      await expect(skillInput).toBeDisabled();
      await expect(skillInput).toHaveValue("2");
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 10000 });
    });

    await test.step("confirming posts a skill roll card to chat", async () => {
      messageId = await waitForNewChatMessage(game, messagesBefore, {
        requireRoll: true,
      });
      const rollClass = await game.evaluate(
        (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
        messageId,
      );
      expect(rollClass).toBe("CPRSkillRoll");

      await openSidebarTab(game, "chat");
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator(".rollcard-top")).toContainText(name);
      await expect(card.locator(".rollcard-top")).toContainText("Skill");
    });

    await test.step("the total is the dice plus INT and the skill level", async () => {
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      const total = Number(
        await card.locator(".d10-number-div span.clickable").textContent(),
      );
      const diceSum = await game.evaluate((id) => {
        const term = game.messages.get(id).rolls?.[0]?.dice?.[0];
        return (
          term?.results.reduce((t, r) => t + (r.count ?? r.result), 0) ?? 0
        );
      }, messageId);
      expect(
        total,
        `total ${total} should equal dice ${diceSum} + INT 6 + level 2`,
      ).toBe(diceSum + 6 + 2);
    });

    await test.step("the card details break the total down into INT and skill", async () => {
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await card.locator(".d10-number-div span.clickable").click();
      const details = card.locator(".d10-data-details");
      await expect(details).toBeVisible();
      await expect(details).toContainText("INT + 6");
      await expect(details).toContainText(`${name} + 2`);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
