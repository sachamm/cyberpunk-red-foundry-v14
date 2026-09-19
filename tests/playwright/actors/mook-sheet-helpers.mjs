import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  reopenActorSheetViaUI,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

// macOS Chromium treats Ctrl+click as a right-click (context menu) and never dispatches
// `click`, so use Cmd there instead. The click handlers accept both ctrlKey/metaKey.
export const CTRL_CLICK_MODIFIERS =
  process.platform === "darwin" ? ["Meta"] : ["Control"];

// The yes/no confirmation dialog used by destructive mook actions (delete, snort,
// uninstall). Returns the dialog locator; the spec owns every visibility/text/count
// assertion. Dismiss it with resolveYesNo(dialog, "yes" | "no").
export function yesNoDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator(".cpr-dialog-message"),
  });
}

export async function resolveYesNo(dialog, action) {
  await dialog.locator(`button[data-action="${action}"]`).click();
}

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

// Wait until an owned skill's persisted level equals the expected value (the
// proof that a dialog edit or Delete-key reset actually landed on the document).
export async function waitForSkillLevel(page, actorId, name, level) {
  await page.waitForFunction(
    ({ actorId, name, level }) => {
      const skill = game.actors
        .get(actorId)
        .itemTypes.skill.find((s) => s.name === name);
      return skill && skill.system.level === level;
    },
    { actorId, name, level },
    { timeout: 10000 },
  );
}

// Snapshot the chat log size; pair with waitForNewChatMessage to detect a message
// posted by an action taken in between.
export async function chatMessageCount(page) {
  return page.evaluate(() => game.messages.size);
}

// After the caller triggers an action, wait for a new chat message and return its
// id. With requireRoll, waits until the newest message carries at least one roll
// (roll actions post their roll on the message); with requireContent, until it
// carries content (item cards post to chat as plain messages). Read-only; specs
// own all card assertions.
export async function waitForNewChatMessage(
  page,
  before,
  { requireRoll = false, requireContent = false, timeout = 10000 } = {},
) {
  return page.waitForFunction(
    ({ before, requireRoll, requireContent }) => {
      if (game.messages.size <= before) return false;
      const msg = game.messages.contents.at(-1);
      if (!msg) return false;
      if (requireRoll && !msg.rolls.length) return false;
      if (requireContent && !msg.content) return false;
      return msg.id;
    },
    { before, requireRoll, requireContent },
    { timeout },
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

/**
 * Register the console-error harness shared by all mook sheet specs.
 * beforeEach navigates to the ready world and collects console errors;
 * afterEach fails the test on any uncaught exception or console error not
 * registered as expected via page.expectedConsoleErrors.
 */
export function installConsoleErrorHarness() {
  test.beforeEach(async ({ page }) => {
    page.consoleErrors = [];
    // Tests that intentionally trigger a console error (e.g. via
    // DisplayMessage("error")) register a matching RegExp here so afterEach
    // ignores exactly those messages. Uncaught exceptions always fail.
    page.expectedConsoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") page.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      page.consoleErrors.push(`uncaught exception: ${err.message}`);
    });
    await gotoReadyWorld(page);
  });

  test.afterEach(async ({ page }) => {
    const unexpected = page.consoleErrors.filter(
      (text) =>
        text.startsWith("uncaught exception:") ||
        !page.expectedConsoleErrors.some((re) => re.test(text)),
    );
    expect(
      unexpected,
      `console errors during test:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });
}
