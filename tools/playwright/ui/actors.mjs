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
