import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  addModViaUI,
  activateGearTab,
  clickEffectActionViaUI,
  closeActiveEffectConfigViaUI,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createDocumentViaUI,
  createEffectViaUI,
  createItemViaUI,
  deleteItemViaUI,
  deleteModViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  getEffectRowViaUI,
  hoverGearRow,
  openOwnedItemSheet,
  reopenActorSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

async function cycleEquipState(page, { actorSheetId, actorId, itemId, state }) {
  const gear = await activateGearTab(page, actorSheetId);
  const row = await hoverGearRow(gear, itemId);
  await row.locator("a.equip").click();
  await page.waitForFunction(
    ({ actorId: aid, itemId: iid, state: expected }) =>
      game.actors.get(aid).items.get(iid).system.equipped === expected,
    { actorId, itemId, state },
  );
}

// The yes/no confirmation dialog shown by destructive actions (e.g. deleting an
// effect while deleteItemConfirmation is on). Returns the dialog locator; the
// spec owns every visibility/text assertion. Dismiss it with resolveYesNo.
function yesNoDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator(".cpr-dialog-message"),
  });
}

async function resolveYesNo(dialog, action) {
  await dialog.locator(`button[data-action="${action}"]`).click();
}

/*
 * The Active Effect config sheet (CPRActiveEffectSheet) replaces Foundry's generic
 * "Changes" tab with CPR's modifier UI: a category select + a category-aware key
 * input, plus situational / on-by-default toggles. Drive the real UI to add a
 * modifier, apply it from an equipped item, and assert the CPR theme/layout. This
 * guards against both the sheet falling back to Foundry's default changes editor
 * and the carried/equipped usage flow being lost during the V2 migration.
 */
