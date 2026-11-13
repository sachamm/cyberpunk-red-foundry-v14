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
