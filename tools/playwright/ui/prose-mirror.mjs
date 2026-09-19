import { expect } from "@playwright/test";

function proseMirrorPane(page, sheetId, paneSelector = "prose-mirror") {
  return page.locator(`#${sheetId} ${paneSelector}`);
}

export async function openProseMirrorEditor(
  page,
  sheetId,
  paneSelector = "prose-mirror",
) {
  const pane = proseMirrorPane(page, sheetId, paneSelector);
  await pane.hover();
  await pane.locator("button.icon.toggle").click();
  await expect(pane.locator(".ProseMirror")).toBeVisible();
}

export async function setProseMirrorText(
  page,
  sheetId,
  text,
  paneSelector = "prose-mirror",
) {
  const editor = proseMirrorPane(page, sheetId, paneSelector).locator(
    ".ProseMirror",
  );
  await editor.click();
  await page.keyboard.type(text);
}

export async function saveProseMirror(
  page,
  sheetId,
  paneSelector = "prose-mirror",
) {
  const pane = proseMirrorPane(page, sheetId, paneSelector);
  await pane.locator('menu button[data-action="save"]').click();
  await expect(pane.locator(".ProseMirror")).toHaveCount(0);
}

export async function waitForProseMirrorValue(
  page,
  { collection, id, fieldPath, text },
) {
  await page.waitForFunction(
    ({ collection, id, fieldPath, text }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      const value = foundry.utils.getProperty(doc, fieldPath);
      return typeof value === "string" && value.includes(text);
    },
    { collection, id, fieldPath, text },
    { timeout: 10000 },
  );
}
