import { expect } from "@playwright/test";
import {
  activateGearTab,
  closeDocSheet,
  createActorViaUI,
  createInventoryItemViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

export const CHARACTER_FIELD = {
  nameInput: 'input[name="name"]',
  roleInput: 'input[name="system.roleInfo.activeRole"]',
  hpValueInput: 'input[name="system.derivedStats.hp.value"]',
  hpMaxInput: 'input[name="system.derivedStats.hp.max"]',
  calculateHp: "a.calculate-hp",
  humanityValueInput: 'input[name="system.derivedStats.humanity.value"]',
  humanityMaxInput: 'input[name="system.derivedStats.humanity.max"]',
  calculateHumanity: "a.calculate-humanity",
  deathSaveRollable: 'a.rollable[data-roll-type="deathsave"]',
  deathSaveIncrease: ".increase-deathsave-value",
  deathSaveReset: ".reset-deathsave-value",
  deathSaveValue: ".actor-details-death-save-value",
  woundStateImage: ".actor-details-wound-state-value img",
  improvementPointsValue: ".actor-details-improvement-points-value",
  improvementPointsLedgerIcon: "a.improvement-points-open-ledger",
  facedownRollable: 'a.rollable[data-roll-type="facedown"]',
  reputationValue: ".actor-details-reputation-value",
  reputationLedgerIcon: "a.reputation-open-ledger",
  eurobucksValue: ".actor-details-eurobucks-value",
  eurobucksLedgerIcon: "a.eurobucks-open-ledger",
};

export const statRollable = (stat) =>
  `a.rollable[data-roll-type="stat"][data-roll-title="${stat}"]`;

export const statValueInput = (stat) =>
  `input[name="system.stats.${stat}.value"]`;

export const statMaxInput = (stat) => `input[name="system.stats.${stat}.max"]`;

export async function createCharacterViaUI(
  page,
  { name = uniqueName("character") } = {},
) {
  const actorId = await createActorViaUI(page, { type: "character", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });
  return { actorId, sheetId };
}

export async function createRoleItemViaUI(page, name = uniqueName("role")) {
  const itemId = await createItemViaUI(page, { type: "role", name });
  await closeDocSheet(page, { collection: "items", id: itemId });
  return { itemId, name };
}

export async function dragRoleItemToCharacter(
  page,
  { actorId, sheetId, itemId },
) {
  await dragItemToActorSheet(page, { itemId, sheetId, actorId });
}

export async function openStatRollDialog(page, sheetId, stat) {
  await page.locator(`#${sheetId} ${statRollable(stat)}`).click();
  const dialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="luck"]') });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function setStatRollLuck(dialog, value) {
  await dialog.locator('input[name="luck"]').fill(String(value));
}

export async function confirmRollDialog(dialog) {
  const confirm = dialog.locator(
    'button.cpr-dialog-button[data-action="confirm"]',
  );
  await expect(async () => {
    await confirm.click();
    await expect(dialog).toHaveCount(0, { timeout: 2000 });
  }).toPass({ timeout: 20000 });
}

// The skill roll verify dialog, opened by a plain click on a skill's rollable
// link. Returns the dialog locator; the spec owns every visibility/field/count
// assertion and the dismissal.
export function skillRollDialog(page) {
  return page.locator(".application").filter({
    has: page.locator('input[name="skillValue"]'),
  });
}

// The chat message card for a posted roll, located by its message id.
export function chatRollCard(page, messageId) {
  return page.locator(`#chat .chat-message[data-message-id="${messageId}"]`);
}

// The numeric total shown on a roll card (.d10-number-div span.clickable).
export async function rollCardTotal(card) {
  const text = await card
    .locator(".d10-number-div span.clickable")
    .textContent();
  return Number(text);
}

// Sum of the first dice term's results for a chat message (the raw dice total,
// before stat/level mods are added on top).
export async function rollDiceSum(page, messageId) {
  return page.evaluate((id) => {
    const term = game.messages.get(id).rolls?.[0]?.dice?.[0];
    return term?.results.reduce((t, r) => t + (r.count ?? r.result), 0) ?? 0;
  }, messageId);
}

