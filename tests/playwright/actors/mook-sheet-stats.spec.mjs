import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createActorViaUI,
  expectSheetRendered,
  closeDocSheet,
  openSidebarTab,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  waitForMookFields,
  closeAndReopenMookSheet,
  setMookSheetField,
} from "./mook-sheet-helpers.mjs";

/*
 * Stat Pane coverage for this batch: in-line stat editing (one representative stat,
 * BODY), HP current/max editing, rolling a stat (BODY) to chat, and the derived wound
 * state display. Death save is intentionally NOT covered here — it is the next Stat
 * Pane batch.
 *
 * HP clamping is enforced by CPRActor._calculateDerivedStats (cpr-actor.js), which runs
 * in prepareData on every update for the owner/GM and sets
 * derivedStats.hp.value = min(value, max). So pushing current above max, or lowering max
 * below current, both clamp current down to max. Each test proves it on a fresh render
 * after a hard close/reopen, with the actor document as supporting evidence.
 */

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Stat Pane", () => {
  test("editing a stat in-line persists after close/reopen", async ({
    page: game,
  }) => {
    const actorId = await createActorViaUI(game, {
      type: "mook",
      name: uniqueName("mook"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("setting BODY in-line commits the new value", async () => {
      await setMookSheetField(game, sheetId, MOOK_FIELD.bodyStatInput, 12);
      // Supporting evidence: the document's stat value was updated.
      await waitForMookFields(game, actorId, { "system.stats.body.value": 12 });
    });

    await test.step("the new value is on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.bodyStatInput}`),
      ).toHaveValue("12");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("HP current and max are separate editable values", async ({
    page: game,
  }) => {
    const actorId = await createActorViaUI(game, {
      type: "mook",
      name: uniqueName("mook"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("setting current and max to different values commits both", async () => {
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpValueInput, 35);
      await waitForMookFields(game, actorId, {
        "system.derivedStats.hp.value": 35,
      });
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpMaxInput, 60);
      // Supporting evidence: both distinct values were stored.
      await waitForMookFields(game, actorId, {
        "system.derivedStats.hp.value": 35,
        "system.derivedStats.hp.max": 60,
      });
    });

    await test.step("both distinct values are on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.hpValueInput}`),
      ).toHaveValue("35");
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.hpMaxInput}`),
      ).toHaveValue("60");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("HP current cannot exceed max", async ({ page: game }) => {
    const actorId = await createActorViaUI(game, {
      type: "mook",
      name: uniqueName("mook"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("setting current above max clamps it down to max", async () => {
      // Default is 40/40. Pushing current to 70 clamps value = min(70, 40) = 40.
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpValueInput, 70);
      // Supporting evidence: current was clamped to max on the document.
      await waitForMookFields(game, actorId, {
        "system.derivedStats.hp.value": 40,
        "system.derivedStats.hp.max": 40,
      });
    });

    await test.step("the clamped value is on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.hpValueInput}`),
      ).toHaveValue("40");
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.hpMaxInput}`),
      ).toHaveValue("40");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("reducing HP max below current reduces the current too", async ({
    page: game,
  }) => {
    const actorId = await createActorViaUI(game, {
      type: "mook",
      name: uniqueName("mook"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("lowering max under the current value pulls current down to it", async () => {
      // Default is 40/40 (current 40). Lowering max to 30 clamps value = min(40, 30) = 30.
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpMaxInput, 30);
      // Supporting evidence: current was pulled down to the new max on the document.
      await waitForMookFields(game, actorId, {
        "system.derivedStats.hp.value": 30,
        "system.derivedStats.hp.max": 30,
      });
    });

    await test.step("the reduced current and max are on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.hpValueInput}`),
      ).toHaveValue("30");
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.hpMaxInput}`),
      ).toHaveValue("30");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("rolling a stat posts a roll card to chat", async ({ page: game }) => {
    const actorId = await createActorViaUI(game, {
      type: "mook",
      name: uniqueName("mook"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const messagesBefore = await game.evaluate(() => game.messages.size);

    await test.step("clicking the BODY stat opens the roll dialog and confirms it", async () => {
      await game
        .locator(
          `#${sheetId} a.rollable[data-roll-type="stat"][data-roll-title="body"]`,
        )
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
    });

    await test.step("a new message card is posted to the chat log", async () => {
      await game.waitForFunction(
        (before) => game.messages.size > before,
        messagesBefore,
        { timeout: 10000 },
      );
      const messageId = await game.evaluate(
        () => game.messages.contents.at(-1).id,
      );
      await openSidebarTab(game, "chat");
      // Visible proof: the new message renders as a card in the chat log.
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(card).toBeVisible();
    });

    await test.step("the posted card is a single roll attributed to the mook", async () => {
      // Supporting evidence: one native roll, speaker resolves to the acting mook.
      const message = await game.evaluate(() => {
        const msg = game.messages.contents.at(-1);
        return { rolls: msg.rolls.length, actor: msg.speaker.actor };
      });
      expect(message.rolls).toBe(1);
      expect(message.actor).toBe(actorId);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("wound state reflects HP against max across all four states", async ({
    page: game,
  }) => {
    const actorId = await createActorViaUI(game, {
      type: "mook",
      name: uniqueName("mook"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    // Default mook HP is 40/40. The seriously-wounded threshold is ceil(max / 2) = 20
    // (CPRActor._calculateDerivedStats, cpr-actor.js), so the derived states map to:
    //   Not Wounded       hp == max             (40)
    //   Lightly Wounded   threshold <= hp < max  (20..39)
    //   Seriously Wounded 1 <= hp < threshold    (1..19)
    //   Mortally Wounded  hp < 1                (<= 0)
    const cases = [
      { label: "Not Wounded", hp: 40 },
      { label: "Lightly Wounded", hp: 20 },
      { label: "Seriously Wounded", hp: 19 },
      { label: "Mortally Wounded", hp: 0 },
    ];

    for (const { label, hp } of cases) {
      await test.step(`at HP ${hp} the wound state reads "${label}"`, async () => {
        await setMookSheetField(game, sheetId, MOOK_FIELD.hpValueInput, hp);
        // Supporting evidence: the stored current HP is what we set.
        await waitForMookFields(game, actorId, {
          "system.derivedStats.hp.value": hp,
        });
        sheetId = await closeAndReopenMookSheet(game, actorId);
        // Visible proof: the derived wound-state label on the fresh render.
        await expect(
          game.locator(`#${sheetId} ${MOOK_FIELD.woundStateStat}`),
        ).toHaveText(label);
      });
    }

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