test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Active Effect sheet (ApplicationV2)", () => {
  test("adds a CPR modifier and uses the CPR sheet theme", async ({
    page: game,
  }) => {
    const pageErrors = [];
    game.on("pageerror", (error) => pageErrors.push(error.message));

    const name = uniqueName("gear");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name,
    });
    expect(itemId).toBeTruthy();

    // The gear sheet opens on creation; open its Effects tab and add an effect.
    const itemSheet = game.locator(`#CPRItemSheet-Item-${itemId}`);
    await expect(itemSheet).toBeVisible();
    await itemSheet.locator('.navtabs-item [data-tab="item-effects"]').click();
    await itemSheet.locator('.effect-control[data-action="create"]').click();

    // Creating the effect opens its config (an ApplicationV2 active-effect-config).
    const aeConfig = game.locator(".application.active-effect-config");
    await expect(aeConfig).toBeVisible();

    // Switch to the CPR Changes tab and add a modifier.
    await aeConfig.locator('nav [data-tab="changes"]').click();
    await aeConfig.locator('[data-action="addMod"]').click();

    // The CPR row exposes a key-category select and a category-aware key input —
    // not Foundry's raw "Attribute Key" text field.
    const row = aeConfig.locator(".changes-list > li").first();
    await expect(row).toBeVisible();
    await expect(row.locator(".effect-key-category select")).toBeVisible();
    await expect(row.locator(".key-key, .key-input")).toHaveCount(1);

    // The config is one of CPR's explicitly themed windows. Foundry's native
    // active-effect grid must not override the custom six-column flex layout.
    await expect(aeConfig).toHaveClass(/active-effect-sheet/);
    const theme = await aeConfig.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--cpr-background-window)";
      probe.style.color = "var(--cpr-text-normal)";
      probe.style.fontFamily = "var(--cpr-font-primary)";
      probe.style.border = "1px solid var(--cpr-color-medium-grey)";
      probe.style.outline = "2px solid var(--cpr-text-foundry-hover)";
      document.body.append(probe);
      const buttonProbe = document.createElement("div");
      buttonProbe.style.backgroundColor = "var(--cpr-background-foundry-input)";
      document.body.append(buttonProbe);
      const expectedStyle = getComputedStyle(probe);
      const contentStyle = getComputedStyle(
        element.querySelector(".window-content"),
      );
      const header = element.querySelector(".change-header");
      const actionHeader = header.querySelector(".change-actions");
      const changeRow = element.querySelector(".changes-list > li");
      const actionCell = changeRow.querySelector(".change-actions");
      const situationalCell = changeRow.querySelector(".situational");
      const situationalCheckbox = situationalCell.querySelector(
        'input[type="checkbox"]',
      );
      const onByDefaultCell = changeRow.querySelector(".on-by-default");
      const onByDefaultCheckbox = onByDefaultCell.querySelector(
        'input[type="checkbox"]',
      );
      const windowHeaderButton = element.querySelector(".window-header button");
      const valueInput = element.querySelector('input[name="changes.0.value"]');
      const categorySelect = changeRow.querySelector(".key-cat");
      const valueInputStyle = getComputedStyle(valueInput);
      const categorySelectStyle = getComputedStyle(categorySelect);
      const isContained = (child, parent) => {
        const childRect = child.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        return (
          childRect.left >= parentRect.left - 1 &&
          childRect.right <= parentRect.right + 1
        );
      };
      const horizontalCenterOffset = (child, parent) => {
        const childRect = child.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const childCenter = (childRect.left + childRect.right) / 2;
        const parentCenter = (parentRect.left + parentRect.right) / 2;
        return Math.abs(childCenter - parentCenter);
      };
      const result = {
        backgroundColor: contentStyle.backgroundColor,
        color: contentStyle.color,
        fontFamily: contentStyle.fontFamily,
        expectedBackgroundColor: expectedStyle.backgroundColor,
        expectedColor: expectedStyle.color,
        expectedFontFamily: expectedStyle.fontFamily,
        expectedControlBorderColor: expectedStyle.borderTopColor,
        expectedFocusOutlineColor: expectedStyle.outlineColor,
        headerDisplay: getComputedStyle(header).display,
        rowDisplay: getComputedStyle(changeRow).display,
        actionHeaderContained: isContained(actionHeader, header),
        actionCellContained: isContained(actionCell, changeRow),
        situationalCheckboxCenterOffset: horizontalCenterOffset(
          situationalCheckbox,
          situationalCell,
        ),
        onByDefaultCheckboxCenterOffset: horizontalCenterOffset(
          onByDefaultCheckbox,
          onByDefaultCell,
        ),
        windowHeaderButtonBackground:
          getComputedStyle(windowHeaderButton).backgroundColor,
        cprButtonBackground: getComputedStyle(buttonProbe).backgroundColor,
        valueInputBorderColor: valueInputStyle.borderTopColor,
        valueInputBorderStyle: valueInputStyle.borderTopStyle,
        valueInputBoxShadow: valueInputStyle.boxShadow,
        valueInputOutlineStyle: valueInputStyle.outlineStyle,
        categorySelectBorderColor: categorySelectStyle.borderTopColor,
        categorySelectBoxShadow: categorySelectStyle.boxShadow,
      };
      probe.remove();
      buttonProbe.remove();
      return result;
    });
    expect(theme.backgroundColor).toBe(theme.expectedBackgroundColor);
    expect(theme.color).toBe(theme.expectedColor);
    expect(theme.fontFamily).toBe(theme.expectedFontFamily);
    expect(theme.headerDisplay).toBe("flex");
    expect(theme.rowDisplay).toBe("flex");
    expect(theme.actionHeaderContained).toBe(true);
    expect(theme.actionCellContained).toBe(true);
    expect(theme.situationalCheckboxCenterOffset).toBeLessThanOrEqual(1);
    expect(theme.onByDefaultCheckboxCenterOffset).toBeLessThanOrEqual(1);
    // Native ApplicationV2 window controls keep Foundry's transparent header
    // treatment instead of receiving the content-button background.
    expect(theme.windowHeaderButtonBackground).toBe("rgba(0, 0, 0, 0)");
    expect(theme.windowHeaderButtonBackground).not.toBe(
      theme.cprButtonBackground,
    );
    expect(theme.valueInputBorderStyle).toBe("solid");
    expect(theme.valueInputBorderColor).toBe(theme.expectedControlBorderColor);
    expect(theme.valueInputBoxShadow).toBe("none");
    expect(theme.valueInputOutlineStyle).toBe("none");
    expect(theme.categorySelectBorderColor).toBe(
      theme.expectedControlBorderColor,
    );
    expect(theme.categorySelectBoxShadow).toBe("none");

    const effectId = await game.evaluate(
      (id) => game.items.get(id).effects.contents[0].id,
      itemId,
    );
    await row.locator(".key-cat").selectOption("combat");
    await game.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.0") === "combat",
      { itemId, effectId },
    );
    await row.locator(".key-key").selectOption("bonuses.maxHp");
    await game.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[0].key === "bonuses.maxHp",
      { itemId, effectId },
    );

    const valueInput = aeConfig.locator('input[name="changes.0.value"]');
    await valueInput.fill("2");
    await expect(valueInput).toHaveCSS(
      "outline-color",
      theme.expectedFocusOutlineColor,
    );
    const focusedInputStyle = await valueInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focusedInputStyle.outlineColor).toBe(
      theme.expectedFocusOutlineColor,
    );
    expect(focusedInputStyle.outlineStyle).toBe("solid");
    expect(focusedInputStyle.outlineWidth).toBe("2px");
    await valueInput.press("Tab");
    await game.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[0].value === "2",
      { itemId, effectId },
    );

    // Item effects still expose the CPR usage choices and persist carried /
    // equipped selection through the ApplicationV2 item sheet.
    await aeConfig.locator('[data-action="close"]').click();
    const usage = itemSheet.locator('select[name="system.usage"]');
    await expect(usage).toBeVisible();
    await expect(usage.locator('option[value="carried"]')).toHaveCount(1);
    await expect(usage.locator('option[value="equipped"]')).toHaveCount(1);
    await usage.selectOption("carried");
    await game.waitForFunction(
      (id) => game.items.get(id).system.usage === "carried",
      itemId,
    );
    await usage.selectOption("equipped");
    await game.waitForFunction(
      (id) => game.items.get(id).system.usage === "equipped",
      itemId,
    );

    // Once the item is owned by an actor, its effect remains suppressed while
    // owned/carried and becomes applicable only when the item is equipped.
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("character"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });
    await dragItemToActorSheet(game, {
      itemId,
      sheetId: actorSheetId,
      actorId,
    });
    const embeddedItemId = await game.evaluate(
      ({ actorId: aid, name: itemName }) =>
        game.actors.get(aid).items.find((item) => item.name === itemName).id,
      { actorId, name },
    );
    await game.waitForFunction(
      ({ actorId: aid, itemId: iid }) =>
        game.actors.get(aid).items.get(iid).effects.contents[0].system
          .isSuppressed === true && game.actors.get(aid).bonuses.maxHp === 0,
      { actorId, itemId: embeddedItemId },
    );

    await cycleEquipState(game, {
      actorSheetId,
      actorId,
      itemId: embeddedItemId,
      state: "carried",
    });
    await game.waitForFunction(
      ({ actorId: aid, itemId: iid }) =>
        game.actors.get(aid).items.get(iid).effects.contents[0].system
          .isSuppressed === true && game.actors.get(aid).bonuses.maxHp === 0,
      { actorId, itemId: embeddedItemId },
    );

    await cycleEquipState(game, {
      actorSheetId,
      actorId,
      itemId: embeddedItemId,
      state: "equipped",
    });
    await game.waitForFunction(
      ({ actorId: aid, itemId: iid }) =>
        game.actors.get(aid).items.get(iid).effects.contents[0].system
          .isSuppressed === false && game.actors.get(aid).bonuses.maxHp === 2,
      { actorId, itemId: embeddedItemId },
    );

    expect(pageErrors).toEqual([]);

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("offers owned and unowned world skills as modifier keys without polluting the core skill list", async ({
    page: game,
  }) => {
    const ownedSkillName = uniqueName("skill");
    const worldSkillName = uniqueName("skill");
    let actorId;
    let actorSheetId;
    let ownedSkillId;
    let otherId;

    await test.step("create two world skills and give one to a character", async () => {
      ownedSkillId = await createItemViaUI(game, {
        type: "skill",
        name: ownedSkillName,
      });
      const worldSkillId = await createItemViaUI(game, {
        type: "skill",
        name: worldSkillName,
      });
      expect(ownedSkillId).toBeTruthy();
      expect(worldSkillId).toBeTruthy();

      actorId = await createActorViaUI(game, {
        type: "character",
        name: uniqueName("character"),
      });
      actorSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });
      await dragItemToActorSheet(game, {
        itemId: ownedSkillId,
        sheetId: actorSheetId,
        actorId,
      });
    });

    const readKeyOptions = (row) =>
      row.locator(".key-key option").evaluateAll((options) =>
        options.map((option) => ({
          value: option.value,
          label: option.textContent,
        })),
      );

    await test.step("an actor effect lists owned and unowned world skills", async () => {
      const actorSheet = game.locator(`#${actorSheetId}`);
      await actorSheet.locator('.navtabs-right [data-tab="effects"]').click();
      await actorSheet
        .locator(".effects-tab.active .effect-control[data-action='create']")
        .click();

      const aeConfig = game.locator(".application.active-effect-config");
      await expect(aeConfig).toBeVisible();
      await aeConfig.locator('nav [data-tab="changes"]').click();
      await aeConfig.locator('[data-action="addMod"]').click();

      const row = aeConfig.locator(".changes-list > li").first();
      await expect(row).toBeVisible();
      const options = await readKeyOptions(row);
      expect(options.some((o) => o.label === ownedSkillName)).toBe(true);
      expect(options.some((o) => o.label === worldSkillName)).toBe(true);
      expect(options.some((o) => o.label === "Archery")).toBe(true);
    });

    await test.step("selecting an unowned skill persists and renders its name", async () => {
      const aeConfig = game.locator(".application.active-effect-config");
      const row = aeConfig.locator(".changes-list > li").first();
      const options = await readKeyOptions(row);
      const worldSkillKey = options.find(
        (o) => o.label === worldSkillName,
      ).value;
      expect(worldSkillKey).toMatch(/^bonuses\./);

      const effectId = await game.evaluate(
        (id) => game.actors.get(id).effects.contents[0].id,
        actorId,
      );
      await row.locator(".key-key").selectOption(worldSkillKey);
      await game.waitForFunction(
        ({ id: aid, effectId: eid, key }) =>
          game.actors.get(aid).effects.get(eid).changes[0].key === key,
        { id: actorId, effectId, key: worldSkillKey },
      );

      await aeConfig.locator('[data-action="close"]').click();
      await expect(aeConfig).toBeHidden();
      await closeDocSheet(game, { collection: "actors", id: actorId });
      actorSheetId = await reopenActorSheetViaUI(game, actorId);

      const freshSheet = game.locator(`#${actorSheetId}`);
      await freshSheet.locator('.navtabs-right [data-tab="effects"]').click();
      await expect(
        freshSheet
          .locator(".effects-tab li.effect .text-pill")
          .filter({ hasText: worldSkillName }),
      ).toBeVisible();
    });

    await test.step("an owned item effect lists the owner's and world skills", async () => {
      const gearName = uniqueName("gear");
      const gearId = await createItemViaUI(game, {
        type: "gear",
        name: gearName,
      });
      expect(gearId).toBeTruthy();
      await closeDocSheet(game, { collection: "items", id: gearId });

      await dragItemToActorSheet(game, {
        itemId: gearId,
        sheetId: actorSheetId,
        actorId,
      });
      const ownedGearId = await game.evaluate(
        ({ id: aid, name }) =>
          game.actors.get(aid).items.find((item) => item.name === name).id,
        { id: actorId, name: gearName },
      );

      const gear = await activateGearTab(game, actorSheetId);
      const gearRow = await hoverGearRow(gear, ownedGearId);
      await gearRow.locator(".item-edit").click();
      const itemSheetId = await openOwnedItemSheet(game, {
        actorId,
        itemId: ownedGearId,
      });

      const itemSheet = game.locator(`#${itemSheetId}`);
      await itemSheet
        .locator('.navtabs-item [data-tab="item-effects"]')
        .click();
      await itemSheet.locator('.effect-control[data-action="create"]').click();

      const aeConfig = game.locator(".application.active-effect-config");
      await expect(aeConfig).toBeVisible();
      await aeConfig.locator('nav [data-tab="changes"]').click();
      await aeConfig.locator('[data-action="addMod"]').click();

      const modRow = aeConfig.locator(".changes-list > li").first();
      await expect(modRow).toBeVisible();
      const options = await readKeyOptions(modRow);
      expect(options.some((o) => o.label === ownedSkillName)).toBe(true);
      expect(options.some((o) => o.label === worldSkillName)).toBe(true);

      await aeConfig.locator('[data-action="close"]').click();
      await expect(aeConfig).toBeHidden();
      await closeOwnedItemSheet(game, { actorId, itemId: ownedGearId });
    });

    await test.step("deleting the world skill leaves only the owner's copy visible", async () => {
      await deleteItemViaUI(game, ownedSkillId);

      const stillOwned = await game.evaluate(
        ({ id: aid, name }) =>
          game.actors.get(aid).items.some((item) => item.name === name),
        { id: actorId, name: ownedSkillName },
      );
      expect(stillOwned).toBe(true);

      otherId = await createActorViaUI(game, {
        type: "character",
        name: uniqueName("character"),
      });
      const otherSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: otherId,
      });
      const otherSheet = game.locator(`#${otherSheetId}`);
      await otherSheet.locator('.navtabs-right [data-tab="effects"]').click();
      await otherSheet
        .locator(".effects-tab.active .effect-control[data-action='create']")
        .click();

      const aeConfig = game.locator(".application.active-effect-config");
      await expect(aeConfig).toBeVisible();
      await aeConfig.locator('nav [data-tab="changes"]').click();
      await aeConfig.locator('[data-action="addMod"]').click();

      const modRow = aeConfig.locator(".changes-list > li").first();
      await expect(modRow).toBeVisible();
      const options = await readKeyOptions(modRow);
      expect(options.some((o) => o.label === worldSkillName)).toBe(true);
      expect(options.some((o) => o.label === ownedSkillName)).toBe(false);

      await aeConfig.locator('[data-action="close"]').click();
      await expect(aeConfig).toBeHidden();
    });

    await test.step("the owner's embedded-only skill is offered and its name resolves", async () => {
      await closeDocSheet(game, { collection: "actors", id: otherId });
      const actorSheet = game.locator(`#${actorSheetId}`);
      await actorSheet.locator('.navtabs-right [data-tab="effects"]').click();
      await actorSheet
        .locator(".effects-tab.active .effect-control[data-action='create']")
        .click();

      const aeConfig = game.locator(".application.active-effect-config");
      await expect(aeConfig).toBeVisible();
      await aeConfig.locator('nav [data-tab="changes"]').click();
      await aeConfig.locator('[data-action="addMod"]').click();

      const row = aeConfig.locator(".changes-list > li").first();
      await expect(row).toBeVisible();
      const options = await readKeyOptions(row);
      expect(options.some((o) => o.label === ownedSkillName)).toBe(true);
      const ownedSkillKey = options.find(
        (o) => o.label === ownedSkillName,
      ).value;

      const effectId = await game.evaluate(
        (id) => game.actors.get(id).effects.contents.at(-1).id,
        actorId,
      );
      await row.locator(".key-key").selectOption(ownedSkillKey);
      await game.waitForFunction(
        ({ id: aid, effectId: eid, key }) =>
          game.actors.get(aid).effects.get(eid).changes[0].key === key,
        { id: actorId, effectId, key: ownedSkillKey },
      );

      await aeConfig.locator('[data-action="close"]').click();
      await expect(aeConfig).toBeHidden();
      await closeDocSheet(game, { collection: "actors", id: actorId });
      actorSheetId = await reopenActorSheetViaUI(game, actorId);

      const freshSheet = game.locator(`#${actorSheetId}`);
      await freshSheet.locator('.navtabs-right [data-tab="effects"]').click();
      await expect(
        freshSheet
          .locator(".effects-tab li.effect .text-pill")
          .filter({ hasText: ownedSkillName }),
      ).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  /*
   * Effect modifier names for non-core (custom) skills used to render as "???"
   * in every UI that passed `false` as the document to cprGetChangeNameByKey:
   * the character sheet's skill/role mod tooltips, the roll dialog's modifier
   * lists, and the chat roll card. Those sites now pass the acting actor (or
   * the owning item), so names resolve against world skills plus the actor's
   * own skills. This test drives one custom skill through all of those surfaces.
   */
  test("a custom skill's name resolves in sheet tooltips and roll output", async ({
    page: game,
  }) => {
    const pageErrors = [];
    game.on("pageerror", (error) => pageErrors.push(error.message));

    const skillName = uniqueName("skill");
    let actorId;
    let actorSheetId;

    await test.step("create a world skill and give it to a character", async () => {
      const skillId = await createItemViaUI(game, {
        type: "skill",
        name: skillName,
      });
      expect(skillId).toBeTruthy();

      actorId = await createActorViaUI(game, {
        type: "character",
        name: uniqueName("character"),
      });
      actorSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });
      await dragItemToActorSheet(game, {
        itemId: skillId,
        sheetId: actorSheetId,
        actorId,
      });
    });

    await test.step("add a situational on-by-default modifier for the skill", async () => {
      const actorSheet = game.locator(`#${actorSheetId}`);
      await actorSheet.locator('.navtabs-right [data-tab="effects"]').click();
      await actorSheet
        .locator(".effects-tab.active .effect-control[data-action='create']")
        .click();

      const aeConfig = game.locator(".application.active-effect-config");
      await expect(aeConfig).toBeVisible();
      await aeConfig.locator('nav [data-tab="changes"]').click();
      await aeConfig.locator('[data-action="addMod"]').click();

      const row = aeConfig.locator(".changes-list > li").first();
      await expect(row).toBeVisible();
      const options = await row
        .locator(".key-key option")
        .evaluateAll((options) =>
          options.map((option) => ({
            value: option.value,
            label: option.textContent,
          })),
        );
      const skillKey = options.find((o) => o.label === skillName)?.value;
      expect(skillKey).toMatch(/^bonuses\./);

      await row.locator(".key-key").selectOption(skillKey);
      await row.locator(".change-value input").fill("2");
      await row.locator(".toggle-situational").check();
      await row.locator(".toggle-on-by-default").check();
      await game.waitForFunction((aid) => {
        const effect = game.actors.get(aid).effects.contents[0];
        return (
          effect.changes[0].key.startsWith("bonuses.") &&
          effect.changes[0].value === "2" &&
          effect.getFlag(
            game.system.id,
            "changes.situational.0.isSituational",
          ) &&
          effect.getFlag(game.system.id, "changes.situational.0.onByDefault")
        );
      }, actorId);

      await aeConfig.locator('[data-action="close"]').click();
      await expect(aeConfig).toBeHidden();
    });

    const skillRow = () =>
      game.locator(`#${actorSheetId}`).locator("li.item", {
        has: game.locator(
          `a.rollable[data-roll-type="skill"][data-roll-title="${skillName}"]`,
        ),
      });

    await test.step("the skills tab tooltip shows the skill name, not ???", async () => {
      const actorSheet = game.locator(`#${actorSheetId}`);
      await actorSheet.locator('.navtabs-right [data-tab="skills"]').click();

      const row = await skillRow();
      await expect(row).toBeVisible();
      const tooltip = await row
        .locator(".skill-mod-value span")
        .getAttribute("data-tooltip");
      expect(tooltip).toContain(skillName);
      expect(tooltip).not.toContain("???");
    });

    await test.step("the roll dialog lists the skill name in both mod sections", async () => {
      const messagesBefore = await game.evaluate(() => game.messages.size);
      await (await skillRow()).locator("a.rollable").click();

      const dialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="luck"]') });
      await expect(dialog).toBeVisible();

      await expect(
        dialog.locator(".situational-mod-name").filter({ hasText: skillName }),
      ).toBeVisible();

      const allModsTooltip = await dialog
        .locator(".total-mods .dialog-item-input")
        .getAttribute("data-tooltip");
      expect(allModsTooltip).toContain(`(${skillName})`);

      const confirm = dialog.locator(
        'button.cpr-dialog-button[data-action="confirm"]',
      );
      await expect(async () => {
        await confirm.click();
        await expect(dialog).toHaveCount(0, { timeout: 2000 });
      }).toPass({ timeout: 20000 });

      await game.waitForFunction(
        (before) => game.messages.size > before,
        messagesBefore,
        { timeout: 10000 },
      );
    });

    await test.step("the chat roll card resolves the skill name", async () => {
      const content = await game.evaluate(
        () => game.messages.contents.at(-1).content,
      );
      expect(content).toContain(`(${skillName})`);
      expect(content).not.toContain("???");
    });

    expect(pageErrors).toEqual([]);
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});

