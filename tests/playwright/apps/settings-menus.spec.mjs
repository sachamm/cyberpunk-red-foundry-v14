import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

/*
 * The system registers three GM settings submenus (game.settings.registerMenu):
 * "Configure System Compendia" (CPRCompendiaSettings), "Choose Modules"
 * (ModuleMigrationSettings) and "Homebrew Rules" (CPRHomebrewSettings). All are
 * ApplicationV2 windows. Drive the real Settings UI to open each and assert it
 * renders as a V2 application (a `form` with the `.application` class, not a
 * legacy `.window-app`).
 */

const MENUS = [
  {
    key: "cyberpunk-red-core.compendiumSettingsMenu",
    appId: "compendia-config",
  },
  {
    key: "cyberpunk-red-core.moduleMigrationMenu",
    appId: "module-migration-config",
  },
  {
    key: "cyberpunk-red-core.homebrewSettingsMenu",
    appId: "homebrew-config",
  },
];

// Open the Configure Settings dialog, activate the system category, and click
// the registerMenu button identified by `key`. Returns nothing; the caller
// asserts on the opened app.
async function openSystemSettingsMenu(page, key) {
  // Open the Game Settings sidebar tab, then the Configure Settings dialog.
  await page
    .locator('#sidebar button[data-action="tab"][data-tab="settings"]')
    .click();
  await page.getByRole("button", { name: "Configure Settings" }).click();

  const config = page.locator("#settings-config");
  await expect(config).toBeVisible();

  // The system's settings live in the (initially hidden) "system" category tab.
  await config.locator('button.plain[data-tab="system"]').click();
  await config.locator(`button[data-key="${key}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("System settings menus (ApplicationV2)", () => {
  for (const { key, appId } of MENUS) {
    test(`${appId} opens as an ApplicationV2 window`, async ({
      page: game,
    }) => {
      await openSystemSettingsMenu(game, key);

      const app = game.locator(`#${appId}`);
      await expect(app).toBeVisible();

      // ApplicationV2 renders the window element as a <form> with `.application`
      // and must not carry the legacy AppV1 `.window-app` class.
      await expect(app).toHaveClass(/application/);
      await expect(app).toHaveClass(/cpr/);
      await expect(app).not.toHaveClass(/window-app/);
      await expect(app.locator('button[type="submit"]')).toBeVisible();
    });
  }
});
