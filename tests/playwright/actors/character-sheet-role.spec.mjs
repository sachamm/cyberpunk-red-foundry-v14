import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  openOwnedItemSheet,
  openSidebarTab,
  reopenItemSheetViaUI,
  resolveYesNo,
  uniqueName,
  waitForActorFields,
  waitForNewChatMessage,
  yesNoDialog,
} from "../../../tools/playwright/ui/index.mjs";
import {
  addRoleSubskillViaUI,
  chatRollCard,
  configureRoleMainAbilityViaUI,
  createCharacterViaUI,
  createRoleItemViaUI,
  dragRoleItemToCharacter,
  enableRoleRankInRolls,
  openRoleTab,
  rollCardTotal,
  rollDiceSum,
  roleBlock,
  waitForRoleAbilityRank,
} from "./character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Character Role tab: world role items dragged onto the sheet render as
 * `.role-item` blocks with a main-ability row and one row per subskill,
 * sorted by name. Rank inputs persist to the item document through
 * `_updateRoleAbility`; non-numeric input is rejected with an error toast
 * and no update. A rollable main ability posts a CPRRoleRoll card to chat
 * (ctrl/meta-click skips the verify dialog). Deleting a role reassigns
 * `system.roleInfo.activeRole`/`activeNetRole` to the first remaining role
 * by name, or clears both when none remain.
 *
 * Subskill rolling is not covered: there is no UI path to make a subskill
 * rollable. The role-ability dialog's hasRoll checkbox renders
 * value="{{hasRoll}}", and Foundry v13's FormDataExtended returns that
 * attribute ("false") for a checked box, which the BooleanField casts back
 * to false — so checking it never enables rolling (only unchecking an
 * already-rollable ability works).
 */

const MAIN_ABILITY = "Zeb Main";

test("a fresh character's Role tab shows the empty-state warning", async ({
  page,
}) => {
  const { sheetId } = await createCharacterViaUI(page);

  const content = await openRoleTab(page, sheetId);
  await expect(content.locator(".role-tab-content")).toContainText(
    "No roles defined, drag a role item to the sheet first.",
  );
  await expect(content.locator(".role-item")).toHaveCount(0);
});

test("a dragged role renders its header, main-ability row and sorted subskill rows", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const { itemId, name: roleName } = await createRoleItemViaUI(page);
  const itemSheetId = await reopenItemSheetViaUI(page, itemId);
  await configureRoleMainAbilityViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    mainAbility: MAIN_ABILITY,
    rank: 5,
    hasRoll: true,
  });
  await addRoleSubskillViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    name: "Zulu Sub",
    rank: 1,
  });
  await addRoleSubskillViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    name: "Alpha Sub",
    rank: 2,
  });
  await addRoleSubskillViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    name: "Mike Sub",
    rank: 3,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragRoleItemToCharacter(page, { actorId, sheetId, itemId });

  const content = await openRoleTab(page, sheetId);
  const block = roleBlock(content, roleName);
  await expect(block).toHaveCount(1);

  await test.step("the header shows the name, edit link and delete glyph", async () => {
    const header = block.locator(".items-header");
    await expect(header.locator("a.item-edit")).toContainText(roleName);
    await expect(
      header.locator('a.item-action[data-action-type="delete"]'),
    ).toBeVisible();
  });

  await test.step("the main-ability row shows the rollable glyph, MOD cell and rank input", async () => {
    const mainRow = block.locator(
      "li.item.flexrow[draggable]:has(input.number.ability-input:not([data-subskill-name]))",
    );
    await expect(
      mainRow.locator('a.rollable[data-roll-subtype="mainRoleAbility"]'),
    ).toBeVisible();
    await expect(
      mainRow.locator(".item-detail.ability-rank:has(> span)"),
    ).toBeVisible();
    await expect(
      mainRow.locator("input.number.ability-input:not([data-subskill-name])"),
    ).toHaveValue("5");
  });

  await test.step("subskill rows render sorted by name, each with its rank", async () => {
    const rows = block.locator("li.item.flexrow[draggable]:not(.items-header)");
    await expect(rows).toHaveCount(4);
    const names = [];
    for (let i = 1; i < 4; i++) {
      names.push(
        (await rows.nth(i).locator(".ability-name").textContent())?.trim(),
      );
    }
    expect(names).toEqual(["Alpha Sub:", "Mike Sub:", "Zulu Sub:"]);
    await expect(
      block.locator(
        'input.number.ability-input[data-subskill-name="Alpha Sub"]',
      ),
    ).toHaveValue("2");
    await expect(
      block.locator(
        'input.number.ability-input[data-subskill-name="Mike Sub"]',
      ),
    ).toHaveValue("3");
    await expect(
      block.locator(
        'input.number.ability-input[data-subskill-name="Zulu Sub"]',
      ),
    ).toHaveValue("1");
  });

  await test.step("the edit link opens the role item sheet", async () => {
    await block.locator(".items-header a.item-edit").click();
    const openedSheetId = await openOwnedItemSheet(page, { actorId, itemId });
    expect(openedSheetId).toBeTruthy();
    await closeOwnedItemSheet(page, { actorId, itemId });
  });
});