test("item-owned effects on gear", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  let itemId;
  let effectId;
  let itemSheet;
  let aeConfig;
  let theme;

  await test.step("A1 create gear and its seeded effect", async () => {
    const name = uniqueName("gear");
    itemId = await createDocumentViaUI(page, {
      documentTab: "items",
      type: "gear",
      name,
    });
    expect(itemId).toBeTruthy();

    itemSheet = page.locator(`#CPRItemSheet-Item-${itemId}`);
    await expect(itemSheet).toBeVisible();
    await itemSheet.locator('.navtabs-item [data-tab="item-effects"]').click();

    ({ aeConfig, effectId } = await createEffectViaUI(page, itemSheet, {
      ownerType: "item",
      ownerId: itemId,
    }));

    await expect(aeConfig.locator('input[name="name"]')).toHaveValue(
      "New Effect",
    );
    await expect(aeConfig.locator('input[name="disabled"]')).not.toBeChecked();
    const origin = await page.evaluate(
      ({ itemId: id, effectId: eid }) => {
        const item = game.items.get(id);
        return { origin: item.effects.get(eid).origin, uuid: item.uuid };
      },
      { itemId, effectId },
    );
    expect(origin.origin).toBe(origin.uuid);
    // Item effects expose the transfer field; origin is actor-effects only.
    await expect(aeConfig.locator('input[name="transfer"]')).toHaveCount(1);
    await expect(aeConfig.locator('input[name="origin"]')).toHaveCount(0);
  });

  await test.step("A2 addMod seeds a CPR skill row", async () => {
    await aeConfig.locator('nav [data-tab="changes"]').click();
    const row = await addModViaUI(aeConfig);
    await expect(row.locator(".key-cat")).toHaveValue("skill");
    await expect(row.locator("select.key-key")).toHaveCount(1);
    await expect(row.locator("input.key-input")).toHaveCount(0);
    await expect(row.locator('input[name="changes.0.value"]')).toHaveValue("0");
    await expect(
      row.locator('input[type="hidden"][name="changes.0.mode"]'),
    ).toHaveValue("2");
    await expect(row.locator(".toggle-situational")).toBeEnabled();
    await expect(row.locator(".toggle-situational")).not.toBeChecked();
    await expect(row.locator(".toggle-on-by-default")).toBeDisabled();
    await expect(row.locator(".toggle-on-by-default")).not.toBeChecked();
  });

  await test.step("A3 the config uses the CPR sheet theme", async () => {
    // The config is one of CPR's explicitly themed windows. Foundry's native
    // active-effect grid must not override the custom six-column flex layout.
    await expect(aeConfig).toHaveClass(/active-effect-sheet/);
    theme = await aeConfig.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--cpr-background-window)";
      probe.style.color = "var(--cpr-text-normal)";
      probe.style.fontFamily = "var(--cpr-font-primary)";
      probe.style.border = "1px solid var(--cpr-color-medium-grey)";
      probe.style.outline = "2px solid var(--cpr-text-foundry-hover)";
      document.body.append(probe);
      const buttonProbe = document.createElement("div");
      buttonProbe.style.backgroundColor = "var(--cpr-background-foundry-input)";
      document.body.append(buttonProbe);
      const expectedStyle = getComputedStyle(probe);
      const contentStyle = getComputedStyle(
        element.querySelector(".window-content"),
      );
      const header = element.querySelector(".change-header");
      const actionHeader = header.querySelector(".change-actions");
      const changeRow = element.querySelector(".changes-list > li");
      const actionCell = changeRow.querySelector(".change-actions");
      const situationalCell = changeRow.querySelector(".situational");
      const situationalCheckbox = situationalCell.querySelector(
        'input[type="checkbox"]',
      );
      const onByDefaultCell = changeRow.querySelector(".on-by-default");
      const onByDefaultCheckbox = onByDefaultCell.querySelector(
        'input[type="checkbox"]',
      );
      const windowHeaderButton = element.querySelector(".window-header button");
      const valueInput = element.querySelector('input[name="changes.0.value"]');
      const categorySelect = changeRow.querySelector(".key-cat");
      const valueInputStyle = getComputedStyle(valueInput);
      const categorySelectStyle = getComputedStyle(categorySelect);
      const isContained = (child, parent) => {
        const childRect = child.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        return (
          childRect.left >= parentRect.left - 1 &&
          childRect.right <= parentRect.right + 1
        );
      };
      const horizontalCenterOffset = (child, parent) => {
        const childRect = child.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const childCenter = (childRect.left + childRect.right) / 2;
        const parentCenter = (parentRect.left + parentRect.right) / 2;
        return Math.abs(childCenter - parentCenter);
      };
      const result = {
        backgroundColor: contentStyle.backgroundColor,
        color: contentStyle.color,
        fontFamily: contentStyle.fontFamily,
        expectedBackgroundColor: expectedStyle.backgroundColor,
        expectedColor: expectedStyle.color,
        expectedFontFamily: expectedStyle.fontFamily,
        expectedControlBorderColor: expectedStyle.borderTopColor,
        expectedFocusOutlineColor: expectedStyle.outlineColor,
        headerDisplay: getComputedStyle(header).display,
        rowDisplay: getComputedStyle(changeRow).display,
        actionHeaderContained: isContained(actionHeader, header),
        actionCellContained: isContained(actionCell, changeRow),
        situationalCheckboxCenterOffset: horizontalCenterOffset(
          situationalCheckbox,
          situationalCell,
        ),
        onByDefaultCheckboxCenterOffset: horizontalCenterOffset(
          onByDefaultCheckbox,
          onByDefaultCell,
        ),
        windowHeaderButtonBackground:
          getComputedStyle(windowHeaderButton).backgroundColor,
        cprButtonBackground: getComputedStyle(buttonProbe).backgroundColor,
        valueInputBorderColor: valueInputStyle.borderTopColor,
        valueInputBorderStyle: valueInputStyle.borderTopStyle,
        valueInputBoxShadow: valueInputStyle.boxShadow,
        valueInputOutlineStyle: valueInputStyle.outlineStyle,
        categorySelectBorderColor: categorySelectStyle.borderTopColor,
        categorySelectBoxShadow: categorySelectStyle.boxShadow,
      };
      probe.remove();
      buttonProbe.remove();
      return result;
    });
    expect(theme.backgroundColor).toBe(theme.expectedBackgroundColor);
    expect(theme.color).toBe(theme.expectedColor);
    expect(theme.fontFamily).toBe(theme.expectedFontFamily);
    expect(theme.headerDisplay).toBe("flex");
    expect(theme.rowDisplay).toBe("flex");
    expect(theme.actionHeaderContained).toBe(true);
    expect(theme.actionCellContained).toBe(true);
    expect(theme.situationalCheckboxCenterOffset).toBeLessThanOrEqual(1);
    expect(theme.onByDefaultCheckboxCenterOffset).toBeLessThanOrEqual(1);
    // Native ApplicationV2 window controls keep Foundry's transparent header
    // treatment instead of receiving the content-button background.
    expect(theme.windowHeaderButtonBackground).toBe("rgba(0, 0, 0, 0)");
    expect(theme.windowHeaderButtonBackground).not.toBe(
      theme.cprButtonBackground,
    );
    expect(theme.valueInputBorderStyle).toBe("solid");
    expect(theme.valueInputBorderColor).toBe(theme.expectedControlBorderColor);
    expect(theme.valueInputBoxShadow).toBe("none");
    expect(theme.valueInputOutlineStyle).toBe("none");
    expect(theme.categorySelectBorderColor).toBe(
      theme.expectedControlBorderColor,
    );
    expect(theme.categorySelectBoxShadow).toBe("none");
  });

  await test.step("A4 switching category to combat swaps the key select", async () => {
    const row = aeConfig.locator(".changes-list > li").first();
    await row.locator(".key-cat").selectOption("combat");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.0") === "combat",
      { itemId, effectId },
    );
    await row.locator("select.key-key").selectOption("bonuses.maxHp");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[0].key === "bonuses.maxHp",
      { itemId, effectId },
    );
  });

  await test.step("A5 an already-used key is disabled in other rows", async () => {
    const row = await addModViaUI(aeConfig);
    await row.locator(".key-cat").selectOption("combat");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.1") === "combat",
      { itemId, effectId },
    );
    await expect(
      row.locator('select.key-key option[value="bonuses.maxHp"]'),
    ).toBeDisabled();
    await deleteModViaUI(aeConfig, 1);
  });

  await test.step("A6 value edits force-submit on blur", async () => {
    const valueInput = aeConfig.locator('input[name="changes.0.value"]');
    await valueInput.fill("3");
    await expect(valueInput).toHaveCSS(
      "outline-color",
      theme.expectedFocusOutlineColor,
    );
    const focusedInputStyle = await valueInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focusedInputStyle.outlineColor).toBe(
      theme.expectedFocusOutlineColor,
    );
    expect(focusedInputStyle.outlineStyle).toBe("solid");
    expect(focusedInputStyle.outlineWidth).toBe("2px");
    await valueInput.press("Tab");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[0].value === "3",
      { itemId, effectId },
    );
  });

  await test.step("A7 the item summary shows the configured bonus", async () => {
    await closeActiveEffectConfigViaUI(page, aeConfig);
    const row = await getEffectRowViaUI(itemSheet, "New Effect");
    await expect(row.first()).toContainText("Max Hit Points");
    await expect(row.first()).toContainText("+3");
    // Not situational yet: no situational glyphs.
    await expect(row.locator("i.fa-circle-dot")).toHaveCount(0);
    await expect(row.locator("i.fa-circle")).toHaveCount(0);
  });

  await test.step("A8 world skills appear in the skill key options", async () => {
    const skillName = uniqueName("skill");
    const skillId = await createDocumentViaUI(page, {
      documentTab: "items",
      type: "skill",
      name: skillName,
    });
    await closeDocSheet(page, { collection: "items", id: skillId });

    // Reopen the config so the key options rebuild with the new world skill.
    await clickEffectActionViaUI(
      await getEffectRowViaUI(itemSheet, "New Effect"),
      "edit",
    );
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();

    const row = await addModViaUI(aeConfig);
    const skillOption = row.locator("select.key-key option", {
      hasText: skillName,
    });
    await expect(skillOption).toHaveCount(1);
    const skillKey = await skillOption.getAttribute("value");
    expect(skillKey).toMatch(/^bonuses\./);
    await row.locator("select.key-key").selectOption(skillKey);
    await page.waitForFunction(
      ({ itemId: id, effectId: eid, key }) =>
        game.items.get(id).effects.get(eid).changes[1].key === key,
      { itemId, effectId, key: skillKey },
    );

    // Restore the single-mod state for the following steps.
    await deleteModViaUI(aeConfig, 1);
  });

  await test.step("A9 situational and on-by-default persist across reopens", async () => {
    const row = aeConfig.locator(".changes-list > li").first();
    await row.locator(".toggle-situational").check();
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.situational.0.isSituational") ===
        true,
      { itemId, effectId },
    );
    // Checking situational enables on-by-default on the fresh render.
    await expect(row.locator(".toggle-on-by-default")).toBeEnabled();
    await row.locator(".toggle-on-by-default").check();
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.situational.0.onByDefault") ===
        true,
      { itemId, effectId },
    );

    // Fresh-render guard: close and reopen the config from the summary.
    await closeActiveEffectConfigViaUI(page, aeConfig);
    await clickEffectActionViaUI(
      await getEffectRowViaUI(itemSheet, "New Effect"),
      "edit",
    );
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();
    const reopened = aeConfig.locator(".changes-list > li").first();
    await expect(reopened.locator(".toggle-situational")).toBeChecked();
    await expect(reopened.locator(".toggle-on-by-default")).toBeChecked();

    // The item summary marks an on-by-default situational bonus.
    await closeActiveEffectConfigViaUI(page, aeConfig);
    const effectRow = await getEffectRowViaUI(itemSheet, "New Effect");
    await expect(effectRow.locator("i.fa-circle-dot")).toHaveCount(1);
  });

  await test.step("A10 deleting a middle mod reindexes the flags", async () => {
    await clickEffectActionViaUI(
      await getEffectRowViaUI(itemSheet, "New Effect"),
      "edit",
    );
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();

    const middle = await addModViaUI(aeConfig);
    await middle.locator(".key-cat").selectOption("custom");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.1") === "custom",
      { itemId, effectId },
    );
    const last = await addModViaUI(aeConfig);
    await last.locator(".key-cat").selectOption("combat");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.2") === "combat",
      { itemId, effectId },
    );
    await last.locator("select.key-key").selectOption("bonuses.initiative");
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items.get(id).effects.get(eid).changes[2].key ===
        "bonuses.initiative",
      { itemId, effectId },
    );
    await last.locator(".toggle-situational").check();
    await page.waitForFunction(
      ({ itemId: id, effectId: eid }) =>
        game.items
          .get(id)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.situational.2.isSituational") ===
        true,
      { itemId, effectId },
    );

    await deleteModViaUI(aeConfig, 1);

    const flags = await page.evaluate(
      ({ itemId: id, effectId: eid }) => {
        const effect = game.items.get(id).effects.get(eid);
        return {
          cats: effect.getFlag(game.system.id, "changes.cats"),
          situational: effect.getFlag(game.system.id, "changes.situational"),
          keys: effect.changes.map((change) => change.key),
        };
      },
      { itemId, effectId },
    );
    expect(flags.keys).toEqual(["bonuses.maxHp", "bonuses.initiative"]);
    expect(flags.cats).toEqual({ 0: "combat", 1: "combat" });
    expect(flags.situational).toEqual({
      0: { isSituational: true, onByDefault: true },
      1: { isSituational: true, onByDefault: false },
    });

    // The surviving situational mod renders checked at its new index.
    const rows = aeConfig.locator(".changes-list > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1).locator(".toggle-situational")).toBeChecked();
    await expect(
      rows.nth(1).locator(".toggle-on-by-default"),
    ).not.toBeChecked();
  });

  await test.step("A11 copying and deleting effects from the item summary", async () => {
    await closeActiveEffectConfigViaUI(page, aeConfig);
    const rows = await getEffectRowViaUI(itemSheet, "New Effect");
    await expect(rows).toHaveCount(1);

    await clickEffectActionViaUI(rows.first(), "copy");
    await expect(rows).toHaveCount(2);

    const [original, copy] = await page.evaluate(
      ({ itemId: id }) =>
        game.items.get(id).effects.contents.map((effect) => ({
          changes: effect.changes,
          flags: effect.getFlag(game.system.id, "changes"),
          disabled: effect.disabled,
        })),
      { itemId },
    );
    expect(copy).toEqual(original);

    await clickEffectActionViaUI(rows.nth(0), "delete");
    await expect(rows).toHaveCount(1);
    await clickEffectActionViaUI(rows.first(), "delete");
    await expect(rows).toHaveCount(0);
  });

  expect(pageErrors).toEqual([]);
  await closeDocSheet(page, { collection: "items", id: itemId });
});

