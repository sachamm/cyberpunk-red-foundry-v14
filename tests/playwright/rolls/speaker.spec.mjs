import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  chatMessageCount,
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  uniqueName,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * Regression coverage for chat-message speaker data on rolls (issue #677).
 *
 * CPRChat now builds the speaker through `ChatMessage.getSpeaker({ actor })`
 * instead of hand-assembling `{ actor, alias }`. That makes the message carry
 * proper speaker data — the actor id (a string, not the Actor object the old
 * code stored) and, when the roll came from a token, the scene/token ids and the
 * token's name as alias.
 *
 * The token/scene half of #677 depends on a placed token, which needs the
 * canvas — disabled in this harness (core.noCanvas) — so it is verified live via
 * the Playwright MCP instead (see the MR). Here we assert the headless-testable
 * part: a sheet roll posts a native-roll chat message whose speaker resolves to
 * the acting actor's id and name, guarding against the speaker block being
 * dropped or reverting to storing the Actor object.
 */
test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("chat speaker on rolls", () => {
  test("a stat roll posts a message whose speaker resolves the actor", async ({
    page: game,
  }) => {
    const name = uniqueName("char");
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name,
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const messagesBefore = await chatMessageCount(game);

    // Roll a stat through the real UI and confirm the verify dialog.
    await game
      .locator(`#${sheetId} a.rollable[data-roll-type="stat"]`)
      .first()
      .click();
    const dialog = game
      .locator(".application")
      .filter({ has: game.locator('input[name="luck"]') });
    await expect(dialog).toBeVisible();
    const confirm = dialog.locator(
      'button.cpr-dialog-button[data-action="confirm"]',
    );
    await expect(async () => {
      await confirm.click();
      await expect(dialog).toHaveCount(0, { timeout: 2000 });
    }).toPass({ timeout: 20000 });

    const messageId = await waitForNewChatMessage(game, messagesBefore);

    const message = await game.evaluate(
      ({ aid, mid }) => {
        const msg = game.messages.get(mid);
        const actor = game.actors.get(aid);
        return {
          speaker: msg.speaker,
          actorIsString: typeof msg.speaker.actor === "string",
          rolls: msg.rolls.length,
          actorName: actor.name,
        };
      },
      { aid: actorId, mid: messageId },
    );

    // Speaker points at the acting actor by id (a string, not the object the old
    // code stored) and aliases to its name; a native roll is attached.
    expect(message.actorIsString).toBe(true);
    expect(message.speaker.actor).toBe(actorId);
    expect(message.speaker.alias).toBe(message.actorName);
    expect(message.rolls).toBe(1);

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
