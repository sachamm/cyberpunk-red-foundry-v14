import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
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
  resolveYesNo,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
  yesNoDialog,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Role sheet: the role-specific Settings surface — main ability name (with
 * rename warning), ability rank, the Has Roll? toggle that reveals the
 * add-role-ability-rank flag plus stat and skill selects, the
 * "Configure Bonuses to Rolls" wrenches (main role and per sub-ability row)
 * with their bonus ratio display and bonus lists, and the sub-ability table
 * driven by the Role Ability prompt dialog. Also pins the skill-option
 * sourcing split (owned roles offer the owner's skills only; world roles
 * offer core + world skills) and how an owned role's abilities render on the
 * character sheet's Role tab. The generic item header/description shell is
 * owned by item-sheet-header.spec.mjs.
 *
 * Verified quirks this spec works around or pins:
 * - cprFormPrompt renders its template once, so in the Role Ability prompt
 *   the multiplier/stat/skill selects only exist when hasRoll was already on
 *   (edit of a rollable ability); checking Has roll during create saves the
 *   ability with schema defaults.
 * - After every dialog action the sheet re-sorts abilities descending by
 *   name, while migrateData sorts ascending — rows are asserted by identity,
 *   never by position. The character Role tab sorts sub-rows itself (name
 *   order), so position is pinned there.
 * - Bonus list rows render in stored order (cprSort does not resolve the
 *   "system.stat" dot path).
 */

// The Role Ability create/edit prompt.
function roleAbilityDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="rank"]'),
  });
}

// The Select Role Bonuses prompt (main role or a sub-ability).
function selectRoleBonusesDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="bonusRatio"]'),
  });
}

// A sub-ability row in the item sheet table, matched by its name.
function abilityRow(sheet, name) {
  return sheet.locator("li.item.role-name", { hasText: name });
}

test("main ability fields render and Has Roll reveals its dependent fields", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "role",
    name: uniqueName("role"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await test.step("a new role shows the main ability fields with schema defaults", async () => {
    const settings = await openItemSettings(page, sheetId);
    await expect(
      settings.locator('input[name="system.mainRoleAbility"]'),
    ).toHaveValue("");
    await expect(settings.locator('input[name="system.rank"]')).toHaveValue(
      "0",
    );
    await expect(
      settings.locator('[data-target="system.hasRoll"] i'),
    ).not.toHaveClass(/check/);
    // The dependent fields only render while Has Roll is on.
    await expect(
      settings.locator('[data-target="system.addRoleAbilityRank"]'),
    ).toHaveCount(0);
    await expect(settings.locator('select[name="system.stat"]')).toHaveCount(0);
    await expect(settings.locator('select[name="system.skill"]')).toHaveCount(
      0,
    );
  });

  await test.step("the main ability name and rank persist", async () => {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.mainRoleAbility",
      path: "system.mainRoleAbility",
      value: "Custom Main Ability",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.rank",
      path: "system.rank",
      value: 5,
    });
  });

  await test.step("turning Has Roll on reveals the add-rank, stat and skill fields", async () => {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.hasRoll",
      expected: true,
    });
    const settings = await openItemSettings(page, sheetId);
    await expect(
      settings.locator('[data-target="system.addRoleAbilityRank"] i'),
    ).not.toHaveClass(/check/);
    await expect(settings.locator('select[name="system.stat"]')).toHaveValue(
      "--",
    );
    await expect(settings.locator('select[name="system.skill"]')).toHaveValue(
      "--",
    );
  });

  await test.step("the revealed fields accept a stat, a core skill and the add-rank flag", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.stat",
      value: "body",
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.skill",
      value: "Cybertech",
    });
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.addRoleAbilityRank",
      expected: true,
    });
  });

  let reopened;
  await test.step("every value survives a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    reopened = await reopenItemSheetViaUI(page, itemId);
    const settings = await openItemSettings(page, reopened);
    await expect(
      settings.locator('input[name="system.mainRoleAbility"]'),
    ).toHaveValue("Custom Main Ability");
    await expect(settings.locator('input[name="system.rank"]')).toHaveValue(
      "5",
    );
    await expect(
      settings.locator('[data-target="system.hasRoll"] i'),
    ).toHaveClass(/check/);
    await expect(
      settings.locator('[data-target="system.addRoleAbilityRank"] i'),
    ).toHaveClass(/check/);
    await expect(settings.locator('select[name="system.stat"]')).toHaveValue(
      "body",
    );
    await expect(settings.locator('select[name="system.skill"]')).toHaveValue(
      "Cybertech",
    );
  });

  await test.step("turning Has Roll off hides the dependent fields again", async () => {
    await toggleItemCheckbox(page, {
      sheetId: reopened,
      itemId,
      target: "system.hasRoll",
      expected: false,
    });
    const settings = await openItemSettings(page, reopened);
    await expect(
      settings.locator('[data-target="system.addRoleAbilityRank"]'),
    ).toHaveCount(0);
    await expect(settings.locator('select[name="system.stat"]')).toHaveCount(0);
    await expect(settings.locator('select[name="system.skill"]')).toHaveCount(
      0,
    );
  });
});

