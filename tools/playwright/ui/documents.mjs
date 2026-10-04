import { expect } from "@playwright/test";
import { createButtonForSidebarTab, openSidebarTab } from "./sidebar.mjs";

async function clearNotifications(page) {
  await page
    .evaluate(() =>
      document
        .querySelectorAll("#notifications li")
        .forEach((el) => el.remove()),
    )
    .catch(() => {});
}

async function clickThroughOverlays(page, locator) {
  await clearNotifications(page);
  await locator.click().catch(() => locator.dispatchEvent("click"));
}

export async function createDocumentViaUI(page, { documentTab, type, name }) {
  const createButton = await createButtonForSidebarTab(page, documentTab);
  await clickThroughOverlays(page, createButton);

  const dialog = page
    .locator(".application.dialog")
    .filter({ has: page.locator('select[name="type"]') });
  await expect(dialog).toBeVisible();
  await dialog.locator('select[name="type"]').selectOption(type);
  await dialog.locator('input[name="name"]').fill(name);

  const confirm = dialog.locator('button[data-action="ok"]').first();
  // Foundry can re-render the create dialog under load; retry until the submit sticks.
  await expect(async () => {
    await clickThroughOverlays(page, confirm);
    await expect(dialog).toHaveCount(0, { timeout: 2000 });
  }).toPass({ timeout: 20000 });

  await page.waitForFunction(
    ({ documentTab, name }) => {
      const collection = documentTab === "actors" ? game.actors : game.items;
      return !!collection.getName(name);
    },
    { documentTab, name },
    { timeout: 10000 },
  );

  return page.evaluate(
    ({ documentTab, name }) => {
      const collection = documentTab === "actors" ? game.actors : game.items;
      return collection.getName(name).id;
    },
    { documentTab, name },
  );
}

async function deleteDirectoryEntryViaUI(page, { documentTab, id }) {
  await openSidebarTab(page, documentTab);
  const entry = page.locator(`#${documentTab} [data-entry-id="${id}"]`);
  await expect(entry).toBeVisible();
  await clearNotifications(page);
  await entry.click({ button: "right" });
  const deleteItem = page.locator("#context-menu .context-item", {
    hasText: "Delete",
  });
  await expect(deleteItem).toBeVisible();
  await clickThroughOverlays(page, deleteItem);
  const dialog = page
    .locator(".application.dialog")
    .filter({ hasText: /Delete|Remove/ });
  await expect(dialog).toBeVisible();
  await clickThroughOverlays(
    page,
    dialog
      .locator('button[data-action="yes"], button[data-action="ok"]')
      .first(),
  );
  await expect(entry).toHaveCount(0);
}

export async function deleteActorViaUI(page, actorId) {
  await deleteDirectoryEntryViaUI(page, { documentTab: "actors", id: actorId });
}

export async function deleteItemViaUI(page, itemId) {
  await deleteDirectoryEntryViaUI(page, { documentTab: "items", id: itemId });
}
