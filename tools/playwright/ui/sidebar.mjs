import { expect } from "@playwright/test";

async function dismissBlockingTours(page) {
  await page
    .evaluate(() => {
      for (const tour of globalThis.game?.tours?.contents ?? []) {
        try {
          tour.exit?.();
        } catch {
          /* a tour that refuses to exit is handled by DOM cleanup below */
        }
      }
      document
        .querySelectorAll(".tour-overlay, .tour-center-step, .tour")
        .forEach((el) => el.remove());
    })
    .catch(() => {});
}

export async function openSidebarTab(page, tab) {
  const tabButton = page.locator(`#sidebar-tabs button[data-tab="${tab}"]`);
  const sidebar = page.locator(`#${tab}`);
  if (!(await sidebar.isVisible())) {
    await dismissBlockingTours(page);
    await tabButton.click().catch(() => tabButton.dispatchEvent("click"));
  }
  await expect(sidebar).toBeVisible();
  return sidebar;
}

export async function createButtonForSidebarTab(page, tab) {
  await openSidebarTab(page, tab);
  const createButton = page.locator(
    `#${tab} .directory-header button.create-entry`,
  );
  await expect(createButton).toBeVisible();
  return createButton;
}

/**
 * Open a Foundry compendium pack popout by clicking its entry in the
 * Compendium sidebar tab. Packs are grouped under collapsible source
 * folders, so any collapsed ancestor folder is expanded first.
 */
export async function openCompendiumPack(page, packId) {
  const sidebar = await openSidebarTab(page, "compendium");
  const entry = sidebar.locator(
    `.directory-item.compendium[data-pack="${packId}"] .compendium-name`,
  );
  for (let depth = 0; depth < 5 && !(await entry.isVisible()); depth += 1) {
    const folder = entry.locator(
      'xpath=ancestor::li[contains(@class,"folder")][1]',
    );
    if ((await folder.count()) === 0) break;
    const expanded = await folder.evaluate((el) =>
      el.classList.contains("expanded"),
    );
    if (expanded) break;
    await folder.locator(".folder-header").click();
  }
  await expect(entry).toBeVisible();
  await entry.click();
  const popout = page.locator(`#compendium-${packId.replaceAll(".", "_")}`);
  await expect(popout).toBeVisible();
  return popout;
}
