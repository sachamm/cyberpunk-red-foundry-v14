import { expect } from "@playwright/test";
import { chatMessageCount, waitForNewChatMessage } from "./chat.mjs";
import { createDocumentViaUI } from "./documents.mjs";
import { CTRL_CLICK_MODIFIERS, closeDocSheet } from "./sheets.mjs";
import { openSidebarTab } from "./sidebar.mjs";

export const ACTOR_TYPES = [
  "blackIce",
  "character",
  "container",
  "demon",
  "mook",
];

export async function createActorViaUI(page, { type = "character", name }) {
  return createDocumentViaUI(page, { documentTab: "actors", type, name });
}

export async function reopenActorSheetViaUI(page, actorId) {
  await openSidebarTab(page, "actors");
  const entry = page.locator(`#actors [data-entry-id="${actorId}"]`);
  await expect(entry).toBeVisible();
  await entry.click();

  await page.waitForFunction(
    (id) => game.actors.get(id)?.sheet?.rendered === true,
    actorId,
    { timeout: 15000 },
  );
  const elementId = await page.evaluate((id) => {
    const sheet = game.actors.get(id).sheet;
    return sheet.element?.id ?? null;
  }, actorId);

  expect(elementId).toBeTruthy();
  await expect(page.locator(`#${elementId}`)).toBeVisible();
  return elementId;
}

// Wait until an actor's persisted fields match `expected` (path -> value).
export async function waitForActorFields(page, actorId, expected) {
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

// Close a rendered actor sheet and reopen it fresh via the sidebar, returning
// the new element id. The hard-reopen guard used after any mutating step.
export async function closeAndReopenActorSheet(page, actorId) {
  await closeDocSheet(page, { collection: "actors", id: actorId });
  return reopenActorSheetViaUI(page, actorId);
}

// Wait until an owned skill's persisted level equals the expected value (the
// proof that a dialog edit or inline change actually landed on the document).
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

// Reposition a rendered actor sheet's window frame. Foundry cascades new
// windows over older ones, which hides drop targets; placing sheets is test
// choreography, so this uses the sheet API rather than dragging headers.
export async function positionActorSheet(page, { actorId, left, top }) {
  const positioned = await page.evaluate(
    ({ actorId, left, top }) => {
      const sheet = game.actors.get(actorId)?.sheet;
      if (!sheet?.rendered) return false;
      sheet.setPosition({ left, top });
      return true;
    },
    { actorId, left, top },
  );
  expect(
    positioned,
    `expected the sheet of actor ${actorId} to be rendered`,
  ).toBe(true);
}

// Ctrl-click a rendered actor sheet's death-save rollable and read the posted
// chat card: the roll class, the speaking actor, the rolled total, and whether
// the roll succeeded. Character and mook sheets both expose the same
// data-roll-type="deathsave" control.
export async function rollDeathSave(page, sheetId) {
  const before = await chatMessageCount(page);
  await page
    .locator(`#${sheetId} a.rollable[data-roll-type="deathsave"]`)
    .click({ modifiers: CTRL_CLICK_MODIFIERS });
  const messageId = await waitForNewChatMessage(page, before, {
    requireRoll: true,
  });
  const message = await page.evaluate((id) => {
    const msg = game.messages.get(id);
    return {
      rollClass: msg.rolls?.[0]?.constructor?.name ?? null,
      actor: msg.speaker.actor,
    };
  }, messageId);
  const card = page.locator(
    `#chat .chat-message[data-message-id="${messageId}"]`,
  );
  const resultTotal = Number(
    await card.locator(".d10-number-div span.clickable").textContent(),
  );
  const outcome =
    (await card.locator(".roll-success").count()) > 0 ? "success" : "failure";
  return { ...message, resultTotal, outcome };
}

// Place two rendered actor sheets side by side with 8px margins and return a
// point (relative to the right sheet's top-left corner) that lands inside it —
// use it as a drop position when dragging from the left sheet. Foundry
// cascades new windows over older ones, so both are repositioned explicitly.
export async function placeSheetsSideBySide(
  page,
  { leftActorId, leftSheetId, rightActorId, rightSheetId },
) {
  const [leftBox, rightBox] = await Promise.all([
    page.locator(`#${leftSheetId}`).boundingBox(),
    page.locator(`#${rightSheetId}`).boundingBox(),
  ]);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const left = 8;
  const right = Math.min(
    left + leftBox.width + 8,
    viewportWidth - rightBox.width - 8,
  );
  await positionActorSheet(page, { actorId: leftActorId, left, top: 8 });
  await positionActorSheet(page, {
    actorId: rightActorId,
    left: right,
    top: 8,
  });

  return {
    x:
      (Math.max(right, left + leftBox.width) + (right + rightBox.width)) / 2 -
      right,
    y: rightBox.height / 2,
  };
}