test("actor-owned effects on a character", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  let actorId;
  let actorSheetId;
  let actorSheet;
  let effectId;
  let aeConfig;

  await test.step("B1 create character and its effect", async () => {
    actorId = await createDocumentViaUI(page, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("character"),
    });
    expect(actorId).toBeTruthy();

    actorSheetId = await expectSheetRendered(page, {
      collection: "actors",
      id: actorId,
    });
    actorSheet = page.locator(`#${actorSheetId}`);
    await actorSheet.locator('.navtabs-right [data-tab="effects"]').click();

    ({ aeConfig, effectId } = await createEffectViaUI(page, actorSheet, {
      ownerType: "actor",
      ownerId: actorId,
    }));

    await expect(aeConfig.locator('input[name="name"]')).toHaveValue(
      "New Effect",
    );
    await expect(aeConfig.locator('input[name="disabled"]')).not.toBeChecked();
    // Actor effects expose the (read-only) origin field; transfer is item-only.
    await expect(aeConfig.locator('input[name="origin"]')).toHaveCount(1);
    await expect(aeConfig.locator('input[name="transfer"]')).toHaveCount(0);
  });

  await test.step("B2 addMod seeds a CPR row, not Foundry's changes grid", async () => {
    await aeConfig.locator('nav [data-tab="changes"]').click();
    const row = await addModViaUI(aeConfig);
    await expect(row.locator(".key-cat")).toHaveValue("skill");
    await expect(row.locator("select.key-key")).toHaveCount(1);
    await expect(row.locator("input.key-input")).toHaveCount(0);
    // Foundry's native grid exposes a per-row priority input; CPR's does not.
    await expect(
      aeConfig.locator('input[name="changes.0.priority"]'),
    ).toHaveCount(0);
  });

  await test.step("B3 skill key options list owned skills only", async () => {
    const worldSkillName = uniqueName("skill");
    const worldSkillId = await createDocumentViaUI(page, {
      documentTab: "items",
      type: "skill",
      name: worldSkillName,
    });
    await closeDocSheet(page, { collection: "items", id: worldSkillId });

    const ownedSkillName = uniqueName("skill");
    const ownedSkillId = await createDocumentViaUI(page, {
      documentTab: "items",
      type: "skill",
      name: ownedSkillName,
    });
    await closeDocSheet(page, { collection: "items", id: ownedSkillId });
    await dragItemToActorSheet(page, {
      itemId: ownedSkillId,
      sheetId: actorSheetId,
      actorId,
    });
    await page.waitForFunction(
      ({ actorId: aid, name: skillName }) =>
        !!game.actors.get(aid).items.find((item) => item.name === skillName),
      { actorId, name: ownedSkillName },
    );

    // Reopen the config so the key options rebuild with the owned skill.
    await closeActiveEffectConfigViaUI(page, aeConfig);
    await clickEffectActionViaUI(
      await getEffectRowViaUI(actorSheet, "New Effect"),
      "edit",
    );
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();

    const row = aeConfig.locator(".changes-list > li").first();
    const ownedOption = row.locator("select.key-key option", {
      hasText: ownedSkillName,
    });
    await expect(ownedOption).toHaveCount(1);
    const ownedKey = await ownedOption.getAttribute("value");
    expect(ownedKey).toMatch(/^bonuses\./);
    // A world skill the character does not own is not an option.
    await expect(
      row.locator("select.key-key option", { hasText: worldSkillName }),
    ).toHaveCount(0);

    await row.locator("select.key-key").selectOption(ownedKey);
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid, key }) =>
        game.actors.get(aid).effects.get(eid).changes[0].key === key,
      { actorId, effectId, key: ownedKey },
    );
  });

  await test.step("B4 the stat category exposes the mode select", async () => {
    const row = await addModViaUI(aeConfig);
    await row.locator(".key-cat").selectOption("stat");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors
          .get(aid)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.1") === "stat",
      { actorId, effectId },
    );

    const modeSelect = row.locator('select[name="changes.1.mode"]');
    await expect(modeSelect).toBeVisible();
    await expect(modeSelect).toHaveValue("2");
    for (const label of [
      "Multiply",
      "Add / Subtract",
      "Override if Lower",
      "Override if Higher",
      "Override",
    ]) {
      await expect(
        modeSelect.getByRole("option", { name: label, exact: true }),
      ).toHaveCount(1);
    }
    // Stats cannot be situational, so both toggles are disabled.
    await expect(row.locator(".toggle-situational")).toBeDisabled();
    await expect(row.locator(".toggle-on-by-default")).toBeDisabled();

    await row.locator("select.key-key").selectOption("system.stats.body.value");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).changes[1].key ===
        "system.stats.body.value",
      { actorId, effectId },
    );
  });

  const setStatMod = async ({ mode, value }) => {
    const row = aeConfig.locator('.changes-list > li[data-index="1"]');
    if (mode) {
      await row.locator('select[name="changes.1.mode"]').selectOption(mode);
    }
    const valueInput = row.locator('input[name="changes.1.value"]');
    await valueInput.fill(value);
    await valueInput.press("Tab");
  };

  const expectBodyValue = async (expected) => {
    await page.waitForFunction(
      ({ actorId: aid, expected: body }) =>
        game.actors.get(aid).system.stats.body.value === body,
      { actorId, expected },
    );
    await expect(
      actorSheet.locator('input[name="system.stats.body.value"]'),
    ).toHaveValue(String(expected));
  };

  await test.step("B5 multiply scales the stat", async () => {
    await setStatMod({ mode: "1", value: "2" });
    await expectBodyValue(12); // BODY 6 x 2
  });

  await test.step("B6 override replaces the stat", async () => {
    await setStatMod({ mode: "5", value: "9" });
    await expectBodyValue(9);
  });

  await test.step("B7 lowerOf only applies when lower", async () => {
    await setStatMod({ mode: "3", value: "4" });
    await expectBodyValue(4); // min(6, 4)
    await setStatMod({ value: "8" });
    await expectBodyValue(6); // min(6, 8) keeps the base
  });

  await test.step("B8 higherOf only applies when higher", async () => {
    await setStatMod({ mode: "4", value: "8" });
    await expectBodyValue(8); // max(6, 8)
    await setStatMod({ value: "4" });
    await expectBodyValue(6); // max(6, 4) keeps the base
  });

  await test.step("B9 a custom dotted path targets another stat", async () => {
    const row = await addModViaUI(aeConfig);
    await row.locator(".key-cat").selectOption("custom");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors
          .get(aid)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.2") === "custom",
      { actorId, effectId },
    );

    // Set the value before the key: each force-submit blur re-renders the row, so
    // persist the value first while the row is stable rather than chasing it across
    // the key's re-render.
    const valueInput = row.locator('input[name="changes.2.value"]');
    await expect(valueInput).toBeVisible();
    await valueInput.fill("3");
    await valueInput.press("Tab");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).changes[2].value === "3",
      { actorId, effectId },
    );

    const keyInput = row.locator("input.key-input");
    await expect(keyInput).toHaveCount(1);
    await keyInput.fill("system.stats.dex.value");
    // Custom keys are force-submit text inputs: blur persists (and re-renders)
    // without closing the config, unlike a native Enter form submission.
    await keyInput.press("Tab");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).changes[2].key ===
        "system.stats.dex.value",
      { actorId, effectId },
    );

    // Custom rows are fixed to Add / Subtract: DEX 6 + 3.
    await page.waitForFunction(
      ({ actorId: aid }) => game.actors.get(aid).system.stats.dex.value === 9,
      { actorId },
    );
    // Custom rows are fixed to Add / Subtract: DEX 6 + 3.
    await expect(
      actorSheet.locator('input[name="system.stats.dex.value"]'),
    ).toHaveValue("9");
  });

  await test.step("B10 situational flags persist across reopens", async () => {
    const row = await addModViaUI(aeConfig);
    await row.locator(".key-cat").selectOption("combat");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors
          .get(aid)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.cats.3") === "combat",
      { actorId, effectId },
    );
    await row.locator("select.key-key").selectOption("bonuses.maxHp");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).changes[3].key ===
        "bonuses.maxHp",
      { actorId, effectId },
    );
    const valueInput = row.locator('input[name="changes.3.value"]');
    await valueInput.fill("2");
    await valueInput.press("Tab");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).changes[3].value === "2",
      { actorId, effectId },
    );

    const modRow = aeConfig.locator('.changes-list > li[data-index="3"]');
    await modRow.locator(".toggle-situational").check();
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors
          .get(aid)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.situational.3.isSituational") ===
        true,
      { actorId, effectId },
    );
    await modRow.locator(".toggle-on-by-default").check();
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors
          .get(aid)
          .effects.get(eid)
          .getFlag(game.system.id, "changes.situational.3.onByDefault") ===
        true,
      { actorId, effectId },
    );

    // Fresh-render guard: close and reopen the config from the summary. The
    // effect now has permanent and situational mods, so it appears in both
    // sections; either row opens the same config.
    await closeActiveEffectConfigViaUI(page, aeConfig);
    const rows = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(rows).toHaveCount(2);
    await clickEffectActionViaUI(rows.first(), "edit");
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();
    const reopened = aeConfig.locator('.changes-list > li[data-index="3"]');
    await expect(reopened.locator(".toggle-situational")).toBeChecked();
    await expect(reopened.locator(".toggle-on-by-default")).toBeChecked();
  });

  await test.step("B11 the summary splits mods into sections", async () => {
    await closeActiveEffectConfigViaUI(page, aeConfig);

    // The effect has both permanent and situational mods, so it appears in
    // both sections; each row shows only that section's mods.
    const rows = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(rows).toHaveCount(2);

    const situationalRow = rows
      .filter({ has: page.locator("i.fas.fa-circle-question") })
      .first();
    await expect(situationalRow).toContainText("Max Hit Points");
    await expect(situationalRow).toContainText("+2");
    await expect(
      situationalRow.locator("i.fas.fa-circle-question"),
    ).toHaveCount(1);
    await expect(situationalRow).not.toContainText("system.stats.dex.value");

    const permanentRow = rows
      .filter({ hasNot: page.locator("i.fas.fa-circle-question") })
      .first();
    await expect(permanentRow).toContainText("system.stats.dex.value");
    await expect(permanentRow).toContainText("+3");
    await expect(permanentRow).not.toContainText("Max Hit Points");

    await expect(
      actorSheet.locator('li[data-effect-type="situational"]'),
    ).toContainText("Situational Effects");
    await expect(
      actorSheet.locator('li[data-effect-type="permanent"]'),
    ).toContainText("Permanent Effects");
  });

  await test.step("B12 the toggle disables and re-enables the effect", async () => {
    const situationalRow = (await getEffectRowViaUI(actorSheet, "New Effect"))
      .filter({ has: page.locator("i.fas.fa-circle-question") })
      .first();
    await clickEffectActionViaUI(situationalRow, "toggle");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).disabled === true,
      { actorId, effectId },
    );

    // Disabled effects move to the Inactive section with an empty circle.
    const rows = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator("i.far.fa-circle")).toHaveCount(1);
    await expect(rows.first().locator("i.far.fa-circle-check")).toHaveCount(0);
    await expect(
      actorSheet.locator('li[data-effect-type="inactive"]'),
    ).toContainText("Inactive Effects");

    // Toggling from the inactive row re-enables: allApplicableEffects() still
    // yields disabled effects, so manageEffect can find it by uuid.
    await clickEffectActionViaUI(rows.first(), "toggle");
    await page.waitForFunction(
      ({ actorId: aid, effectId: eid }) =>
        game.actors.get(aid).effects.get(eid).disabled === false,
      { actorId, effectId },
    );
    const restored = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(restored).toHaveCount(2);
    await expect(restored.locator("i.far.fa-circle-check")).toHaveCount(2);
  });

  await test.step("B13 copying and deleting effects from the actor summary", async () => {
    const rows = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(rows).toHaveCount(2);

    await clickEffectActionViaUI(rows.first(), "copy");
    await page.waitForFunction(
      ({ actorId: aid }) => game.actors.get(aid).effects.contents.length === 2,
      { actorId },
    );
    const effects = await page.evaluate(
      ({ actorId: aid }) =>
        game.actors.get(aid).effects.contents.map((effect) => ({
          changes: effect.changes,
          flags: effect.getFlag(game.system.id, "changes"),
          disabled: effect.disabled,
        })),
      { actorId },
    );
    expect(effects).toHaveLength(2);
    // The copy keeps the original's name and data.
    expect(effects[1]).toEqual(effects[0]);
    const copiedRows = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(copiedRows).toHaveCount(4);

    // Deleting prompts for confirmation (deleteItemConfirmation defaults on).
    await clickEffectActionViaUI(copiedRows.first(), "delete");
    const dialog = yesNoDialog(page);
    await expect(dialog).toBeVisible();
    await resolveYesNo(dialog, "yes");
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(
      ({ actorId: aid }) => game.actors.get(aid).effects.contents.length === 1,
      { actorId },
    );

    const remaining = await getEffectRowViaUI(actorSheet, "New Effect");
    await expect(remaining).toHaveCount(2);
    await clickEffectActionViaUI(remaining.first(), "delete");
    const secondDialog = yesNoDialog(page);
    await expect(secondDialog).toBeVisible();
    await resolveYesNo(secondDialog, "yes");
    await expect(secondDialog).toHaveCount(0);

    await expect(
      actorSheet
        .locator(".effects-list li.effect")
        .filter({ hasText: "New Effect" }),
    ).toHaveCount(0);
    const effectCount = await page.evaluate(
      ({ actorId: aid }) => game.actors.get(aid).effects.contents.length,
      { actorId },
    );
    expect(effectCount).toBe(0);
  });

  expect(pageErrors).toEqual([]);
  // Silent rejections (e.g. a failed embedded-document create) only surface as
  // console errors, so guard against those too.
  expect(consoleErrors).toEqual([]);
  await closeDocSheet(page, { collection: "actors", id: actorId });
});
