import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    const dialog = [...foundry.applications.instances.values()].find((app) =>
      app.element?.classList.contains("cpr-dialog"),
    );
    await dialog?.close();
    await globalThis.cprScrollTestPromise;
    delete globalThis.cprScrollTestPromise;
  });
});

test("long CPR dialog lists scroll without hiding the buttons (#1295)", async ({
  page: game,
}) => {
  await game.evaluate(async () => {
    const { cprFormPrompt } = await import(
      `/systems/${game.system.id}/modules/dialog/cpr-dialog.js`
    );
    const itemsList = Array.from({ length: 80 }, (_, index) => ({
      id: `upgrade-${index + 1}`,
      name: `Upgrade ${index + 1}`,
      type: "itemUpgrade",
      system: { size: 1 },
    }));
    globalThis.cprScrollTestPromise = cprFormPrompt({
      title: "Upgrade install dialog",
      template: `systems/${game.system.id}/templates/dialog/cpr-select-install-items-prompt.hbs`,
      data: {
        header: "Select upgrades",
        typeList: ["itemUpgrade"],
        itemsList,
        selectedItems: [],
        itemType: "Upgrade",
        target: {
          type: "weapon",
          system: {
            isUpgraded: false,
            installedItems: { slots: 3, usedSlots: 0 },
          },
        },
      },
    });
  });

  const dialog = game.locator(".application.cpr-dialog").last();
  await expect(dialog).toBeVisible();
  const metrics = await dialog.evaluate((element) => {
    const grid = element.querySelector(".dialog-grid");
    const footer = element.querySelector(".form-footer");
    const firstRow = grid.querySelector(".dialog-item:first-child");
    const lastRow = grid.querySelector(".dialog-item:last-child");
    const rootRect = element.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const firstRowRect = firstRow.getBoundingClientRect();
    grid.scrollTop = grid.scrollHeight;
    const lastRowRect = lastRow.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(grid).overflowY,
      hasScrollableOverflow: grid.scrollHeight > grid.clientHeight,
      firstRowInitiallyVisible:
        firstRowRect.top >= gridRect.top &&
        firstRowRect.bottom <= gridRect.bottom,
      lastRowVisibleAfterScroll:
        lastRowRect.top >= gridRect.top &&
        lastRowRect.bottom <= gridRect.bottom,
      footerInsideDialog: footerRect.bottom <= rootRect.bottom,
      footerInsideViewport: footerRect.bottom <= window.innerHeight,
    };
  });

  expect(metrics.overflowY).toBe("auto");
  expect(metrics.hasScrollableOverflow).toBe(true);
  expect(metrics.firstRowInitiallyVisible).toBe(true);
  expect(metrics.lastRowVisibleAfterScroll).toBe(true);
  expect(metrics.footerInsideDialog).toBe(true);
  expect(metrics.footerInsideViewport).toBe(true);
});
