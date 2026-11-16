import { expect } from "@playwright/test";
import { openSidebarTab } from "./sidebar.mjs";
import { createItemViaUI } from "./items.mjs";
import { closeDocSheet } from "./sheets.mjs";

export async function openItemBrowser(page, { readySelector = null } = {}) {
  await openSidebarTab(page, "items");
  const launch = page.locator('#items .cpr-browser-launch[data-mode="item"]');
  await expect(launch).toBeVisible();
  await launch.click();

  const documentBrowser = page.locator("#cpr-document-browser");
  await expect(documentBrowser).toBeVisible();
  if (readySelector) {
    await expect(documentBrowser.locator(readySelector).first()).toBeVisible();
    return documentBrowser;
  }
  await expect(
    documentBrowser.locator(".cpr-browser-results-list"),
  ).toBeVisible();
  await expect(
    documentBrowser.locator(".cpr-browser-entry, .cpr-browser-empty").first(),
  ).toBeVisible();
  return documentBrowser;
}

// The results footer is only visible while batches are still appending (CSS
// hides it once the final batch lands), so visibility is not a usable signal:
// settled means the footer exists and no longer carries the loading class.
export async function waitForBrowserResultsSettled(documentBrowser) {
  const footer = documentBrowser.locator(".cpr-browser-results-footer");
  await expect(footer).toHaveCount(1, { timeout: 30000 });
  await expect(footer).not.toHaveClass(/cpr-browser-loading/, {
    timeout: 30000,
  });
}

export async function cycleTo(locator, target) {
  for (let i = 0; i < 4; i += 1) {
    if ((await locator.getAttribute("data-state")) === target) return;
    await locator.click();
  }
  await expect(locator).toHaveAttribute("data-state", target);
}

export async function createItemCompendium(page, label) {
  const name = `e2e-pack-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return page.evaluate(
    async ({ label, name }) => {
      const created = await globalThis.CompendiumCollection.createCompendium({
        label,
        name,
        type: "Item",
        package: game.world.id,
      });
      await created.configure({ locked: false });
      return { id: created.metadata.id, label: created.metadata.label };
    },
    { label, name },
  );
}

// Create a world item through the UI and close its sheet, returning its id.
// Most browser tests only need the item to exist in the world, not the sheet.
export async function createItemClosed(page, { type, name }) {
  const id = await createItemViaUI(page, { type, name });
  await closeDocSheet(page, { collection: "items", id });
  return id;
}

// Apply fixture-shaping updates to world items in one go (setup, never the
// action under test). `updates` is a list of `{ id, changes }` objects.
export async function updateItemFields(page, updates) {
  await page.evaluate(async (changesList) => {
    for (const { id, changes } of changesList) {
      await game.items.get(id).update(changes);
    }
  }, updates);
}

// The result row whose name matches one of our unique item names. The inner
// locator must be page-rooted: a browser-rooted one makes filter({ has })
// resolve against the container element and match nothing.
export function browserRowByName(page, documentBrowser, name) {
  return documentBrowser.locator(".cpr-browser-entry").filter({
    has: page.locator(".item-header-name", { hasText: name }),
  });
}

// Type a name search and wait until the re-filtered results have settled.
export async function searchItems(documentBrowser, name) {
  await documentBrowser.locator(".cpr-browser-name-input").fill(name);
  await waitForBrowserResultsSettled(documentBrowser);
}

// Start a drag on the first result row and return the text/plain payload its
// dragstart handler writes ("" when the row refuses, e.g. in shop mode).
export async function readBrowserDragPayload(page) {
  return page.evaluate(() => {
    const el = document.querySelector(
      "#cpr-document-browser .cpr-browser-entry[data-uuid]",
    );
    const dt = new DataTransfer();
    el.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
    return dt.getData("text/plain");
  });
}

// Seed a compendium entry from a UI-created world item: create it (closed),
// optionally shape its fields, import it into the pack, then delete the
// staging world item so only the compendium entry carries the name.
export async function createCompendiumItem(
  page,
  { packId, name, type = "gear", fields = null },
) {
  const stagingId = await createItemClosed(page, { type, name });
  if (fields) {
    await updateItemFields(page, [{ id: stagingId, changes: fields }]);
  }
  await page.evaluate(
    async ({ packId, itemId }) => {
      const pack = game.packs.get(packId);
      const item = game.items.get(itemId);
      await pack.importDocument(item);
      await item?.delete();
    },
    { packId, itemId: stagingId },
  );
}
