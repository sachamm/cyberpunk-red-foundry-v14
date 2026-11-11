import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
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

function selectRoleBonusesDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="bonusRatio"]'),
  });
}

test("retains Configure Bonuses to Rolls selections for a role sub-ability (#1450)", async ({
  page,
}) => {
  const abilityName = uniqueName("roleAbility");
  let itemId;
  let sheetId;

  await test.step("create the role item and its sub-ability", async () => {
    itemId = await createItemViaUI(page, {
      type: "role",
      name: uniqueName("role"),
    });
    sheetId = await expectSheetRendered(page, {
      collection: "items",
      id: itemId,
    });

    const settings = await openItemSettings(page, sheetId);
    await settings
      .locator('a.role-ability-action[data-action-type="create"]')
      .click();
    const dialog = roleAbilityDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator('input[name="name"]').fill(abilityName);
    await dialog.locator('input[name="rank"]').fill("1");
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });

    const row = page
      .locator(`#${sheetId}`)
      .locator("li.item.role-name", { hasText: abilityName });
    await expect(row).toBeVisible({ timeout: 5000 });
  });

  const openSubAbilityBonusesDialog = async () => {
    await openItemSettings(page, sheetId);
    const row = page
      .locator(`#${sheetId}`)
      .locator("li.item.role-name", { hasText: abilityName });
    await expect(row).toBeVisible({ timeout: 5000 });
    await row
      .locator('a.select-role-bonuses[data-role-type="subRole"]')
      .click();
    const dialog = selectRoleBonusesDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    return dialog;
  };

  const storedAbility = () =>
    page.evaluate(
      ({ id, name }) => {
        const ability = game.items
          .get(id)
          .system.abilities.find((a) => a.name === name);
        return {
          bonusNames: (ability.bonuses ?? []).map((b) => b.name),
          universalBonuses: ability.universalBonuses ?? [],
          isSituational: ability.isSituational,
          onByDefault: ability.onByDefault,
        };
      },
      { id: itemId, name: abilityName },
    );

  await test.step("selected skills and universal bonuses are retained after close/reopen", async () => {
    const dialog = await openSubAbilityBonusesDialog();
    await dialog
      .locator('input[name="selectedSkills"][value="Brawling"]')
      .check();
    await dialog
      .locator('input[name="universalBonuses"][value="damage"]')
      .check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const reopened = await openSubAbilityBonusesDialog();
    await expect
      .soft(reopened.locator('input[name="selectedSkills"][value="Brawling"]'))
      .toBeChecked();
    await expect
      .soft(reopened.locator('input[name="universalBonuses"][value="damage"]'))
      .toBeChecked();
    expect.soft(await storedAbility()).toEqual({
      bonusNames: ["Brawling"],
      universalBonuses: ["damage"],
      isSituational: false,
      onByDefault: false,
    });
    await reopened
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(reopened).toHaveCount(0, { timeout: 5000 });
  });

  await test.step("Situational? and On-by-default are selectable and retained after close/reopen", async () => {
    const dialog = await openSubAbilityBonusesDialog();
    const situational = dialog.locator('input[name="isSituational"]');
    const onByDefault = dialog.locator('input[name="onByDefault"]');
    await expect(situational).toBeVisible({ timeout: 5000 });
    await expect(onByDefault).toBeVisible({ timeout: 5000 });
    await situational.check();
    await onByDefault.check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const reopened = await openSubAbilityBonusesDialog();
    await expect
      .soft(reopened.locator('input[name="isSituational"]'))
      .toBeChecked();
    await expect
      .soft(reopened.locator('input[name="onByDefault"]'))
      .toBeChecked();
    expect.soft(await storedAbility()).toEqual({
      bonusNames: ["Brawling"],
      universalBonuses: ["damage"],
      isSituational: true,
      onByDefault: true,
    });
    await reopened
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(reopened).toHaveCount(0, { timeout: 5000 });
  });
});
