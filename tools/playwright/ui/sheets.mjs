import { expect } from "@playwright/test";

export async function resizeSheetViaUI(page, sheet, { width, height }) {
  const handle = await sheet.locator(".window-resize-handle").boundingBox();
  const bounds = await sheet.boundingBox();
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Foundry starts pointer capture on the first move within the application.
  await page.mouse.move(x - 1, y - 1);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  await page.mouse.move(x + width - bounds.width, y + height - bounds.height, {
    steps: 5,
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  await page.mouse.up();
}

export async function changeActorSheetViaUI(
  page,
  { sheetId, actorId, sheetClass },
) {
  const sheet = page.locator(`#${sheetId}`);
  await sheet.locator('[data-action="toggleControls"]').click();
  await sheet.locator('[data-action="configureSheet"]').click();
  const dialog = page.locator(".application.sheet-config");
  await dialog
    .locator('select[name="sheetClass"]')
    .selectOption(`cyberpunk-red-core.${sheetClass}`);
  await dialog.locator('button[type="submit"]').click();
  await page.waitForFunction(
    ({ actorId, sheetClass }) => {
      const current = game.actors.get(actorId).sheet;
      return current.constructor.name === sheetClass && current.rendered;
    },
    { actorId, sheetClass },
  );
  return page.evaluate((id) => game.actors.get(id).sheet.element.id, actorId);
}

export async function waitForSheetReplacement(page, priorPart) {
  await page.waitForFunction((element) => !element.isConnected, priorPart);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await priorPart.dispose();
}

export async function expectSheetRendered(page, { collection, id }) {
  await page.waitForFunction(
    ({ collection, id }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      return doc?.sheet?.rendered === true;
    },
    { collection, id },
    { timeout: 15000 },
  );

  const elementId = await page.evaluate(
    ({ collection, id }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      return doc.sheet.element?.id ?? null;
    },
    { collection, id },
  );

  expect(elementId).toBeTruthy();
  await expect(page.locator(`#${elementId}`)).toBeVisible();
  return elementId;
}

export async function closeDocSheet(page, { collection, id }) {
  await page.evaluate(
    ({ collection, id }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      const sheet = doc?.sheet;
      if (!sheet) return undefined;
      try {
        sheet.options.submitOnClose = false;
      } catch {
        /* AppV2 options are frozen and have no submitOnClose; close() is safe */
      }
      return sheet.close();
    },
    { collection, id },
  );
}

// Wait for an owned item's sheet to be open and return its element id.
export async function openOwnedItemSheet(page, { actorId, itemId }) {
  await page.waitForFunction(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId)?.sheet?.rendered === true,
    { actorId, itemId },
    { timeout: 15000 },
  );
  const elementId = await page.evaluate(
    ({ actorId, itemId }) => {
      const item = game.actors.get(actorId).items.get(itemId);
      return item.sheet.element?.id ?? null;
    },
    { actorId, itemId },
  );
  expect(elementId).toBeTruthy();
  await expect(page.locator(`#${elementId}`)).toBeVisible();
  return elementId;
}

// Close an owned item's sheet (closeDocSheet only covers world documents).
// A close issued while a submit is still in flight can be dropped, so poll
// until the sheet is actually gone.
export async function closeOwnedItemSheet(page, { actorId, itemId }) {
  await page.waitForFunction(
    async ({ actorId, itemId }) => {
      const item = game.actors.get(actorId)?.items.get(itemId);
      const sheetApp = item?.sheet;
      if (!sheetApp || !sheetApp.rendered) return true;
      try {
        sheetApp.options.submitOnClose = false;
      } catch {
        /* AppV2 options are frozen; close() is safe */
      }
      await sheetApp.close();
      return sheetApp.rendered === false;
    },
    { actorId, itemId },
    { timeout: 10000 },
  );
}

export async function dismissNotifications(page) {
  await page.evaluate(() => {
    try {
      globalThis.ui?.notifications?.clear?.();
    } catch {
      /* older build without clear(); the wait/strip below still handle it */
    }
  });
  await page
    .waitForFunction(() => !document.querySelector(".notification"), null, {
      timeout: 6000,
    })
    .catch(() => {});
  await page.evaluate(() => {
    document
      .querySelectorAll(".notification")
      .forEach((toast) => toast.remove());
  });
}

export async function captureSheet(page, sheetId, name) {
  await dismissNotifications(page);
  await page.locator(`#${sheetId}`).screenshot({
    path: `.playwright/test-results/sheets/${name}.png`,
  });
}
