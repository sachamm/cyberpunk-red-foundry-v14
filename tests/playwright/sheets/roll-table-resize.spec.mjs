import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  openSidebarTab,
  resizeSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

async function createRollTableViaUI(page, name) {
  await openSidebarTab(page, "tables");
  await page.locator("#tables button.create-entry").click();

  const dialog = page
    .locator(".application.dialog")
    .filter({ has: page.locator('input[name="name"]') });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('button[data-action="ok"]').click();
  await expect(dialog).toHaveCount(0);

  await page.waitForFunction(
    (tableName) => game.tables.getName(tableName),
    name,
  );
  return page.evaluate((tableName) => game.tables.getName(tableName).id, name);
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("roll table summary fills the sheet when resized (#1381)", async ({
  page,
}) => {
  const name = uniqueName("resize-roll-table");
  const tableId = await createRollTableViaUI(page, name);
  const sheet = page.locator(".application.roll-table-sheet").last();
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-action="tab"][data-tab="summary"]').click();

  const summary = sheet.locator('section[data-tab="summary"]');
  const description = summary.locator('prose-mirror[name="description"]');
  const footer = sheet.locator("footer.form-footer");
  await expect(summary).toBeVisible();
  await expect(description).toBeVisible();
  await expect(footer).toBeVisible();

  const oldSheet = await sheet.boundingBox();
  const oldSummary = await summary.boundingBox();
  const oldDescription = await description.boundingBox();
  await resizeSheetViaUI(page, sheet, {
    width: oldSheet.width,
    height: oldSheet.height + 200,
  });
  await expect
    .poll(async () => (await sheet.boundingBox()).height)
    .toBeGreaterThan(oldSheet.height + 150);

  const newSheet = await sheet.boundingBox();
  const newSummary = await summary.boundingBox();
  const newDescription = await description.boundingBox();
  const newFooter = await footer.boundingBox();
  expect(newSummary.height).toBeGreaterThan(oldSummary.height + 150);
  expect(newDescription.height).toBeGreaterThan(oldDescription.height + 150);
  expect(
    newSheet.y + newSheet.height - (newFooter.y + newFooter.height),
  ).toBeLessThan(25);

  await sheet.locator('[data-action="close"]').click();
  await expect(sheet).toHaveCount(0);
  await page.waitForFunction(
    (id) => !game.tables.get(id).sheet.rendered,
    tableId,
  );
});