test("editing the main-ability rank persists to the role item", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const { itemId, name: roleName } = await createRoleItemViaUI(page);
  const itemSheetId = await reopenItemSheetViaUI(page, itemId);
  await configureRoleMainAbilityViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    mainAbility: MAIN_ABILITY,
    rank: 2,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragRoleItemToCharacter(page, { actorId, sheetId, itemId });

  const content = await openRoleTab(page, sheetId);
  const input = roleBlock(content, roleName).locator(
    "input.number.ability-input:not([data-subskill-name])",
  );
  await expect(input).toHaveValue("2");

  await test.step("typing a new rank updates the item document", async () => {
    await input.fill("7");
    await input.press("Tab");
    await waitForRoleAbilityRank(page, { actorId, itemId, rank: 7 });
    await expect(input).toHaveValue("7");
  });

  await test.step("the new rank persists on a fresh render", async () => {
    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openRoleTab(page, freshSheet);
    await expect(
      roleBlock(freshContent, roleName).locator(
        "input.number.ability-input:not([data-subskill-name])",
      ),
    ).toHaveValue("7");
  });
});

test("editing a subskill rank persists and leaves the MOD column untouched", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const { itemId, name: roleName } = await createRoleItemViaUI(page);
  const itemSheetId = await reopenItemSheetViaUI(page, itemId);
  await configureRoleMainAbilityViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    mainAbility: MAIN_ABILITY,
    rank: 3,
  });
  await addRoleSubskillViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    name: "Mike Sub",
    rank: 1,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragRoleItemToCharacter(page, { actorId, sheetId, itemId });

  const content = await openRoleTab(page, sheetId);
  const block = roleBlock(content, roleName);
  const subRow = block.locator("li.item.flexrow[draggable]").filter({
    has: page.locator('input[data-subskill-name="Mike Sub"]'),
  });
  const input = subRow.locator(
    'input.number.ability-input[data-subskill-name="Mike Sub"]',
  );
  const modCell = subRow.locator(".item-detail.ability-rank:has(> span)");

  await test.step("the subskill's MOD cell is hidden at zero with no effects", async () => {
    await expect(input).toHaveValue("1");
    await expect(modCell).toHaveClass(/zero-not-visible/);
  });

  await test.step("typing a new subskill rank updates the item document", async () => {
    await input.fill("6");
    await input.press("Tab");
    await waitForRoleAbilityRank(page, {
      actorId,
      itemId,
      subskill: "Mike Sub",
      rank: 6,
    });
    await expect(input).toHaveValue("6");
    await expect(modCell).toHaveClass(/zero-not-visible/);
  });

  await test.step("the new subskill rank persists on a fresh render", async () => {
    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openRoleTab(page, freshSheet);
    const freshBlock = roleBlock(freshContent, roleName);
    await expect(
      freshBlock.locator(
        'input.number.ability-input[data-subskill-name="Mike Sub"]',
      ),
    ).toHaveValue("6");
    await expect(
      freshBlock
        .locator("li.item.flexrow[draggable]")
        .filter({ has: page.locator('input[data-subskill-name="Mike Sub"]') })
        .locator(".item-detail.ability-rank:has(> span)"),
    ).toHaveClass(/zero-not-visible/);
  });
});

test("clearing a rank input is rejected with an error and does not persist", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const { itemId, name: roleName } = await createRoleItemViaUI(page);
  const itemSheetId = await reopenItemSheetViaUI(page, itemId);
  await configureRoleMainAbilityViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    mainAbility: MAIN_ABILITY,
    rank: 3,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragRoleItemToCharacter(page, { actorId, sheetId, itemId });

  const content = await openRoleTab(page, sheetId);
  const input = roleBlock(content, roleName).locator(
    "input.number.ability-input:not([data-subskill-name])",
  );
  await expect(input).toHaveValue("3");

  page.expectedConsoleErrors.push(
    /Error: The amount entered could not be converted to a number!/,
  );
  const errorNotification = page.locator(".notification.error").filter({
    hasText: "The amount entered could not be converted to a number",
  });

  await test.step("clearing the rank input shows an error toast and leaves the document unchanged", async () => {
    await input.fill("");
    await input.press("Tab");
    await expect(errorNotification.first()).toBeVisible({ timeout: 10000 });
    const rank = await page.evaluate(
      ({ actorId, itemId }) =>
        game.actors.get(actorId).items.get(itemId).system.rank,
      { actorId, itemId },
    );
    expect(rank).toBe(3);
  });

  await test.step("the original rank is back on a fresh render", async () => {
    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openRoleTab(page, freshSheet);
    await expect(
      roleBlock(freshContent, roleName).locator(
        "input.number.ability-input:not([data-subskill-name])",
      ),
    ).toHaveValue("3");
  });
});