test("sub-abilities can be created, edited and deleted from the ability table", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "role",
    name: uniqueName("role"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  const alpha = uniqueName("abilityA");
  const beta = uniqueName("abilityB");

  await test.step("a new sub-ability renders with its rank and schema defaults", async () => {
    const settings = await openItemSettings(page, sheetId);
    await settings
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator('input[name="name"]').fill(alpha);
    await dialog.locator('input[name="rank"]').fill("3");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    const row = abilityRow(page.locator(`#${sheetId}`), alpha);
    await expect(row).toBeVisible();
    await expect(row.locator(".role-rank")).toHaveText("3");
    await expect(row.locator(".role-multiplier")).toHaveText("x1");
    await expect(row.locator(".role-stat")).toHaveText("N/A");
    await expect(row.locator(".role-skill")).toHaveText("N/A");
  });

  await test.step("checking Has roll during create saves the ability with its defaults", async () => {
    // The prompt renders once, so checking Has roll does not reveal the
    // multiplier/stat/skill selects — the saved ability keeps schema
    // defaults until it is edited.
    const settings = await openItemSettings(page, sheetId);
    await settings
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator('input[name="name"]').fill(beta);
    await dialog.locator('input[name="rank"]').fill("2");
    await dialog.locator('input[name="hasRoll"]').check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    const row = abilityRow(page.locator(`#${sheetId}`), beta);
    await expect(row).toBeVisible();
    await expect(row.locator(".role-rank")).toHaveText("2");
    await expect(row.locator(".role-multiplier")).toHaveText("x1");
    await expect(row.locator(".role-stat")).toHaveText("N/A");
    await expect(row.locator(".role-skill")).toHaveText("N/A");
  });

  await test.step("editing the rollable ability sets its multiplier, stat and skill", async () => {
    const sheet = page.locator(`#${sheetId}`);
    await abilityRow(sheet, beta)
      .locator('a.role-ability-action[data-action-type="edit"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // The edit prompt renders with hasRoll already on, so the dependent
    // selects exist.
    await dialog.locator('select[name="multiplier"]').selectOption("0.5");
    await dialog.locator('select[name="stat"]').selectOption("body");
    await dialog.locator('select[name="skill"]').selectOption("Cybertech");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    const row = abilityRow(page.locator(`#${sheetId}`), beta);
    await expect(row.locator(".role-multiplier")).toHaveText("x0.5");
    await expect(row.locator(".role-stat")).toHaveText("BODY");
    await expect(row.locator(".role-skill")).toHaveText("Cybertech");
  });

  await test.step("deleting a sub-ability asks for confirmation and cancel keeps the row", async () => {
    const sheet = page.locator(`#${sheetId}`);
    await abilityRow(sheet, alpha)
      .locator('a.role-ability-action[data-action-type="delete"]')
      .click();
    const confirm = yesNoDialog(page);
    await expect(confirm).toBeVisible({ timeout: 5000 });
    await resolveYesNo(confirm, "no");
    await expect(confirm).toHaveCount(0, { timeout: 5000 });
    await expect(abilityRow(page.locator(`#${sheetId}`), alpha)).toBeVisible();
  });

  await test.step("confirming the delete removes the row", async () => {
    const sheet = page.locator(`#${sheetId}`);
    await abilityRow(sheet, alpha)
      .locator('a.role-ability-action[data-action-type="delete"]')
      .click();
    const confirm = yesNoDialog(page);
    await expect(confirm).toBeVisible({ timeout: 5000 });
    await resolveYesNo(confirm, "yes");
    await page.waitForFunction(
      ({ id, name }) =>
        !game.items.get(id).system.abilities.some((a) => a.name === name),
      { id: itemId, name: alpha },
      { timeout: 10000 },
    );
    await expect(abilityRow(page.locator(`#${sheetId}`), alpha)).toHaveCount(0);
  });

  await test.step("the edited ability survives a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    const reopened = await reopenItemSheetViaUI(page, itemId);
    const row = abilityRow(page.locator(`#${reopened}`), beta);
    await expect(row).toBeVisible();
    await expect(row.locator(".role-rank")).toHaveText("2");
    await expect(row.locator(".role-multiplier")).toHaveText("x0.5");
    await expect(row.locator(".role-stat")).toHaveText("BODY");
    await expect(row.locator(".role-skill")).toHaveText("Cybertech");
  });
});