// Skills tab selectors. Rows are located through their rollable name link; the
// category blocks live in two columns (categories before "f" render left, the
// rest right). A fresh character owns 63 seeded skills from the internal pack.
export const SKILL_FIELD = {
  rollable: (name) =>
    `a.rollable[data-roll-type="skill"][data-roll-title="${name}"]`,
  statPill: ".item-name .text-pill",
  levelInput: 'input.number.skill-input[data-item-prop="system.level"]',
  base: ".skill-base",
  modValue: ".skill-mod-value span",
  favoriteGlyph: 'a.item-action[data-action-type="favorite"]',
  editGlyph: "a.item-edit.skill-custom",
  deleteGlyph: 'a.item-action.skill-custom[data-action-type="delete"]',
};

// One skill row on the character sheet, located by its rollable name link.
export function characterSkillRow(page, sheetId, name) {
  return page.locator(`#${sheetId} li.item`, {
    has: page.locator(SKILL_FIELD.rollable(name)),
  });
}

// The collapsible block (header + rows) of one skill category in a column.
export function skillCategorySection(page, sheetId, column, category) {
  const list =
    column === "left" ? "ol.left-pane-skills" : "ol.right-pane-skills";
  return page.locator(`#${sheetId} ${list} .collapsible`, {
    has: page.locator(`#skillTab-${category}`),
  });
}

// The chevron header that collapses/expands a whole skill category.
export function skillCategoryHeader(page, sheetId, category) {
  return page.locator(`#${sheetId} .expand-button#skillTab-${category}`);
}

// The eye glyph that toggles a category between all skills and favorites only.
export function skillCategoryEyeToggle(page, sheetId, category) {
  return page.locator(`#${sheetId} #skillTab-${category}-showFavorites`);
}

// Create a world skill item via its settings sheet (stat/category/level/
// difficulty), close it, and drag it onto the rendered character sheet; returns
// the name and embedded id. Skills are not equippable, so the drop just embeds
// the item.
export async function addSkillToCharacter(
  page,
  {
    actorId,
    sheetId,
    name = uniqueName("skill"),
    stat,
    category,
    level,
    difficulty,
  },
) {
  const itemId = await createItemViaUI(page, { type: "skill", name });
  const itemSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  if (stat) {
    await setItemSelected(page, {
      sheetId: itemSheetId,
      itemId,
      name: "system.stat",
      value: stat,
    });
  }
  if (category) {
    await setItemSelected(page, {
      sheetId: itemSheetId,
      itemId,
      name: "system.category",
      value: category,
    });
  }
  if (level !== undefined) {
    await setItemField(page, {
      sheetId: itemSheetId,
      itemId,
      name: "system.level",
      path: "system.level",
      value: level,
    });
  }
  if (difficulty) {
    await setItemSelected(page, {
      sheetId: itemSheetId,
      itemId,
      name: "system.difficulty",
      value: difficulty,
    });
  }
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  return { name, embeddedId: await ownedSkillEmbeddedId(page, actorId, name) };
}

// Read the embedded id of an owned skill by name (read-only supporting
// evidence; null if the character does not own a skill with that name).
export async function ownedSkillEmbeddedId(page, actorId, name) {
  return page.evaluate(
    ({ actorId, name }) =>
      game.actors.get(actorId).itemTypes.skill.find((s) => s.name === name)
        ?.id ?? null,
    { actorId, name },
  );
}

// Wait until an owned skill is gone from the character after a confirmed delete.
export async function waitForSkillRemoved(page, actorId, name) {
  await page.waitForFunction(
    ({ actorId, name }) =>
      !game.actors.get(actorId).itemTypes.skill.some((s) => s.name === name),
    { actorId, name },
    { timeout: 10000 },
  );
}

/**
 * Locator for a single gear row on a character sheet by its owned item id.
 */
export function gearRow(page, sheetId, itemId) {
  return page.locator(`#${sheetId} li.item[data-item-id="${itemId}"]`);
}

/**
 * Locator for a gear category's header span (the clickable toggle that
 * collapses/expands the category). `type` is an inventory category key such as
 * "weapon", "drug", "gear".
 */
export function gearCategoryHeader(page, sheetId, type) {
  return page.locator(`#${sheetId} .expand-button#gearTab-${type}`);
}

/**
 * Open the Gear tab of a character sheet and return its active content wrapper.
 */
export async function openGearTab(page, sheetId) {
  return activateGearTab(page, sheetId);
}

/**
 * Locator for the icon inside a gear row's equip glyph showing its current
 * state: "owned" (circle-notch), "carried" (suitcase), or "equipped" (hand).
 */
