import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  reopenActorSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

export const CTRL_CLICK_MODIFIERS =
  process.platform === "darwin" ? ["Meta"] : ["Control"];

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

export async function setCharacterField(page, sheetId, selector, value) {
  const input = page.locator(`#${sheetId} ${selector}`);
  await expect(input).toBeVisible();
  await input.evaluate((element, nextValue) => {
    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

export async function closeAndReopenCharacterSheet(page, actorId) {
  await closeDocSheet(page, { collection: "actors", id: actorId });
  return reopenActorSheetViaUI(page, actorId);
}

export async function waitForCharacterFields(page, actorId, expected) {
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

export async function openLedgerWindow(page, sheetId, openIconSelector) {
  await page.locator(`#${sheetId} ${openIconSelector}`).click();
  const ledger = page.locator(".application.ledger");
  await expect(ledger).toBeVisible();
  return ledger;
}

export async function applyLedgerChange(
  page,
  actorId,
  fieldPath,
  action,
  value,
  reason,
) {
  const before = await page.evaluate(
    ({ actorId, fieldPath }) => {
      const actor = game.actors.get(actorId);
      return actor ? foundry.utils.getProperty(actor, fieldPath) : undefined;
    },
    { actorId, fieldPath },
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
  await waitForCharacterFields(page, actorId, { [fieldPath]: expected });
}

export async function closeLedgerWindow(page) {
  const ledger = page.locator(".application.ledger");
  await ledger.locator('button[data-action="close"]').click();
  await expect(ledger).toBeHidden();
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

export async function chatMessageCount(page) {
  return page.evaluate(() => game.messages.size);
}

export async function waitForNewChatMessage(
  page,
  before,
  { requireRoll = false, timeout = 10000 } = {},
) {
  return page.waitForFunction(
    ({ before, requireRoll }) => {
      if (game.messages.size <= before) return false;
      const msg = game.messages.contents.at(-1);
      if (!msg) return false;
      if (requireRoll && !msg.rolls.length) return false;
      return msg.id;
    },
    { before, requireRoll },
    { timeout },
  );
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

export function installConsoleErrorHarness() {
  test.beforeEach(async ({ page }) => {
    page.consoleErrors = [];
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
