import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createDocumentViaUI,
  createItemViaUI,
  deleteItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
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

  test("adds a CPR modifier to an actor effect without falling back to Foundry's editor", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("character"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    const actorSheet = game.locator(`#${actorSheetId}`);
    await actorSheet.locator('.navtabs-right [data-tab="effects"]').click();
    await actorSheet
      .locator('.effects-tab.active .effect-control[data-action="create"]')
      .click();

    const aeConfig = game.locator(".application.active-effect-config");
    await expect(aeConfig).toBeVisible();
    await aeConfig.locator('nav [data-tab="changes"]').click();
    await aeConfig.locator('[data-action="addMod"]').click();

    const row = aeConfig.locator(".changes-list > li").first();
    await expect(row.locator(".effect-key-category select")).toBeVisible();
    await expect(row.locator(".key-key, .key-input")).toHaveCount(1);
    await expect(
      aeConfig.locator('input[name="changes.0.priority"]'),
    ).toHaveCount(0);

    await aeConfig.locator('[data-action="close"]').click();
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