test("Configure Bonuses to Rolls sets bonuses on the main role and its sub-abilities", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "role",
    name: uniqueName("role"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  const gamma = uniqueName("abilityC");

  await test.step("the main role wrench opens the bonuses dialog with defaults", async () => {
    const settings = await openItemSettings(page, sheetId);
    await settings
      .locator('a.select-role-bonuses[data-role-type="mainRole"]')
      .click();
    const dialog = selectRoleBonusesDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator(".dialog-header .text-center")).toContainText(
      "Select role bonuses, Choomba!",
    );
    await expect(dialog.locator('input[name="bonusRatio"]')).toHaveValue("1");
    // Nothing is configured yet.
    for (const value of [
      "attack",
      "damage",
      "damageReduction",
      "initiative",
      "fumbleRecovery",
    ]) {
      await expect(
        dialog.locator(`input[name="universalBonuses"][value="${value}"]`),
      ).not.toBeChecked();
    }
    await expect(
      dialog.locator('input[name="selectedSkills"][value="Cybertech"]'),
    ).not.toBeChecked();
  });

  await test.step("confirming a ratio, a universal bonus and a skill bonus writes them to the role", async () => {
    const dialog = selectRoleBonusesDialog(page);
    await dialog.locator('input[name="bonusRatio"]').fill("2");
    await dialog
      .locator('input[name="universalBonuses"][value="attack"]')
      .check();
    await dialog
      .locator('input[name="selectedSkills"][value="Cybertech"]')
      .check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    await page.waitForFunction(
      (id) => {
        const system = game.items.get(id).system;
        return (
          system.bonusRatio === 2 &&
          system.universalBonuses.includes("attack") &&
          system.bonuses.length === 1 &&
          system.bonuses[0].name === "Cybertech"
        );
      },
      itemId,
      { timeout: 10000 },
    );
  });

  await test.step("the sheet shows the ratio and the configured bonuses", async () => {
    const sheet = page.locator(`#${sheetId}`);
    // The ratio only displays when it differs from 1.
    await expect(
      sheet.locator(".setting-name", { hasText: "1:2" }),
    ).toHaveCount(1);
    await expect(sheet.locator(".compatible-ammo")).toContainText(
      "Bonus to Attack",
    );
    await expect(sheet.locator(".compatible-ammo")).toContainText(
      "Cybertech (TECH)",
    );
  });

  await test.step("the per-row wrench configures bonuses for a single sub-ability", async () => {
    // Create a sub-ability to attach the bonus to.
    await (await openItemSettings(page, sheetId))
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator('input[name="name"]').fill(gamma);
    await dialog.locator('input[name="rank"]').fill("1");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    await abilityRow(page.locator(`#${sheetId}`), gamma)
      .locator('a.select-role-bonuses[data-role-type="subRole"]')
      .click();
    const bonuses = selectRoleBonusesDialog(page);
    await expect(bonuses).toBeVisible({ timeout: 5000 });
    await bonuses
      .locator('input[name="universalBonuses"][value="damage"]')
      .check();
    await bonuses
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(bonuses).toHaveCount(0, { timeout: 5000 });

    // The sub table shows no bonus list of its own, so pin the write on the
    // document.
    await page.waitForFunction(
      ({ id, name }) =>
        game.items
          .get(id)
          .system.abilities.find((a) => a.name === name)
          ?.universalBonuses.includes("damage"),
      { id: itemId, name: gamma },
      { timeout: 10000 },
    );
  });

  await test.step("the configured bonuses survive a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    const reopened = await reopenItemSheetViaUI(page, itemId);
    const sheet = page.locator(`#${reopened}`);
    await openItemSettings(page, reopened);
    await expect(
      sheet.locator(".setting-name", { hasText: "1:2" }),
    ).toHaveCount(1);
    await expect(sheet.locator(".compatible-ammo")).toContainText(
      "Bonus to Attack",
    );
    await expect(sheet.locator(".compatible-ammo")).toContainText(
      "Cybertech (TECH)",
    );
  });
});