export function equipStateIcon(row, state) {
  const icons = {
    owned: "i.fa-circle-notch",
    carried: "i.fa-suitcase",
    equipped: "i.fa-hand",
  };
  return row.locator(`a.equip ${icons[state]}`);
}

/**
 * Locator for the manage-upgrades (select installable items) dialog.
 */
export function manageUpgradesDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="selectedItems"]'),
  });
}

/**
 * Locator for the select-ammo dialog opened by a weapon's reload or
 * change-ammo glyph. Returns the dialog locator; the spec owns every
 * visibility/text/count assertion and the dismissal.
 */
export function selectAmmoDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('select[name="selectedAmmo"]'),
  });
}

/**
 * Open the Lifepath tab of a character sheet and return its content wrapper.
 */
export async function openLifepathTab(page, sheetId) {
  await page
    .locator(`#${sheetId} .navtabs-bottom a[data-tab="lifepath"]`)
    .click();
  const content = page.locator(
    `#${sheetId} .tab.lifepath-tab[data-tab="lifepath"]`,
  );
  await expect(content).toBeVisible();
  return content;
}

/**
 * The "Set Lifepath" dialog opened by the lifepath tab's wrench glyph. Returns
 * the dialog locator; the spec owns every visibility/field/count assertion and
 * the dismissal.
 */
export function lifepathDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('textarea[name="culturalOrigin"]'),
  });
}

/**
 * Locator for one lifepath section's value div on the tab, by its section
 * class (e.g. "cultural-origins", "personality", "life-goals").
 */
export function lifepathValue(content, section) {
  return content.locator(`.${section} .lifepath-value`);
}

/**
 * Install an owned upgrade into a container item through the manage-upgrades
 * dialog on the parent's gear row: open it, check the upgrade's checkbox, and
 * confirm. Waits until the parent's installed list contains the upgrade.
 */
export async function installUpgradeViaUI(
  page,
  { sheetId, actorId, itemId, upgradeId },
) {
  const row = gearRow(page, sheetId, itemId);
  await row.locator('a[data-action-type="manage-upgrades"]').click();
  const dialog = manageUpgradesDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog
    .locator(`input[name="selectedItems"][value="${upgradeId}"]`)
    .check();
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
  await page.waitForFunction(
    ({ actorId, itemId, upgradeId }) =>
      game.actors
        .get(actorId)
        .items.get(itemId)
        .system.installedItems.list.includes(upgradeId),
    { actorId, itemId, upgradeId },
    { timeout: 10000 },
  );
}

/* ------------------------------------------------------------------ *
 * Role tab
 * ------------------------------------------------------------------ */

/**
 * Open the Role tab of a character sheet and return its content wrapper.
 */
export async function openRoleTab(page, sheetId) {
  await page.locator(`#${sheetId} .navtabs-bottom a[data-tab="role"]`).click();
  const content = page.locator(`#${sheetId} .tab.role-tab[data-tab="role"]`);
  await expect(content).toBeVisible();
  return content;
}

/**
 * The `.role-item` block for one role on the Role tab, by role name.
 */
export function roleBlock(content, name) {
  return content.locator(".role-item").filter({ hasText: name });
}

/**
 * Configure a world role item's main ability through its Settings tab: set
 * the ability name and rank, then optionally enable rolling. Waits for each
 * change to land on the item document. The addRoleAbilityRank row only
 * renders once hasRoll is on, so call enableRoleRankInRolls afterwards.
 */
export async function configureRoleMainAbilityViaUI(
  page,
  { sheetId, itemId, mainAbility, rank, hasRoll = false },
) {
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.mainRoleAbility",
    path: "system.mainRoleAbility",
    value: mainAbility,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.rank",
    path: "system.rank",
    value: rank,
  });
  if (hasRoll) {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.hasRoll",
      expected: true,
    });
  }
}

/**
 * Enable the "add the role ability rank to rolls" option on a world role
 * item. The row only renders when hasRoll is already on, so this must run
 * after configureRoleMainAbilityViaUI(..., { hasRoll: true }).
 */
export async function enableRoleRankInRolls(page, { sheetId, itemId }) {
  await toggleItemCheckbox(page, {
    sheetId,
    itemId,
    target: "system.addRoleAbilityRank",
    expected: true,
  });
}

/**
 * The create/edit subskill dialog on a role item's Settings tab.
 */
export function roleAbilityDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator('input[name="hasRoll"]'),
  });
}

