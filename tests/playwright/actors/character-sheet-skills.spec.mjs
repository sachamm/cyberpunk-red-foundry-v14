import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  addModViaUI,
  chatMessageCount,
  closeActiveEffectConfigViaUI,
  closeAndReopenActorSheet,
  closeDocSheet,
  createEffectViaUI,
  openSidebarTab,
  resolveYesNo,
  waitForActorFields,
  waitForNewChatMessage,
  waitForSkillLevel,
  yesNoDialog,
} from "../../../tools/playwright/ui/index.mjs";
import {
  SKILL_FIELD,
  addSkillToCharacter,
  characterSkillRow,
  chatRollCard,
  confirmRollDialog,
  createCharacterViaUI,
  rollCardTotal,
  rollDiceSum,
  setStatRollLuck,
  skillCategoryHeader,
  skillCategorySection,
  skillRollDialog,
  statValueInput,
  waitForSkillRemoved,
} from "./character-sheet-helpers.mjs";

/*
 * Character skills tab: a fresh character owns the 63 seeded core skills (13 of
 * them level 2), so the pane is populated without any data prep. Custom skills
 * are world items created via their settings sheet and dragged onto the actor.
 * The base column is level + active mods + stat value; all stats default to 6.
 */

installConsoleErrorHarness();