test("role skill options come from the owning actor when owned, core and world skills otherwise", async ({
  page,
}) => {
  const skillAName = uniqueName("skillA");
  const skillAId = await createItemViaUI(page, {
    type: "skill",
    name: skillAName,
  });
  await closeDocSheet(page, { collection: "items", id: skillAId });
  const skillBName = uniqueName("skillB");
  const skillBId = await createItemViaUI(page, {
    type: "skill",
    name: skillBName,
  });
  await closeDocSheet(page, { collection: "items", id: skillBId });

  const roleName = uniqueName("role");
  const roleItemId = await createItemViaUI(page, {
    type: "role",
    name: roleName,
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: roleItemId,
  });

  await test.step("a world role offers the core skills plus every world skill", async () => {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId: roleItemId,
      target: "system.hasRoll",
      expected: true,
    });
    const settings = await openItemSettings(page, sheetId);
    const select = settings.locator('select[name="system.skill"]');
    await expect(select.locator(`option[value="${skillAName}"]`)).toHaveCount(
      1,
    );
    await expect(select.locator(`option[value="${skillBName}"]`)).toHaveCount(
      1,
    );
    // A core (internal) skill is part of the world list.
    await expect(select.locator('option[value="Cybertech"]')).toHaveCount(1);
  });

  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("character"),
  });
  const actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });
  // The character owns the role and only one of the two world skills.
  await dragItemToActorSheet(page, {
    itemId: roleItemId,
    sheetId: actorSheetId,
    actorId,
  });
  await dragItemToActorSheet(page, {
    itemId: skillAId,
    sheetId: actorSheetId,
    actorId,
  });

  const embeddedRole = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: roleName },
  );

  let ownedSheetId;
  // The Role tab row is the entry point for an owned role's sheet (and
  // brings it to the front over the actor sheet).
  const openOwnedRoleSettings = async () => {
    if (ownedSheetId)
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedRole });
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="role"]`)
      .click();
    const header = page.locator(
      `#${actorSheetId} .role-item div.collapsible > li.items-header`,
    );
    await expect(header).toBeVisible();
    await header.locator("a.item-edit").first().click();
    ownedSheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: embeddedRole,
    });
    return openItemSettings(page, ownedSheetId);
  };

  await test.step("an owned role offers only its owner's skills", async () => {
    const settings = await openOwnedRoleSettings();
    const select = settings.locator('select[name="system.skill"]');
    await expect(select).toHaveValue("--");
    await expect(select.locator(`option[value="${skillAName}"]`)).toHaveCount(
      1,
    );
    await expect(select.locator(`option[value="${skillBName}"]`)).toHaveCount(
      0,
    );
    // Core skills appear here because every character owns them —
    // CPRActor.create seeds core skills onto new actors — so they come
    // through via the owner's own list. The owned-vs-world discriminator is
    // skillB, a world skill the actor does not own.
    await expect(select.locator('option[value="Cybertech"]')).toHaveCount(1);
  });
});