/**
 * Add a subskill to a world role item through the Settings tab's create
 * glyph and dialog. The dialog renders stat/skill/multiplier selects only
 * when the ability is already rollable, so a freshly created subskill keeps
 * the schema defaults (stat "--", skill "--") and hasRoll false — the
 * dialog's hasRoll checkbox cannot enable rolling on a new subskill (see the
 * note in character-sheet-role.spec.mjs). Waits for the subskill to land on
 * the item document.
 */
export async function addRoleSubskillViaUI(
  page,
  { sheetId, itemId, name, rank },
) {
  const sheet = await openItemSettings(page, sheetId);
  await sheet
    .locator('a.role-ability-action[data-action-type="create"]')
    .click();
  const dialog = roleAbilityDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('input[name="rank"]').fill(String(rank));
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
  await page.waitForFunction(
    ({ itemId, name }) =>
      game.items.get(itemId).system.abilities.some((a) => a.name === name),
    { itemId, name },
    { timeout: 10000 },
  );
}

/**
 * Wait until an owned role item's main rank (subskill null) or one of its
 * subskills' ranks equals the expected value.
 */
export async function waitForRoleAbilityRank(
  page,
  { actorId, itemId, subskill = null, rank },
) {
  await page.waitForFunction(
    ({ actorId, itemId, subskill, rank }) => {
      const item = game.actors.get(actorId)?.items.get(itemId);
      if (!item) return false;
      if (subskill === null) return item.system.rank === rank;
      return (
        item.system.abilities.find((a) => a.name === subskill)?.rank === rank
      );
    },
    { actorId, itemId, subskill, rank },
    { timeout: 10000 },
  );
}

/* ------------------------------------------------------------------ *
 * Fight tab
 * ------------------------------------------------------------------ */

/**
 * Open the Fight tab of a character sheet and return its content wrapper.
 */
export async function openFightTab(page, sheetId) {
  await page.locator(`#${sheetId} .navtabs-bottom a[data-tab="fight"]`).click();
  const content = page.locator(`#${sheetId} .tab.fight-tab[data-tab="fight"]`);
  await expect(content).toBeVisible();
  return content;
}

/**
 * Locator for one equipped weapon row in the Fight tab's Meatspace view.
 */
export function fightWeaponRow(page, sheetId, itemId) {
  return page.locator(
    `#${sheetId} .item.weapon-grid[data-item-id="${itemId}"]`,
  );
}

/**
 * Locator for one equipped armor row in the Fight tab's Meatspace view.
 */
export function fightArmorRow(page, sheetId, itemId) {
  return page.locator(`#${sheetId} .item.armor-grid[data-item-id="${itemId}"]`);
}

/**
 * Create an item in a character's inventory via the gear tab's + button and
 * equip it: two clicks on the row's equip glyph cycle owned -> carried ->
 * equipped, waiting for each state to land on the item document. Returns the
 * created item id and a refreshed sheet id.
 */
export async function createEquippedItemViaUI(
  page,
  { actorId, sheetId, itemType, itemName, data },
) {
  const created = await createInventoryItemViaUI(page, {
    actorId,
    sheetId,
    itemType,
    itemName,
    data,
  });
  const row = gearRow(page, created.sheetId, created.itemId);
  for (const state of ["carried", "equipped"]) {
    await row.locator("a.equip").click();
    await page.waitForFunction(
      ({ actorId, itemId, state }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped === state,
      { actorId, itemId: created.itemId, state },
      { timeout: 10000 },
    );
  }
  return created;
}

/**
 * Install an owned program into a cyberdeck through the deck gear row's
 * manage-programs glyph (the same select-installable-items dialog as
 * manage-upgrades). Waits until the deck's installed list contains the
 * program.
 */
export async function installProgramIntoDeckViaUI(
  page,
  { sheetId, actorId, deckId, programId },
) {
  const row = gearRow(page, sheetId, deckId);
  await row.locator('a[data-action-type="manage-programs"]').click();
  const dialog = manageUpgradesDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog
    .locator(`input[name="selectedItems"][value="${programId}"]`)
    .check();
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
  await page.waitForFunction(
    ({ actorId, deckId, programId }) =>
      game.actors
        .get(actorId)
        .items.get(deckId)
        .system.installedItems.list.includes(programId),
    { actorId, deckId, programId },
    { timeout: 10000 },
  );
}
