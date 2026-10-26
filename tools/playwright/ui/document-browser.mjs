import { expect } from "@playwright/test";
import { openSidebarTab } from "./sidebar.mjs";

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
