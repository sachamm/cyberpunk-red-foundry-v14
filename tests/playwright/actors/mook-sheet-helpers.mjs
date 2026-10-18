import { expect } from "@playwright/test";
import {
  closeDocSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

// Focus a mook item's name/row element and press Delete to trigger its removal
// prompt. The spec owns the subsequent dialog assertions and dismissal.
export async function deleteKeyRemove(page, focusLocator) {
  await focusLocator.focus();
  await page.keyboard.press("Delete");
}

// Wait until an embedded item is gone from the mook after a confirmed removal.
// `game` inside the callback is Foundry's in-page global.
export async function waitItemRemoved(page, { actorId, itemId }) {
  await page.waitForFunction(
    ({ actorId, itemId }) => !game.actors.get(actorId).items.has(itemId),
    { actorId, itemId },
    { timeout: 10000 },
  );
}

// Mook sheet selectors. The mook name is a link (`.change-mook-name`), not an
// input, so the rename dialog's `input[name="name"]` is unambiguous in the DOM.
export const MOOK_FIELD = {
  nameLink: ".change-mook-name",
  dialogNameInput: 'input[name="name"]',
  dialogConfirm: 'button.cpr-dialog-button[data-action="confirm"]',
  dialogCancel: 'button.cpr-dialog-button[data-action="cancel"]',
  bodyStatInput: 'input[name="system.stats.body.value"]',
  hpValueInput: 'input[name="system.derivedStats.hp.value"]',
  hpMaxInput: 'input[name="system.derivedStats.hp.max"]',
  woundStateStat: ".mook-wounded-stat",
  deathSaveRollable: 'a.rollable[data-roll-type="deathsave"]',
  deathSaveValue: ".reset-deathsave-value",
  deathSaveIncrease: ".increase-deathsave-value",
  // Equipped weapons/armor render in the always-visible fight block (no tab). The
  // row root carries a unique data-item-id per item; scope by it to avoid the many
  // inner name/fire-mode/roll nodes that share the same id.
  weaponRow: ".mook-weapon-list .item.weapon-grid",
  armorRow: ".mook-armor .item.armor-grid",
  // The editable name link on an equipped item row (weapon/armor). Click to open its
  // sheet, ctrl-click to send its card to chat, focus + Delete to remove it.
  itemNameLink: ".name.item-edit",
  // Skill pane header (always visible, no tab): the facedown rollable doubles as the
  // reputation display; the sticky-note icon opens the reputation ledger window.
  facedownRollable: 'a.rollable[data-roll-type="facedown"]',
  reputationLedgerIcon: "a.reputation-open-ledger",
  skillsContent: ".mook-skills-content",
  // The pen glyph in the skills header opens the bulk skill edit dialog.
  modMookSkill: "a.mod-mook-skill",
  // Special Gear pane (always visible, no tab): each listed non-cyberware item is a
  // deletable name link carrying data-item-id; cyberware renders above them with the
  // item-view class instead of item-edit.
  specialGearItem: ".mook-special-content .name.item-edit",
  cyberwareItem:
    ".mook-special-content .name.item.installable.changeable.item-view",
  // The pills glyph next to a listed drug's name; clicking it starts the snort
  // (consume) flow. Renders only for drug items.
  snortAction: 'a.item-action[data-action-type="snort"]',
  // The install/uninstall glyphs next to a listed item upgrade's name; the
  // action type flips as the upgrade's installed state changes (the active,
  // uninstall variant also carries the button-active class).
  upgradeInstallAction: 'a.item-action[data-action-type="install-item"]',
  upgradeUninstallAction: 'a.item-action[data-action-type="uninstall-item"]',
  // One entry of the comma-separated skill list; each is a focusable span carrying
  // data-item-id, a rollable name link, and (non-core skills only) an edit glyph.
  skillEntry: ".mook-skills-content .item",
  skillRollable: 'a.rollable[data-roll-type="skill"]',
  skillCustomGlyph: "a.item-edit.skill-custom",
  // Critical Injuries pane (always visible, no tab): the header dice icon starts a
  // table roll; each owned injury is a focusable name link in a comma-separated list.
  criticalInjuryHeader: ".mook-crit-header",
  criticalInjuryContent: ".mook-crit-content",
  criticalInjuryItem: ".mook-crit-content .name.item-edit",
  criticalInjuryRollButton: ".mook-crit a.roll-critical-injury",
  criticalInjuryTableSelect: 'select[name="currentTable"]',
};

// Create a mook via the actor directory and wait for its sheet to render; returns
// { actorId, sheetId }. The standard setup for every mook spec. Pass an explicit
// name when a test must assert against it (the rename tests do).
export async function createMookViaUI(
  page,
  { name = uniqueName("mook") } = {},
) {
  const actorId = await createActorViaUI(page, { type: "mook", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });
  return { actorId, sheetId };
}

// Open the mook rename dialog from a rendered mook sheet; returns a locator scoped
// to that dialog. Only waits for the dialog surface; the spec owns all assertions.
export async function openMookRenameDialog(page, sheetId) {
  await page.locator(`#${sheetId} ${MOOK_FIELD.nameLink}`).click();
  const dialog = page
    .locator(".cpr-dialog")
    .filter({ has: page.locator(MOOK_FIELD.dialogNameInput) });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Fill the rename dialog's name field.
export async function setMookRenameValue(dialog, name) {
  await dialog.locator(MOOK_FIELD.dialogNameInput).fill(name);
}

// Confirm (persist) the rename dialog and wait for it to close.
export async function confirmMookRename(dialog) {
  await dialog.locator(MOOK_FIELD.dialogConfirm).click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
}

// Cancel (discard) the rename dialog and wait for it to close.
export async function cancelMookRename(dialog) {
  await dialog.locator(MOOK_FIELD.dialogCancel).click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
}

// Click the mook's facedown rollable and wait for the verify dialog; returns a
// locator scoped to it. The spec owns the dialog assertions and the confirm/cancel.
export async function openFacedownRollDialog(page, sheetId) {
  await page.locator(`#${sheetId} ${MOOK_FIELD.facedownRollable}`).click();
  const dialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="repValue"]') });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Confirm the facedown verify dialog and wait for it to close.
export async function confirmFacedownRoll(dialog) {
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
}

// Open the bulk mook skill edit dialog from a rendered mook sheet; returns a
// locator scoped to that dialog. Only waits for the dialog surface; the spec owns
// all assertions on its rows and controls.
export async function openMookSkillDialog(page, sheetId) {
  await page.locator(`#${sheetId} ${MOOK_FIELD.modMookSkill}`).click();
  const dialog = page
    .locator(".cpr-dialog")
    .filter({ has: page.locator(".mook-skill-dialog") });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Locate one row of the open bulk skill dialog by its (localized) skill name.
export function mookSkillDialogRow(dialog, nameText) {
  return dialog
    .locator("li.dialog-item.skill-name")
    .filter({ hasText: nameText });
}

// Fill a dialog row's level input. The input has no data-dtype, so the value is
// submitted as a string (the spec owns any assertions on how that is handled).
export async function setMookSkillDialogLevel(row, value) {
  await row.locator("input.number.skill-input").fill(String(value));
}

// Confirm (persist) the bulk skill dialog and wait for it to close.
export async function confirmMookSkillDialog(dialog) {
  await dialog.locator(MOOK_FIELD.dialogConfirm).click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
}

// Cancel (discard) the bulk skill dialog and wait for it to close.
export async function cancelMookSkillDialog(dialog) {
  await dialog.locator(MOOK_FIELD.dialogCancel).click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
}

// Read the persisted level of an owned skill by name (read-only supporting
// evidence; returns null if the mook does not own a skill with that name).
export async function ownedSkillLevel(page, actorId, name) {
  return page.evaluate(
    ({ actorId, name }) =>
      game.actors.get(actorId).itemTypes.skill.find((s) => s.name === name)
        ?.system.level ?? null,
    { actorId, name },
  );
}

// Read the embedded item ids on an actor by name (read-only supporting evidence);
// names with no owned match are omitted from the result.
export async function ownedItemIdsByNames(page, actorId, names) {
  return page.evaluate(
    ({ actorId, names }) => {
      const items = game.actors.get(actorId).items;
      const out = {};
      for (const n of names) {
        const item = items.find((i) => i.name === n);
        if (item) out[n] = item.id;
      }
      return out;
    },
    { actorId, names },
  );
}

export async function coreFoundationalId(page, actorId, type) {
  return page.evaluate(
    ({ actorId, type }) =>
      game.actors
        .get(actorId)
        .itemTypes.cyberware.find(
          (c) => c.system.core === true && c.system.type === type,
        )?.id ?? null,
    { actorId, type },
  );
}

export async function openInstallCyberwareDialog(
  page,
  { itemId, sheetId, actorId },
) {
  await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  const dialog = page.locator(".cpr-dialog").filter({
    has: page.locator('select[name="humanityLossType"]'),
  });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

export async function confirmInstallCyberwareDialog(
  dialog,
  { humanity = "none" } = {},
) {
  if (humanity) {
    await dialog
      .locator('select[name="humanityLossType"]')
      .selectOption(humanity);
  }
  await dialog.locator(MOOK_FIELD.dialogConfirm).click();
  await expect(dialog).toHaveCount(0, { timeout: 10000 });
}

// Create a top-level critical injury via its item sheet, optionally configuring its
// location and death-save flag, close the item sheet, drag it onto the rendered mook
// sheet, and return the embedded item's id (the spec owns all assertions).
export async function seedCriticalInjuryOnMook(
  page,
  {
    actorId,
    sheetId,
    name = uniqueName("criticalInjury"),
    location,
    deathSaveIncrease = false,
  },
) {
  const itemId = await createItemViaUI(page, { type: "criticalInjury", name });
  const itemSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  if (location) {
    await setItemSelected(page, {
      sheetId: itemSheetId,
      itemId,
      name: "system.location",
      value: location,
    });
  }

  if (deathSaveIncrease) {
    const settings = await openItemSettings(page, itemSheetId);
    await settings
      .locator('a.item-checkbox[data-target="system.deathSaveIncrease"]')
      .click();
    await page.waitForFunction(
      (id) => game.items.get(id).system.deathSaveIncrease === true,
      itemId,
      { timeout: 10000 },
    );
  }

  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragItemToActorSheet(page, { itemId, sheetId, actorId });
  const ids = await ownedItemIdsByNames(page, actorId, [name]);
  return ids[name];
}

// Open the critical injury table roll prompt from a rendered mook sheet; returns a
// locator scoped to that dialog. Only waits for the dialog surface; the spec owns all
// assertions on its table options and confirm/cancel behavior.
export async function openCriticalInjuryRollDialog(page, sheetId) {
  await page
    .locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryRollButton}`)
    .click();
  const dialog = page
    .locator(".cpr-dialog")
    .filter({ has: page.locator(MOOK_FIELD.criticalInjuryTableSelect) });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

// Confirm the critical injury roll prompt, optionally choosing a named table first, and
// wait for it to close. The table draw itself is async; the spec waits for the resulting
// injury entry and chat card.
export async function confirmCriticalInjuryRoll(dialog, { table } = {}) {
  if (table) {
    await dialog
      .locator(MOOK_FIELD.criticalInjuryTableSelect)
      .selectOption({ label: table });
  }
  await dialog.locator(MOOK_FIELD.dialogConfirm).click();
  await expect(dialog).toHaveCount(0, { timeout: 10000 });
}

// Cancel the critical injury roll prompt and wait for it to close.
export async function cancelCriticalInjuryRollDialog(dialog) {
  await dialog.locator(MOOK_FIELD.dialogCancel).click();
  await expect(dialog).toHaveCount(0, { timeout: 10000 });
}
