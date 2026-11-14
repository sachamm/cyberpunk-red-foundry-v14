import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openOwnedItemSheet,
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Skill sheet: the six type-specific Settings fields (skill type, category,
 * difficulty, basic, level, stat) and their persistence. Skills mix in no
 * effects template, so the sheet offers only Description and Settings tabs.
 * The generic item header/description surface is owned by
 * item-sheet-header.spec.mjs; this spec pins what the skill type itself shows:
 * the config-driven option sets and schema defaults, persistence of every
 * field on a world skill, editing an owned skill through its character-sheet
 * row (with the world copy left untouched), and the Observer read-only view.
 */

// selectOptions localizes labels only — the DOM option values are the config
// object keys, so each select must offer exactly these in this order.
const SKILL_TYPE_OPTIONS = [
  "generic",
  "language",
  "localExpert",
  "martialArt",
  "playInstrument",
  "science",
];
const CATEGORY_OPTIONS = [
  "awarenessSkills",
  "bodySkills",
  "controlSkills",
  "educationSkills",
  "fightingSkills",
  "performanceSkills",
  "rangedweaponSkills",
  "socialSkills",
  "techniqueSkills",
];
const DIFFICULTY_OPTIONS = ["typical", "difficult", "role"];
const STAT_OPTIONS = [
  "int",
  "ref",
  "dex",
  "tech",
  "cool",
  "will",
  "move",
  "body",
  "luck",
  "emp",
];

test("a world skill sheet offers only Description and Settings with the six skill fields", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "skill",
    name: uniqueName("skill"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const settings = await openItemSettings(page, sheetId);

  await test.step("the Effects tab is not offered for skills", async () => {
    await expect(settings.locator('a[data-tab="item-effects"]')).toHaveCount(0);
    await expect(
      settings.locator('a[data-tab="item-description"]'),
    ).toHaveCount(1);
    await expect(settings.locator('a[data-tab="item-settings"]')).toHaveCount(
      1,
    );
  });

  await test.step("all six fields render with their schema defaults", async () => {
    await expect(
      settings.locator('select[name="system.skillType"]'),
    ).toHaveValue("generic");
    await expect(
      settings.locator('select[name="system.category"]'),
    ).toHaveValue("awarenessSkills");
    await expect(
      settings.locator('select[name="system.difficulty"]'),
    ).toHaveValue("typical");
    await expect(
      settings.locator('[data-target="system.basic"] i'),
    ).toHaveClass(/fa-circle$/);
    await expect(settings.locator('input[name="system.level"]')).toHaveValue(
      "0",
    );
    await expect(settings.locator('select[name="system.stat"]')).toHaveValue(
      "int",
    );
  });

  await test.step("each select offers exactly the config's option set", async () => {
    for (const [name, options] of Object.entries({
      skillType: SKILL_TYPE_OPTIONS,
      category: CATEGORY_OPTIONS,
      difficulty: DIFFICULTY_OPTIONS,
      stat: STAT_OPTIONS,
    })) {
      const values = await settings
        .locator(`select[name="system.${name}"] option`)
        .evaluateAll((opts) => opts.map((opt) => opt.value));
      expect(values).toEqual(options);
    }
  });
});

test("setting every skill field persists across a hard reopen", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "skill",
    name: uniqueName("skill"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await test.step("set every field to a non-default value", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.skillType",
      value: "martialArt",
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.category",
      value: "bodySkills",
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.difficulty",
      value: "role",
    });
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.basic",
      expected: true,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.level",
      path: "system.level",
      value: 4,
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.stat",
      value: "emp",
    });
  });

  await test.step("every field persists across a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    const settings = await openItemSettings(page, sheetId);
    await expect(
      settings.locator('select[name="system.skillType"]'),
    ).toHaveValue("martialArt");
    await expect(
      settings.locator('select[name="system.category"]'),
    ).toHaveValue("bodySkills");
    await expect(
      settings.locator('select[name="system.difficulty"]'),
    ).toHaveValue("role");
    await expect(
      settings.locator('[data-target="system.basic"] i'),
    ).toHaveClass(/check/);
    await expect(settings.locator('input[name="system.level"]')).toHaveValue(
      "4",
    );
    await expect(settings.locator('select[name="system.stat"]')).toHaveValue(
      "emp",
    );
  });
});