test("an owned role renders its abilities on the character's Role tab", async ({
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

  await test.step("a character without roles shows the no-roles warning", async () => {
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="role"]`)
      .click();
    await expect(
      page.locator(`#${actorSheetId} .role-tab-content`),
    ).toContainText("No roles defined, drag a role item to the sheet first.");
  });

  const roleName = uniqueName("role");
  const itemId = await createItemViaUI(page, {
    type: "role",
    name: roleName,
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await test.step("build a role with a rollable main ability and two sub-abilities", async () => {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.mainRoleAbility",
      path: "system.mainRoleAbility",
      value: "Custom Main Ability",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.rank",
      path: "system.rank",
      value: 4,
    });
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.hasRoll",
      expected: true,
    });

    // Sub Alpha: no roll.
    await (await openItemSettings(page, sheetId))
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    let dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator('input[name="name"]').fill("Sub Alpha");
    await dialog.locator('input[name="rank"]').fill("1");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    // Sub Beta: rollable (the prompt renders once, so stat/skill stay at
    // their defaults — the tab only needs hasRoll and rank to render).
    await (await openItemSettings(page, sheetId))
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator('input[name="name"]').fill("Sub Beta");
    await dialog.locator('input[name="rank"]').fill("2");
    await dialog.locator('input[name="hasRoll"]').check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    await closeDocSheet(page, { collection: "items", id: itemId });
  });

  await dragItemToActorSheet(page, { itemId, sheetId: actorSheetId, actorId });
  const embeddedId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: roleName },
  );

  const roleBlock = page.locator(`#${actorSheetId} .role-item`);
  const rows = () =>
    roleBlock.locator("div.collapsible > ol.items-list > li.item");

  await test.step("the role renders its main ability and sub-abilities in name order", async () => {
    await expect(roleBlock).toBeVisible();
    await expect(roleBlock.locator("li.items-header")).toContainText(
      `${roleName} Abilities`,
    );

    // Main row: rollable diamond link, rank input, hidden zero mod column.
    const mainRow = rows().first();
    const mainRollable = mainRow.locator(
      'a.rollable[data-roll-subtype="mainRoleAbility"]',
    );
    await expect(mainRollable).toBeVisible();
    await expect(mainRollable).toContainText("Custom Main Ability");
    await expect(mainRow.locator("i.fa-solid.fa-diamond")).toBeVisible();
    await expect(
      mainRow.locator(
        'input.number.ability-input[data-ability-name="Custom Main Ability"]',
      ),
    ).toHaveValue("4");
    // A fresh character has no effects, so the skill mod column is zero and
    // hidden.
    await expect(
      mainRow.locator(".item-detail.ability-rank.zero-not-visible"),
    ).toHaveCount(1);

    // The tab sorts sub-rows by name, so Sub Alpha precedes Sub Beta even
    // though the item stores them in the dialog's descending order.
    const alphaRow = rows().nth(1);
    await expect(alphaRow).toContainText("Sub Alpha");
    await expect(
      alphaRow.locator('a.rollable[data-roll-subtype="subRoleAbility"]'),
    ).toHaveCount(0);
    await expect(
      alphaRow.locator(
        'input.number.ability-input[data-subskill-name="Sub Alpha"]',
      ),
    ).toHaveValue("1");

    const betaRow = rows().nth(2);
    await expect(betaRow).toContainText("Sub Beta");
    await expect(
      betaRow.locator(
        'a.rollable.subskill[data-roll-subtype="subRoleAbility"]',
      ),
    ).toBeVisible();
    await expect(
      betaRow.locator(
        'input.number.ability-input[data-subskill-name="Sub Beta"]',
      ),
    ).toHaveValue("2");
  });

  let ownedSheetId;
  const openOwnedRoleSettings = async () => {
    if (ownedSheetId)
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="role"]`)
      .click();
    const header = roleBlock.locator("div.collapsible > li.items-header");
    await expect(header).toBeVisible();
    await header.locator("a.item-edit").first().click();
    ownedSheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: embeddedId,
    });
    return openItemSettings(page, ownedSheetId);
  };

  await test.step("turning the main ability's Has Roll off removes its rollable link", async () => {
    // Clicking the Role tab brings the actor sheet to the front, so (re)open
    // the owned sheet through its row before interacting with it.
    await openOwnedRoleSettings();
    await toggleItemCheckbox(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      target: "system.hasRoll",
      expected: false,
    });

    const mainRow = rows().first();
    await expect(
      mainRow.locator('a.rollable[data-roll-subtype="mainRoleAbility"]'),
    ).toHaveCount(0);
    await expect(mainRow.locator("span.ability-name")).toContainText(
      "Custom Main Ability",
    );
    // The sub-abilities are untouched.
    await expect(
      rows()
        .nth(2)
        .locator('a.rollable.subskill[data-roll-subtype="subRoleAbility"]'),
    ).toBeVisible();
  });
});
