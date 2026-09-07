import { expect } from "@playwright/test";
import {
  closeDocSheet,
  reopenActorSheetViaUI,
} from "../../../tools/playwright/ui/index.mjs";

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
};

// Wait until the mook actor's persisted fields match `expected` (path -> value).
export async function waitForMookFields(page, actorId, expected) {
  await page.waitForFunction(
    ({ actorId, expected }) => {
      const actor = game.actors.get(actorId);
      if (!actor) return false;
      return Object.entries(expected).every(
        ([path, value]) => foundry.utils.getProperty(actor, path) === value,
      );
    },
    { actorId, expected },
    { timeout: 10000 },
  );
}

// Close a rendered mook sheet and reopen it fresh via the sidebar, returning the
// new element id. The hard-reopen guard used after any mutating step.
export async function closeAndReopenMookSheet(page, actorId) {
  await closeDocSheet(page, { collection: "actors", id: actorId });
  return reopenActorSheetViaUI(page, actorId);
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

// Fill an input on the rendered mook sheet (given as a full CSS selector, e.g.
// MOOK_FIELD.bodyStatInput) and commit it by blurring (Tab). AppV2 sheets persist
// per-field on change/blur, so the blur is the whole save action. The spec owns all
// waits/assertions on the resulting persisted state.
export async function setMookSheetField(page, sheetId, selector, value) {
  const input = page.locator(`#${sheetId} ${selector}`);
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.press("Tab");
}

// Open the reputation ledger window from a rendered mook sheet; returns a locator
// scoped to that window. Only waits for the window surface; the spec owns all
// assertions on the total, history rows, and controls.
export async function openReputationLedger(page, sheetId) {
  await page.locator(`#${sheetId} ${MOOK_FIELD.reputationLedgerIcon}`).click();
  const ledger = page.locator(".application.ledger");
  await expect(ledger).toBeVisible();
  return ledger;
}

// Apply an add / subtract / set change in an open reputation ledger window and wait
// for the new total to persist on the actor (the window re-renders in place from it).
export async function modifyReputationViaLedger(
  page,
  actorId,
  action,
  value,
  reason,
) {
  const before = await page.evaluate(
    (id) => game.actors.get(id)?.system?.reputation?.value,
    actorId,
  );
  const expected =
    action === "add"
      ? before + value
      : action === "subtract"
        ? before - value
        : value;

  const ledger = page.locator(".application.ledger");
  await ledger.locator('input[name="modifyValue"]').fill(String(value));
  await ledger.locator('input[name="reason"]').fill(reason);
  await ledger.locator(`.ledger-edit-button[data-action="${action}"]`).click();
  await waitForMookFields(page, actorId, {
    "system.reputation.value": expected,
  });
}

// Close the reputation ledger window via its header close button.
export async function closeReputationLedger(page) {
  const ledger = page.locator(".application.ledger");
  await ledger.locator('button[data-action="close"]').click();
  await expect(ledger).toBeHidden();
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