test("an owned skill's level and stat persist when edited on its owned sheet", async ({
  page,
}) => {
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("character"),
  });
  const actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  const skillName = uniqueName("skill");
  const itemId = await createItemViaUI(page, {
    type: "skill",
    name: skillName,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragItemToActorSheet(page, { itemId, sheetId: actorSheetId, actorId });

  const embeddedId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: skillName },
  );

  let ownedSheetId;
  // Skills live on the character's Skills tab and open through their edit
  // pencil (they have no name link), mirroring item-sheet-composition.spec.mjs.
  const openOwnedSkillSettings = async () => {
    if (ownedSheetId)
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });
    await page.locator(`#${actorSheetId} a[data-tab="skills"]`).click();
    const row = page.locator(`#${actorSheetId} [data-item-id="${embeddedId}"]`);
    await expect(row).toBeVisible();
    await row.locator("a.item-edit.skill-custom").first().click();
    ownedSheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: embeddedId,
    });
    return openItemSettings(page, ownedSheetId);
  };

  await test.step("the owned sheet opens from the skills tab edit pencil with the world defaults", async () => {
    const settings = await openOwnedSkillSettings();
    await expect(settings.locator('input[name="system.level"]')).toHaveValue(
      "0",
    );
    await expect(settings.locator('select[name="system.stat"]')).toHaveValue(
      "int",
    );
  });

  await test.step("editing level and stat on the owned sheet persists across a hard reopen", async () => {
    // The owned sheet is still open from the previous step.
    await setItemField(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      name: "system.level",
      path: "system.level",
      value: 3,
    });
    await setItemSelected(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      name: "system.stat",
      value: "cool",
    });

    const reopened = await openOwnedSkillSettings();
    await expect(reopened.locator('input[name="system.level"]')).toHaveValue(
      "3",
    );
    await expect(reopened.locator('select[name="system.stat"]')).toHaveValue(
      "cool",
    );
  });

  await test.step("the world copy keeps its base values", async () => {
    await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });
    const worldSheetId = await reopenItemSheetViaUI(page, itemId);
    const worldSettings = await openItemSettings(page, worldSheetId);
    await expect(
      worldSettings.locator('input[name="system.level"]'),
    ).toHaveValue("0");
    await expect(
      worldSettings.locator('select[name="system.stat"]'),
    ).toHaveValue("int");
  });
});

test("an Observer can read a skill without editing its settings", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = uniqueName("observed-skill");
  const itemId = await createItemViaUI(page, { type: "skill", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  // GM-side non-default values so the observer view has content to pin.
  await setItemSelected(page, {
    sheetId,
    itemId,
    name: "system.skillType",
    value: "language",
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.level",
    path: "system.level",
    value: 2,
  });
  await toggleItemCheckbox(page, {
    sheetId,
    itemId,
    target: "system.basic",
    expected: true,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });

  await page.evaluate(async (id) => {
    const item = game.items.get(id);
    await item.update({
      "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    });
  }, itemId);

  const player = await openPlayerPage(browser, baseURL);
  try {
    const observerSheetId = await reopenItemSheetViaUI(player.page, itemId);
    const settings = await openItemSettings(player.page, observerSheetId);
    await expect
      .soft(settings.locator(".item-header-name-text"))
      .toHaveText(name);

    // Every form control renders disabled with the GM's values.
    for (const [fieldName, value] of [
      ["system.skillType", "language"],
      ["system.category", "awarenessSkills"],
      ["system.difficulty", "typical"],
      ["system.stat", "int"],
    ]) {
      const select = settings.locator(`select[name="${fieldName}"]`);
      await expect.soft(select).toBeDisabled();
      await expect.soft(select).toHaveValue(value);
    }
    const level = settings.locator('input[name="system.level"]');
    await expect.soft(level).toBeDisabled();
    await expect.soft(level).toHaveValue("2");

    // The basic row has no editable guard, so it renders with the GM's check;
    // the anchor can't be disabled and clicking it as a player could fire an
    // update, so only assert the icon.
    await expect
      .soft(settings.locator('[data-target="system.basic"] i'))
      .toHaveClass(/check/);
  } finally {
    await player.context.close();
  }
});
