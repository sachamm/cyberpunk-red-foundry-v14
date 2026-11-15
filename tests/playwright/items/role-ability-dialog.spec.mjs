import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  checkboxGeometry,
  createItemViaUI,
  expectSheetRendered,
  openItemSettings,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

function roleAbilityDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="rank"]'),
  });
}

test("Has roll registers and persists in the Create/Edit Role Ability dialog", async ({
  page,
}) => {
  const abilityName = uniqueName("rollAbility");
  const plainName = uniqueName("plainAbility");
  let itemId;
  let sheetId;

  await test.step("create the role item", async () => {
    itemId = await createItemViaUI(page, {
      type: "role",
      name: uniqueName("role"),
    });
    sheetId = await expectSheetRendered(page, {
      collection: "items",
      id: itemId,
    });
  });

  const openAbilityRow = async (name) => {
    await openItemSettings(page, sheetId);
    const row = page
      .locator(`#${sheetId}`)
      .locator("li.item.role-name", { hasText: name });
    await expect(row).toBeVisible({ timeout: 5000 });
    return row;
  };

  const storedAbility = (name) =>
    page.evaluate(
      ({ id, name }) => {
        const ability = game.items
          .get(id)
          .system.abilities.find((a) => a.name === name);
        return {
          hasRoll: ability.hasRoll,
          multiplier: ability.multiplier,
          stat: ability.stat,
          skillName:
            typeof ability.skill === "string"
              ? ability.skill
              : ability.skill?.name,
        };
      },
      { id: itemId, name },
    );

  await test.step("creating with Has roll checked persists the checkbox and its selections", async () => {
    const settings = await openItemSettings(page, sheetId);
    await settings
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The multiplier/stat/skill rows are hidden until Has roll is checked.
    await expect(dialog.locator('select[name="multiplier"]')).toHaveCount(1);
    await expect(dialog.locator('select[name="stat"]')).toHaveCount(1);
    await expect(dialog.locator('select[name="skill"]')).toHaveCount(1);
    await expect(dialog.locator('select[name="multiplier"]')).toBeHidden();
    await expect(dialog.locator('select[name="stat"]')).toBeHidden();
    await expect(dialog.locator('select[name="skill"]')).toBeHidden();

    await dialog.locator('input[name="name"]').fill(abilityName);
    await dialog.locator('input[name="rank"]').fill("2");

    // The checkbox must keep one deterministic square box in both states; v13
    // otherwise sizes it from the glyph advance, so the checked layers shift.
    const uncheckedBox = await checkboxGeometry(
      dialog.locator('input[name="hasRoll"]'),
    );
    await dialog.locator('input[name="hasRoll"]').check();
    const checkedBox = await checkboxGeometry(
      dialog.locator('input[name="hasRoll"]'),
    );
    expect(uncheckedBox.width).toBeCloseTo(uncheckedBox.height, 1);
    expect(checkedBox.width).toBeCloseTo(checkedBox.height, 1);
    expect(checkedBox.width).toBeCloseTo(uncheckedBox.width, 1);
    expect(checkedBox.height).toBeCloseTo(uncheckedBox.height, 1);

    // Checking Has roll reveals the dependent rows.
    await expect(dialog.locator('select[name="multiplier"]')).toBeVisible();
    await expect(dialog.locator('select[name="stat"]')).toBeVisible();
    await expect(dialog.locator('select[name="skill"]')).toBeVisible();
    await dialog.locator('select[name="multiplier"]').selectOption("2");
    await dialog.locator('select[name="stat"]').selectOption("int");
    await dialog.locator('select[name="skill"]').selectOption("Brawling");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const row = await openAbilityRow(abilityName);
    await row.locator('a.role-ability-action[data-action-type="edit"]').click();
    const reopened = roleAbilityDialog(page);
    await expect(reopened).toBeVisible({ timeout: 5000 });
    await expect.soft(reopened.locator('input[name="hasRoll"]')).toBeChecked();
    // With Has roll stored, the dependent rows are visible from first open.
    await expect(reopened.locator('select[name="multiplier"]')).toBeVisible();
    await expect(reopened.locator('select[name="stat"]')).toBeVisible();
    await expect(reopened.locator('select[name="skill"]')).toBeVisible();
    await expect
      .soft(reopened.locator('select[name="multiplier"]'))
      .toHaveValue("2");
    await expect
      .soft(reopened.locator('select[name="stat"]'))
      .toHaveValue("int");
    await expect
      .soft(reopened.locator('select[name="skill"]'))
      .toHaveValue("Brawling");
    expect.soft(await storedAbility(abilityName)).toEqual({
      hasRoll: true,
      multiplier: 2,
      stat: "int",
      skillName: "Brawling",
    });
    await reopened
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(reopened).toHaveCount(0, { timeout: 5000 });
  });

  await test.step("editing an ability with Has roll on and unchecking clears it", async () => {
    const row = await openAbilityRow(abilityName);
    await row.locator('a.role-ability-action[data-action-type="edit"]').click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('input[name="hasRoll"]')).toBeChecked();
    await dialog.locator('input[name="hasRoll"]').uncheck();

    // Unchecking hides the dependent rows again; their values are retained.
    await expect(dialog.locator('select[name="multiplier"]')).toBeHidden();
    await expect(dialog.locator('select[name="stat"]')).toBeHidden();
    await expect(dialog.locator('select[name="skill"]')).toBeHidden();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const reopenedRow = await openAbilityRow(abilityName);
    await reopenedRow
      .locator('a.role-ability-action[data-action-type="edit"]')
      .click();
    const reopened = roleAbilityDialog(page);
    await expect(reopened).toBeVisible({ timeout: 5000 });
    await expect
      .soft(reopened.locator('input[name="hasRoll"]'))
      .not.toBeChecked();
    expect.soft(await storedAbility(abilityName)).toEqual({
      hasRoll: false,
      multiplier: 2,
      stat: "int",
      skillName: "Brawling",
    });
    await reopened
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(reopened).toHaveCount(0, { timeout: 5000 });
  });

  await test.step("creating without Has roll leaves it off with inert defaults", async () => {
    const settings = await openItemSettings(page, sheetId);
    await settings
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The multiplier/stat/skill rows stay hidden while Has roll is unchecked.
    await expect(dialog.locator('select[name="multiplier"]')).toBeHidden();
    await expect(dialog.locator('input[name="hasRoll"]')).not.toBeChecked();

    await dialog.locator('input[name="name"]').fill(plainName);
    await dialog.locator('input[name="rank"]').fill("1");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    await openAbilityRow(plainName);
    expect.soft(await storedAbility(plainName)).toEqual({
      hasRoll: false,
      multiplier: 1,
      stat: "--",
      skillName: "--",
    });
  });
});