test("a rollable main ability posts a role roll card to chat", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const { itemId, name: roleName } = await createRoleItemViaUI(page);
  const itemSheetId = await reopenItemSheetViaUI(page, itemId);
  await configureRoleMainAbilityViaUI(page, {
    sheetId: itemSheetId,
    itemId,
    mainAbility: MAIN_ABILITY,
    rank: 4,
    hasRoll: true,
  });
  await enableRoleRankInRolls(page, { sheetId: itemSheetId, itemId });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragRoleItemToCharacter(page, { actorId, sheetId, itemId });

  const content = await openRoleTab(page, sheetId);
  const block = roleBlock(content, roleName);

  const messagesBefore = await chatMessageCount(page);
  await test.step("ctrl-clicking the main glyph posts a dice + rank roll card", async () => {
    await block
      .locator('a.rollable[data-roll-subtype="mainRoleAbility"]')
      .click({ modifiers: CTRL_CLICK_MODIFIERS });
    const messageId = await waitForNewChatMessage(page, messagesBefore, {
      requireRoll: true,
    });
    const rollClass = await page.evaluate(
      (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
      messageId,
    );
    expect(rollClass).toBe("CPRRoleRoll");

    await openSidebarTab(page, "chat");
    const card = chatRollCard(page, messageId);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.locator(".rollcard-top")).toContainText(MAIN_ABILITY);
    const total = await rollCardTotal(card);
    const diceSum = await rollDiceSum(page, messageId);
    expect(total, `total ${total} should equal dice ${diceSum} + rank 4`).toBe(
      diceSum + 4,
    );
  });
});

test("deleting the active role reassigns it, then clears when no roles remain", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const alpha = await createRoleItemViaUI(page, uniqueName("alpha-role"));
  const beta = await createRoleItemViaUI(page, uniqueName("beta-role"));

  await dragRoleItemToCharacter(page, {
    actorId,
    sheetId,
    itemId: alpha.itemId,
  });
  await waitForActorFields(page, actorId, {
    "system.roleInfo.activeRole": alpha.name,
  });
  await dragRoleItemToCharacter(page, {
    actorId,
    sheetId,
    itemId: beta.itemId,
  });

  await test.step("the first dragged role is the active one", async () => {
    await waitForActorFields(page, actorId, {
      "system.roleInfo.activeRole": alpha.name,
      "system.roleInfo.activeNetRole": alpha.itemId,
    });
  });

  const content = await openRoleTab(page, sheetId);
  await expect(roleBlock(content, alpha.name)).toHaveCount(1);
  await expect(roleBlock(content, beta.name)).toHaveCount(1);

  const reassignToast = page.locator(".notification.warning").filter({
    hasText: `Active role now set to the following: ${beta.name}`,
  });

  await test.step("deleting the active role reassigns it to the remaining role", async () => {
    await roleBlock(content, alpha.name)
      .locator('.items-header a.item-action[data-action-type="delete"]')
      .click();
    const dialog = yesNoDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await resolveYesNo(dialog, "yes");

    await expect(roleBlock(content, alpha.name)).toHaveCount(0);
    await waitForActorFields(page, actorId, {
      "system.roleInfo.activeRole": beta.name,
      "system.roleInfo.activeNetRole": beta.itemId,
    });
    await expect(reassignToast.first()).toBeVisible({ timeout: 10000 });
  });

  const noRolesToast = page.locator(".notification.warning").filter({
    hasText: "No roles defined, drag a role item to the sheet first.",
  });

  await test.step("deleting the last role clears both fields and shows the empty state", async () => {
    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openRoleTab(page, freshSheet);
    const betaBlock = roleBlock(freshContent, beta.name);
    await expect(betaBlock).toHaveCount(1);

    await betaBlock
      .locator('.items-header a.item-action[data-action-type="delete"]')
      .click();
    const dialog = yesNoDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await resolveYesNo(dialog, "yes");

    await waitForActorFields(page, actorId, {
      "system.roleInfo.activeRole": "",
      "system.roleInfo.activeNetRole": "",
    });
    await expect(noRolesToast.first()).toBeVisible({ timeout: 10000 });
    await expect(freshContent.locator(".role-item")).toHaveCount(0);
    await expect(freshContent.locator(".role-tab-content")).toContainText(
      "No roles defined, drag a role item to the sheet first.",
    );
  });
});
