import { expect } from "@playwright/test";
import { createDocumentViaUI } from "./documents.mjs";
import { closeDocSheet } from "./sheets.mjs";
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
