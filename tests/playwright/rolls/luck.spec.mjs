import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  chatMessageCount,
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * Regression test for the LUCK over-spend guard (issue #1256).
 *
 * A player must not be able to spend more LUCK than their pool holds. When they
 * try, the verify-roll dialog should warn and STAY OPEN (so they can lower the
 * amount) rather than rolling or consuming LUCK. Lowering the amount to a valid
 * value and confirming should then roll and deduct as normal.
 *
 * Driven through the UI: a stat roll is the simplest roll that surfaces the
 * shared LUCK field, and the guard lives in the shared roll-dialog confirm
 * handler, so this covers every LUCK-capable roll type. The dialog re-renders on
 * every field change (submitOnChange), which can race a single confirm click, so
 * the fill+confirm steps are retried via expect(...).toPass until the outcome is
 * observed. The warning is asserted from the console (DisplayMessage logs it),
 * since the toast notification is transient and races a DOM assertion.
 */
test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("LUCK spend validation", () => {
  test("rejects spending more LUCK than available and keeps the roll dialog open", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    // A freshly-created character starts with a non-zero LUCK pool.
    const availableLuck = await game.evaluate(
      (id) => game.actors.get(id).system.stats.luck.value,
      actorId,
    );
    expect(availableLuck).toBeGreaterThan(0);

    // Open a stat roll's verify dialog — any roll that surfaces the LUCK field.
    await game
      .locator(`#${sheetId} a.rollable[data-roll-type="stat"]`)
      .first()
      .click();
    const dialog = game
      .locator(".application")
      .filter({ has: game.locator('input[name="luck"]') });
    await expect(dialog).toBeVisible();

    const luckInput = dialog.locator('input[name="luck"]');
    const confirm = dialog.locator(
      'button.cpr-dialog-button[data-action="confirm"]',
    );

    const messagesBefore = await chatMessageCount(game);

    // Collect console output to assert on the warning deterministically; the
    // toast is transient, but DisplayMessage also logs the message via LOGGER.
    const consoleLines = [];
    game.on("console", (msg) => consoleLines.push(msg.text()));

    // Attempt to spend one more LUCK than the pool holds. Retry the
    // fill+confirm so a confirm click lost to a submitOnChange re-render is
    // re-attempted until the guard's warning is observed.
    await expect(async () => {
      await luckInput.fill(String(availableLuck + 1));
      await confirm.click();
      expect(
        consoleLines.join("\n"),
        `console output so far: ${consoleLines.join(" || ")}`,
      ).toContain("cannot spend more LUCK");
    }).toPass({ timeout: 20000 });

    // The dialog stayed open (roll rejected) and nothing was rolled or spent.
    await expect(dialog).toBeVisible();
    const afterReject = await game.evaluate(
      (id) => ({
        messages: game.messages.size,
        luck: game.actors.get(id).system.stats.luck.value,
      }),
      actorId,
    );
    expect(afterReject.messages).toBe(messagesBefore);
    expect(afterReject.luck).toBe(availableLuck);

    // Lower the spend to a valid amount in the still-open dialog: the roll now
    // proceeds, the dialog closes, and the LUCK is deducted. Retry to ride out
    // the same re-render race on this confirm.
    await luckInput.fill(String(availableLuck));
    await expect(async () => {
      await confirm.click();
      await expect(dialog).toHaveCount(0, { timeout: 2000 });
    }).toPass({ timeout: 20000 });

    await game.waitForFunction(
      ({ id, messagesBefore }) =>
        game.messages.size > messagesBefore &&
        game.actors.get(id).system.stats.luck.value === 0,
      { id: actorId, messagesBefore },
      { timeout: 10000 },
    );

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