test.describe("Character sheet — skills", () => {
  test("a dragged skill renders in its category with stat pill and base", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let skill;
    await test.step("the seeded level-2 Perception renders in the Awareness column at base 8", async () => {
      const section = skillCategorySection(
        page,
        sheetId,
        "left",
        "awarenessSkills",
      );
      const row = section.locator("li.item", {
        has: page.locator(SKILL_FIELD.rollable("Perception")),
      });
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.statPill)).toHaveText("INT");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("8");
    });

    await test.step("a dragged INT awareness skill at level 2 renders in the same category", async () => {
      skill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "int",
        category: "awarenessSkills",
        level: 2,
      });
      const section = skillCategorySection(
        page,
        sheetId,
        "left",
        "awarenessSkills",
      );
      const row = section.locator("li.item", {
        has: page.locator(SKILL_FIELD.rollable(skill.name)),
      });
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute(
        "data-skill-category",
        "awarenessSkills",
      );
      await expect(row.locator(SKILL_FIELD.statPill)).toHaveText("INT");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("8");
    });

    await test.step("the row and its base persist on a fresh render", async () => {
      const freshSheet = await closeAndReopenActorSheet(page, actorId);
      const section = skillCategorySection(
        page,
        freshSheet,
        "left",
        "awarenessSkills",
      );
      const row = section.locator("li.item", {
        has: page.locator(SKILL_FIELD.rollable(skill.name)),
      });
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("8");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("an inline level edit updates the base, persists, and feeds the roll", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let skill;
    let freshSheet = sheetId;
    await test.step("a dragged INT awareness skill at level 0 shows base 6", async () => {
      skill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "int",
        category: "awarenessSkills",
        level: 0,
      });
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.levelInput)).toHaveValue("0");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("6");
    });

    const messagesBefore = await chatMessageCount(page);
    let messageId;
    await test.step("setting the level to 3 updates the base immediately", async () => {
      const input = characterSkillRow(page, freshSheet, skill.name).locator(
        SKILL_FIELD.levelInput,
      );
      await input.fill("3");
      await input.press("Tab");
      await waitForSkillLevel(page, actorId, skill.name, 3);
      await expect(
        characterSkillRow(page, freshSheet, skill.name).locator(
          SKILL_FIELD.base,
        ),
      ).toHaveText("9");
    });

    await test.step("level 3 and base 9 persist on a fresh render", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.levelInput)).toHaveValue("3");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("9");
    });

    await test.step("ctrl-clicking the skill rolls dice + INT + level", async () => {
      await characterSkillRow(page, freshSheet, skill.name)
        .locator(SKILL_FIELD.rollable(skill.name))
        .click({ modifiers: CTRL_CLICK_MODIFIERS });
      messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });
      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator(".rollcard-top")).toContainText(skill.name);

      const total = await rollCardTotal(card);
      const diceSum = await rollDiceSum(page, messageId);
      expect(
        total,
        `total ${total} should equal dice ${diceSum} + INT 6 + level 3`,
      ).toBe(diceSum + 6 + 3);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("ctrl-clicking a skill rolls without the verify dialog", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const messagesBefore = await chatMessageCount(page);

    let messageId;
    await test.step("ctrl-clicking the seeded Handgun posts a roll card without opening the dialog", async () => {
      const row = characterSkillRow(page, sheetId, "Handgun");
      await expect(row).toHaveCount(1);
      await row.locator(SKILL_FIELD.rollable("Handgun")).click({
        modifiers: CTRL_CLICK_MODIFIERS,
      });
      messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });
      await expect(skillRollDialog(page)).toHaveCount(0);
    });

    await test.step("the card is a skill roll attributed to the actor", async () => {
      const rollClass = await page.evaluate(
        (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
        messageId,
      );
      expect(rollClass).toBe("CPRSkillRoll");

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator(".rollcard-top")).toContainText("Handgun");
      await expect(card.locator(".rollcard-top")).toContainText("Skill");
    });

    await test.step("the total is the dice plus REF (level 0)", async () => {
      const card = chatRollCard(page, messageId);
      const total = await rollCardTotal(card);
      const diceSum = await rollDiceSum(page, messageId);
      expect(total, `total ${total} should equal dice ${diceSum} + REF 6`).toBe(
        diceSum + 6,
      );
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("clicking a skill opens the verify dialog and Cancel discards the roll", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const messagesBefore = await chatMessageCount(page);

    let dialog;
    await test.step("a plain click on Perception opens the verify dialog with stat and skill locked", async () => {
      const row = characterSkillRow(page, sheetId, "Perception");
      await expect(row).toHaveCount(1);
      await row.locator(SKILL_FIELD.rollable("Perception")).click();

      dialog = skillRollDialog(page);
      await expect(dialog).toBeVisible({ timeout: 10000 });
      const statInput = dialog.locator('input[name="statValue"]');
      await expect(statInput).toBeDisabled();
      await expect(statInput).toHaveValue("6");
      const skillInput = dialog.locator('input[name="skillValue"]');
      await expect(skillInput).toBeDisabled();
      await expect(skillInput).toHaveValue("2");
      await expect(dialog.locator('input[name="luck"]')).toBeVisible();
    });

    await test.step("cancelling closes the dialog without posting a roll", async () => {
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
      expect(await chatMessageCount(page)).toBe(messagesBefore);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("confirming the verify dialog posts a skill roll, and LUCK is consumed on a second roll", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);
    const messagesBefore = await chatMessageCount(page);
    const luckBefore = await page.evaluate(
      (id) => game.actors.get(id).system.stats.luck.value,
      actorId,
    );
    expect(luckBefore).toBeGreaterThanOrEqual(2);

    let dialog;
    await test.step("a plain click on Perception opens the verify dialog with LUCK at zero", async () => {
      const row = characterSkillRow(page, sheetId, "Perception");
      await expect(row).toHaveCount(1);
      await row.locator(SKILL_FIELD.rollable("Perception")).click();

      dialog = skillRollDialog(page);
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await expect(dialog.locator('input[name="luck"]')).toHaveValue("0");
    });

    let messageId;
    await test.step("confirming without LUCK posts a dice + INT + level roll and leaves LUCK unchanged", async () => {
      await confirmRollDialog(dialog);
      messageId = await waitForNewChatMessage(page, messagesBefore, {
        requireRoll: true,
      });
      const rollClass = await page.evaluate(
        (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
        messageId,
      );
      expect(rollClass).toBe("CPRSkillRoll");

      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, messageId);
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator(".rollcard-top")).toContainText("Perception");

      const total = await rollCardTotal(card);
      const diceSum = await rollDiceSum(page, messageId);
      expect(
        total,
        `total ${total} should equal dice ${diceSum} + INT 6 + level 2`,
      ).toBe(diceSum + 8);
      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": luckBefore,
      });
    });

    await test.step("a second confirmed roll with LUCK 2 adds the LUCK and consumes it", async () => {
      await openSidebarTab(page, "actors");
      const messagesBeforeSecond = await chatMessageCount(page);
      await characterSkillRow(page, sheetId, "Perception")
        .locator(SKILL_FIELD.rollable("Perception"))
        .click();

      dialog = skillRollDialog(page);
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await setStatRollLuck(dialog, 2);
      await confirmRollDialog(dialog);

      const secondMessageId = await waitForNewChatMessage(
        page,
        messagesBeforeSecond,
        { requireRoll: true },
      );
      await openSidebarTab(page, "chat");
      const card = chatRollCard(page, secondMessageId);
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator(".rollcard-top")).toContainText("Perception");

      const total = await rollCardTotal(card);
      const diceSum = await rollDiceSum(page, secondMessageId);
      expect(
        total,
        `total ${total} should equal dice ${diceSum} + INT 6 + level 2 + LUCK 2`,
      ).toBe(diceSum + 10);
      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": luckBefore - 2,
      });
    });

    await test.step("the sheet shows the spent LUCK, live and after reopening", async () => {
      // The still-open sheet must reflect the spend in place; asserting only the
      // actor value would let a stale input pass.
      await expect(
        page.locator(`#${sheetId} ${statValueInput("luck")}`),
      ).toHaveValue(String(luckBefore - 2));

      // A fresh render from the document must agree.
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${statValueInput("luck")}`),
      ).toHaveValue(String(luckBefore - 2));
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the favorite glyph pins a skill and survives rerenders", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let skill;
    let freshSheet = sheetId;
    await test.step("a dragged custom skill is unpinned at first", async () => {
      skill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "int",
        category: "awarenessSkills",
      });
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator("i.fa-thumbtack.unpinned")).toHaveCount(1);
    });

    await test.step("clicking the glyph pins it", async () => {
      await characterSkillRow(page, freshSheet, skill.name)
        .locator(SKILL_FIELD.favoriteGlyph)
        .click();
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row.locator("i.fa-thumbtack.pinned")).toHaveCount(1);
      await expect(row).toHaveClass(/favorite/);
    });

    await test.step("the pin persists on a fresh render", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator("i.fa-thumbtack.pinned")).toHaveCount(1);
    });

    await test.step("clicking again unpins it, and that persists too", async () => {
      await characterSkillRow(page, freshSheet, skill.name)
        .locator(SKILL_FIELD.favoriteGlyph)
        .click();
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row.locator("i.fa-thumbtack.unpinned")).toHaveCount(1);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the category +/- glyph collapses/expands and keeps pinned skills visible", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let pinnedSkill;
    let unpinnedSkill;
    let freshSheet = sheetId;
    await test.step("two dragged body skills render under the expanded header", async () => {
      pinnedSkill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "body",
        category: "bodySkills",
      });
      unpinnedSkill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "body",
        category: "bodySkills",
      });

      const header = skillCategoryHeader(page, freshSheet, "bodySkills");
      await expect(header.locator("i.fa-minus.expand-icon")).toBeVisible();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeHidden();
      for (const skill of [pinnedSkill, unpinnedSkill]) {
        const row = characterSkillRow(page, freshSheet, skill.name);
        await expect(row).toHaveCount(1);
        await expect(row).toBeVisible();
      }
    });

    await test.step("pinning one skill leaves the other unpinned", async () => {
      const pinnedRow = characterSkillRow(page, freshSheet, pinnedSkill.name);
      await pinnedRow.locator(SKILL_FIELD.favoriteGlyph).click();
      await expect(pinnedRow.locator("i.fa-thumbtack.pinned")).toHaveCount(1);
      await expect(pinnedRow).toHaveClass(/favorite/);

      const unpinnedRow = characterSkillRow(
        page,
        freshSheet,
        unpinnedSkill.name,
      );
      await expect(unpinnedRow.locator("i.fa-thumbtack.unpinned")).toHaveCount(
        1,
      );
    });

    await test.step("collapsing hides the unpinned skill but keeps the pinned skill visible", async () => {
      const header = skillCategoryHeader(page, freshSheet, "bodySkills");
      await header.click();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeVisible();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeHidden();

      await expect(
        characterSkillRow(page, freshSheet, unpinnedSkill.name),
      ).toBeHidden();
      await expect(
        characterSkillRow(page, freshSheet, pinnedSkill.name),
      ).toBeVisible();
    });

    await test.step("expanding brings both skills back", async () => {
      const header = skillCategoryHeader(page, freshSheet, "bodySkills");
      await header.click();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeVisible();
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeHidden();

      for (const skill of [pinnedSkill, unpinnedSkill]) {
        await expect(
          characterSkillRow(page, freshSheet, skill.name),
        ).toBeVisible();
      }
    });

    await test.step("the collapsed state and pinned exception persist on a fresh render", async () => {
      await skillCategoryHeader(page, freshSheet, "bodySkills").click();
      freshSheet = await closeAndReopenActorSheet(page, actorId);

      const header = skillCategoryHeader(page, freshSheet, "bodySkills");
      await expect(header.locator("i.fa-plus.collapse-icon")).toBeVisible();
      await expect(header.locator("i.fa-minus.expand-icon")).toBeHidden();
      await expect(
        characterSkillRow(page, freshSheet, unpinnedSkill.name),
      ).toBeHidden();
      await expect(
        characterSkillRow(page, freshSheet, pinnedSkill.name),
      ).toBeVisible();
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("custom skills show edit and delete glyphs; core skills do not", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let skill;
    let freshSheet = sheetId;
    await test.step("the seeded core Handgun has no custom-skill glyphs", async () => {
      const row = characterSkillRow(page, freshSheet, "Handgun");
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.editGlyph)).toHaveCount(0);
      await expect(row.locator(SKILL_FIELD.deleteGlyph)).toHaveCount(0);
    });

    await test.step("the seeded non-core Local Expert (Your Home) has both glyphs", async () => {
      const row = characterSkillRow(
        page,
        freshSheet,
        "Local Expert (Your Home)",
      );
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.editGlyph)).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.deleteGlyph)).toHaveCount(1);
    });

    await test.step("a dragged custom skill has both glyphs", async () => {
      skill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "int",
        category: "awarenessSkills",
      });
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.editGlyph)).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.deleteGlyph)).toHaveCount(1);
    });

    await test.step("delete asks for confirmation; declining keeps the row", async () => {
      await characterSkillRow(page, freshSheet, skill.name)
        .locator(SKILL_FIELD.deleteGlyph)
        .click();
      const dialog = yesNoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await resolveYesNo(dialog, "no");
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
      await expect(characterSkillRow(page, freshSheet, skill.name)).toHaveCount(
        1,
      );
    });

    await test.step("confirming the delete removes the skill on a fresh render", async () => {
      await characterSkillRow(page, freshSheet, skill.name)
        .locator(SKILL_FIELD.deleteGlyph)
        .click();
      const dialog = yesNoDialog(page);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await resolveYesNo(dialog, "yes");
      await waitForSkillRemoved(page, actorId, skill.name);

      freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(characterSkillRow(page, freshSheet, skill.name)).toHaveCount(
        0,
      );
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("skill-modifying effects persist, with permanent MODs visible and situational MODs in the tooltip", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let skill;
    let freshSheet = sheetId;

    const createSkillModEffect = async ({ situational = false } = {}) => {
      const sheet = page.locator(`#${freshSheet}`);
      await sheet.locator('.navtabs-right [data-tab="effects"]').click();
      const { aeConfig, effectId } = await createEffectViaUI(page, sheet, {
        ownerType: "actor",
        ownerId: actorId,
      });

      await aeConfig.locator('nav [data-tab="changes"]').click();
      const row = await addModViaUI(aeConfig);
      const skillKey = await row
        .locator(".key-key option", { hasText: skill.name })
        .getAttribute("value");

      await row.locator(".key-key").selectOption(skillKey);
      await row.locator(".change-value input").fill("2");
      await row.locator(".change-value input").dispatchEvent("change");
      if (situational) {
        await row.locator(".toggle-situational").check();
        await row.locator(".toggle-on-by-default").check();
      }

      await page.waitForFunction(
        ({ aid, eid, key, isSituational }) => {
          const effect = game.actors.get(aid)?.effects?.get(eid);
          const change = effect?.changes?.[0];
          if (!effect || !change) return false;
          const hasSituationalFlag = Boolean(
            effect.getFlag(
              game.system.id,
              "changes.situational.0.isSituational",
            ),
          );
          const hasOnByDefaultFlag = Boolean(
            effect.getFlag(game.system.id, "changes.situational.0.onByDefault"),
          );
          return (
            change.key === key &&
            change.value === "2" &&
            hasSituationalFlag === isSituational &&
            hasOnByDefaultFlag === isSituational
          );
        },
        {
          aid: actorId,
          eid: effectId,
          key: skillKey,
          isSituational: situational,
        },
      );
      await closeActiveEffectConfigViaUI(page, aeConfig);

      return { skillKey };
    };

    await test.step("a dragged INT awareness skill at level 0 shows an 0 in the MOD column", async () => {
      skill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "int",
        category: "awarenessSkills",
        level: 0,
      });
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator(".skill-mod-value")).toHaveClass(
        /zero-not-visible/,
      );
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("6");
    });

    await test.step("a +2 permanent skill effect persists and shows in the MOD field", async () => {
      const { skillKey } = await createSkillModEffect();
      expect(skillKey).toMatch(/^bonuses\./);

      await page
        .locator(`#${freshSheet}`)
        .locator('.navtabs-right [data-tab="skills"]')
        .click();
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row.locator(SKILL_FIELD.modValue)).toHaveText("2");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("8");
      const tooltip = await row
        .locator(SKILL_FIELD.modValue)
        .getAttribute("data-tooltip");
      expect(tooltip).toContain(skill.name);
      expect(tooltip).toContain("+2");
      expect(tooltip).not.toContain("*");
    });

    await test.step("a +2 situational skill effect persists with the right key and value", async () => {
      const { skillKey } = await createSkillModEffect({ situational: true });
      expect(skillKey).toMatch(/^bonuses\./);
    });

    await test.step("the skills tab shows the permanent MOD value and the situational tooltip marker", async () => {
      await page
        .locator(`#${freshSheet}`)
        .locator('.navtabs-right [data-tab="skills"]')
        .click();
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row.locator(SKILL_FIELD.modValue)).toHaveText("2");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("8");
      const tooltip = await row
        .locator(SKILL_FIELD.modValue)
        .getAttribute("data-tooltip");
      expect(tooltip).toContain(skill.name);
      expect(tooltip).toContain("+2*");
    });

    await test.step("both effects persist on a fresh render", async () => {
      freshSheet = await closeAndReopenActorSheet(page, actorId);
      const row = characterSkillRow(page, freshSheet, skill.name);
      await expect(row.locator(SKILL_FIELD.modValue)).toHaveText("2");
      await expect(row.locator(SKILL_FIELD.base)).toHaveText("8");
      const tooltip = await row
        .locator(SKILL_FIELD.modValue)
        .getAttribute("data-tooltip");
      expect(tooltip).toContain(skill.name);
      expect(tooltip).toContain("+2*");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("a difficult skill shows the (x2) marker next to its name", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let skill;
    await test.step("a dragged skill with difficulty difficult renders with the marker", async () => {
      skill = await addSkillToCharacter(page, {
        actorId,
        sheetId,
        stat: "int",
        category: "awarenessSkills",
        difficulty: "difficult",
      });
      const row = characterSkillRow(page, sheetId, skill.name);
      await expect(row).toHaveCount(1);
      await expect(row.locator(SKILL_FIELD.rollable(skill.name))).toHaveText(
        `${skill.name} (x2)`,
      );
    });

    await test.step("the marker persists on a fresh render", async () => {
      const freshSheet = await closeAndReopenActorSheet(page, actorId);
      await expect(
        characterSkillRow(page, freshSheet, skill.name).locator(
          SKILL_FIELD.rollable(skill.name),
        ),
      ).toHaveText(`${skill.name} (x2)`);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});
