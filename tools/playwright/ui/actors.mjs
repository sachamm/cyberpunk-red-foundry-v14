import { expect } from "@playwright/test";
import { createDocumentViaUI } from "./documents.mjs";
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
