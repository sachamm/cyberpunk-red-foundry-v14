import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  openSidebarTab,
  dismissNotifications,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  chatMessageCount,
  createMookViaUI,
  waitForNewChatMessage,
  closeAndReopenMookSheet,
  openReputationLedger,
  modifyReputationViaLedger,
  closeReputationLedger,
  openFacedownRollDialog,
  confirmFacedownRoll,
  installConsoleErrorHarness,
} from "./mook-sheet-helpers.mjs";

installConsoleErrorHarness();

/**
 * Build a fresh mook and raise its reputation through the ledger window, closing
 * both windows again. Used by the roll tests that need a known reputation value.
 */
async function createMookWithReputation(game, value) {
  const { actorId, sheetId } = await createMookViaUI(game);
  await openReputationLedger(game, sheetId);
  await modifyReputationViaLedger(game, actorId, "add", value, "Test setup");
  await closeReputationLedger(game);
  return { actorId, sheetId };
}

test.describe("Reputation", () => {
  test("a fresh mook shows Reputation 0 and its default skill list", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);

    await test.step("the header reads Reputation: 0", async () => {
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.facedownRollable}`),
      ).toContainText("Reputation: 0");
    });

    await test.step("the list shows the default level-2 skills but not level-0 ones", async () => {
      const rows = game.locator(
        `#${sheetId} ${MOOK_FIELD.skillsContent} .item`,
      );
      await expect(rows.filter({ hasText: "Brawling" })).toBeVisible();
      await expect(rows.filter({ hasText: "Stealth" })).toBeVisible();
      await expect(rows.filter({ hasText: "Handgun" })).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the ledger add, subtract and set controls update the total and history", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);
    const gmName = await game.evaluate(() => game.user.name);
    const ledger = await openReputationLedger(game, sheetId);

    await test.step("a fresh reputation ledger shows a total of 0 and no history", async () => {
      await expect(ledger.locator(".ledger-info")).toContainText("Reputation");
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(0);
    });

    await test.step("adding 5 raises the total to 5 and records the increase", async () => {
      await modifyReputationViaLedger(game, actorId, "add", 5, "Test setup");
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "5",
      );
      const rows = ledger.locator(".ledger-list > li.item");
      await expect(rows).toHaveCount(1);
      await expect(rows.first().locator(".ledger-transaction")).toHaveText(
        "Increased by 5 to 5",
      );
      await expect(rows.first().locator(".ledger-reason")).toContainText(
        `Test setup - ${gmName}`,
      );
    });

    await test.step("subtracting 2 lowers the total to 3 and records the decrease", async () => {
      await modifyReputationViaLedger(
        game,
        actorId,
        "subtract",
        2,
        "Test setup",
      );
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "3",
      );
      const rows = ledger.locator(".ledger-list > li.item");
      await expect(rows).toHaveCount(2);
      await expect(rows.first().locator(".ledger-transaction")).toHaveText(
        "Decreased by 2 to 3",
      );
    });

    await test.step("setting 10 replaces the total and records the set", async () => {
      await modifyReputationViaLedger(game, actorId, "set", 10, "Test setup");
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "10",
      );
      const rows = ledger.locator(".ledger-list > li.item");
      await expect(rows).toHaveCount(3);
      await expect(rows.first().locator(".ledger-transaction")).toHaveText(
        "Set to 10",
      );
    });

    await closeReputationLedger(game);
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("ledger changes persist across a sheet close and reopen", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);
    await openReputationLedger(game, sheetId);

    await test.step("adding reputation through the ledger persists it on the actor", async () => {
      await modifyReputationViaLedger(game, actorId, "add", 10, "Test setup");
      await closeReputationLedger(game);
    });

    let reopenedSheetId = sheetId;
    await test.step("the header shows the new total on a fresh sheet render", async () => {
      reopenedSheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${reopenedSheetId} ${MOOK_FIELD.facedownRollable}`),
      ).toContainText("Reputation: 10");
    });

    await test.step("the ledger window still shows the total and its history", async () => {
      const reopenedLedger = await openReputationLedger(game, reopenedSheetId);
      await expect(
        reopenedLedger.locator(".ledger-info > div:last-child"),
      ).toHaveText("10");
      const rows = reopenedLedger.locator(".ledger-list > li.item");
      await expect(rows).toHaveCount(1);
      await expect(rows.first().locator(".ledger-transaction")).toHaveText(
        "Increased by 10 to 10",
      );
      await closeReputationLedger(game);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("subtracting more reputation than the mook has warns", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookViaUI(game);
    const ledger = await openReputationLedger(game, sheetId);

    await test.step("subtracting below zero shows a warning banner", async () => {
      await modifyReputationViaLedger(game, actorId, "add", 3, "Test setup");
      const needle = "You lost more Reputation than you have";
      const localizedWarning = await game.evaluate(() =>
        game.i18n.localize("CPR.messages.warningNotEnoughReputation"),
      );
      expect(localizedWarning).toContain(needle);

      await modifyReputationViaLedger(
        game,
        actorId,
        "subtract",
        5,
        "Test setup",
      );
      const banner = game
        .locator(".notification.warning")
        .filter({ hasText: needle });
      await expect(banner).toBeVisible();
    });

    await test.step("the subtraction still applies, taking the total negative", async () => {
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "-2",
      );
      const rows = ledger.locator(".ledger-list > li.item");
      await expect(rows).toHaveCount(2);
      await expect(rows.first().locator(".ledger-transaction")).toHaveText(
        "Decreased by 5 to -2",
      );
      await dismissNotifications(game);
    });

    await closeReputationLedger(game);
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("a facedown roll uses COOL plus the current reputation", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookWithReputation(game, 3);

    let messageId = null;
    const messagesBefore = await chatMessageCount(game);

    await test.step("the verify dialog shows COOL and the current reputation", async () => {
      const dialog = await openFacedownRollDialog(game, sheetId);
      const statInput = dialog.locator('input[name="statValue"]');
      await expect(statInput).toBeDisabled();
      await expect(statInput).toHaveValue("6");
      await expect(dialog.locator('input[name="repValue"]')).toHaveValue("3");
      await confirmFacedownRoll(dialog);
    });

    await test.step("confirming posts a Facedown roll card to chat", async () => {
      messageId = await waitForNewChatMessage(game, messagesBefore);
      const rollClass = await game.evaluate(
        (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
        messageId,
      );
      expect(rollClass).toBe("CPRFacedownRoll");
      await openSidebarTab(game, "chat");
      await expect(
        game.locator(`#chat .chat-message[data-message-id="${messageId}"]`),
      ).toBeVisible();
    });

    await test.step("the total is the dice plus COOL and reputation", async () => {
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(card.locator(".rollcard-top")).toContainText("Facedown");
      const total = Number(
        await card.locator(".d10-number-div span.clickable").textContent(),
      );
      // The check die is 1d10red: a natural 10 explodes (bonus d10 added) and a
      // natural 1 implodes (bonus d10 subtracted), so the dice alone range from
      // -9 to +20. Assert the exact composition instead of a floor.
      const diceSum = await game.evaluate((id) => {
        const term = game.messages.get(id).rolls?.[0]?.dice?.[0];
        return (
          term?.results.reduce((t, r) => t + (r.count ?? r.result), 0) ?? 0
        );
      }, messageId);
      expect(
        total,
        `total ${total} should equal dice ${diceSum} + COOL 6 + reputation 3`,
      ).toBe(diceSum + 6 + 3);
    });

    await test.step("the card details break the total down into COOL and reputation", async () => {
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await card.locator(".d10-number-div span.clickable").click();
      const details = card.locator(".d10-data-details");
      await expect(details).toBeVisible();
      await expect(details).toContainText("COOL: 6");
      await expect(details).toContainText("Reputation: 3");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("a critical failure implodes the check die and subtracts a bonus d10", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createMookWithReputation(game, 3);

    let messageId = null;
    const messagesBefore = await chatMessageCount(game);

    // Foundry routes all die randomness through CONFIG.Dice.randomUniform and maps a face f on a
    // d10 from u = 1 - (f - 0.5) / 10. Queue: main die a natural 1 (implodes), penalty die a 7.
    await game.evaluate(() => {
      window.__cprOrigRandomUniform = CONFIG.Dice.randomUniform;
      const queue = [1 - 0.5 / 10, 1 - 6.5 / 10];
      let i = 0;
      CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
    });

    try {
      await test.step("the forced natural 1 posts a Facedown card with the penalty die", async () => {
        const dialog = await openFacedownRollDialog(game, sheetId);
        await expect(dialog.locator('input[name="repValue"]')).toHaveValue("3");
        await confirmFacedownRoll(dialog);
        messageId = await waitForNewChatMessage(game, messagesBefore);
      });

      await test.step("the total is the dice (1 - 7) plus COOL 6 plus reputation 3", async () => {
        await openSidebarTab(game, "chat");
        const card = game.locator(
          `#chat .chat-message[data-message-id="${messageId}"]`,
        );
        await expect(card).toBeVisible();
        await expect(card.locator(".rollcard-top")).toContainText("Facedown");
        await expect(
          card.locator(".d10-dice-div span.cpr-crit-failure"),
        ).toHaveText("-7");
        const total = Number(
          await card.locator(".d10-number-div span.clickable").textContent(),
        );
        expect(total).toBe(1 - 7 + 6 + 3);
      });
    } finally {
      await game.evaluate(() => {
        if (window.__cprOrigRandomUniform) {
          CONFIG.Dice.randomUniform = window.__cprOrigRandomUniform;
          delete window.__cprOrigRandomUniform;
        }
      });
    }

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
