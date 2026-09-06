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
