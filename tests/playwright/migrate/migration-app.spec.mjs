import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("return to setup honors the migration app setting", async ({
  page: gamePage,
}) => {
  const result = await gamePage.evaluate(async () => {
    const { default: DEV_MODE } = await import(
      `/systems/${game.system.id}/modules/system/devMode.js`
    );
    const { default: MigrationApp } = await import(
      `/systems/${game.system.id}/modules/system/migrate/migration-app.js`
    );

    const { migrations } = DEV_MODE;
    const originalReturnToSetup = migrations.app.returnToSetup;
    const hadLegacyReturnToSetup = Object.hasOwn(migrations, "returnToSetup");
    const originalLegacyReturnToSetup = migrations.returnToSetup;
    const hadOwnShutDown = Object.hasOwn(game, "shutDown");
    const originalShutDown = game.shutDown;
    let configuredReturnToSetup;
    let rejected = false;
    let shutDownCalls = 0;

    try {
      migrations.app.returnToSetup = true;
      delete migrations.returnToSetup;
      configuredReturnToSetup = migrations.app.returnToSetup;
      game.shutDown = () => {
        shutDownCalls += 1;
      };
      MigrationApp.returnToSetup.call({
        currentPhase: "userConfirm",
        rejectMigration: () => {
          rejected = true;
        },
        errorPhase: null,
      });
    } finally {
      migrations.app.returnToSetup = originalReturnToSetup;
      if (hadLegacyReturnToSetup) {
        migrations.returnToSetup = originalLegacyReturnToSetup;
      } else {
        delete migrations.returnToSetup;
      }
      if (hadOwnShutDown) game.shutDown = originalShutDown;
      else delete game.shutDown;
    }

    return {
      configuredReturnToSetup,
      rejected,
      shutDownCalls,
    };
  });

  expect(result).toEqual({
    configuredReturnToSetup: true,
    rejected: true,
    shutDownCalls: 1,
  });
});
