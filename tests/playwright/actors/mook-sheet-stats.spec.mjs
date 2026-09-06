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
 * BODY), HP current/max editing, rolling a stat (BODY) to chat, the derived wound state
 * display, and the death save (increase / reset penalty, and rolling it).
 *
 * HP clamping is enforced by CPRActor._calculateDerivedStats (cpr-actor.js), which runs
 * in prepareData on every update for the owner/GM and sets
 * derivedStats.hp.value = min(value, max). So pushing current above max, or lowering max
 * below current, both clamp current down to max. Each test proves it on a fresh render
 * after a hard close/reopen, with the actor document as supporting evidence.
 *
 * The death save's displayed number is derivedStats.deathSave.value = penalty + basePenalty
 * (cpr-actor.js). A bare mook has no critical injuries, so basePenalty is 0 and the display
 * tracks the stored penalty alone: `.increase-deathsave-value` adds one, clicking the value
 * (`.reset-deathsave-value`) resets it to 0. Rolling posts a CPRDeathSaveRoll — a 1d10
 * roll-under BODY that always fails on a natural 10; because the serialised roll drops its
 * CPR state, the test reads the result total and outcome from the rendered card and BODY
 * from the actor document, then asserts the outcome matches `resultTotal < BODY`.
 */

// Ctrl/Cmd-click the mook's Death Save rollable (skipping the verify dialog), wait for the
// new chat message, and read back what kind of roll it was plus the rendered result total
// and success/failure outcome. The chat log must already be open so the card is in the DOM.
async function rollDeathSave(page, sheetId) {
  const before = await page.evaluate(() => game.messages.size);
  // macOS Chromium treats Ctrl+click as a right-click (context menu) and never dispatches
  // `click`, so use Cmd there. The roll handler accepts both (`event.ctrlKey || event.metaKey`).
  const modifier = process.platform === "darwin" ? ["Meta"] : ["Control"];
  await page
    .locator(`#${sheetId} ${MOOK_FIELD.deathSaveRollable}`)
    .click({ modifiers: modifier });
  await page.waitForFunction((n) => game.messages.size > n, before, {
    timeout: 10000,
  });
  const messageId = await page.evaluate(() => game.messages.contents.at(-1).id);
  // Supporting evidence: the posted roll is specifically a death save.
  const rollClass = await page.evaluate(
    () => game.messages.contents.at(-1).rolls?.[0]?.constructor?.name ?? null,
  );
  // Visible proof: the result total and success/failure class on the rendered card.
  const card = page.locator(
    `#chat .chat-message[data-message-id="${messageId}"]`,
  );
  const resultTotal = Number(
    await card.locator(".d10-number-div span.clickable").textContent(),
  );
  const outcome =
    (await card.locator(".roll-success").count()) > 0 ? "success" : "failure";
  return { rollClass, resultTotal, outcome };
}

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

  test("increasing the death save penalty raises the displayed value", async ({
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

    await test.step("each increase click adds one to the penalty and display", async () => {
      // A fresh mook has no death-save penalty (penalty 0, basePenalty 0 -> displayed 0).
      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveIncrease}`).click();
      // Supporting evidence: the stored penalty was incremented.
      await waitForMookFields(game, actorId, {
        "system.derivedStats.deathSave.penalty": 1,
      });
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`),
      ).toHaveText("1");

      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveIncrease}`).click();
      await waitForMookFields(game, actorId, {
        "system.derivedStats.deathSave.penalty": 2,
      });
      // Visible proof: the derived display value tracks the penalty.
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`),
      ).toHaveText("2");
    });

    await test.step("the increased value is on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`),
      ).toHaveText("2");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("resetting the death save penalty returns the displayed value to zero", async ({
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

    await test.step("increasing then clicking the value resets the penalty to zero", async () => {
      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveIncrease}`).click();
      // Supporting evidence: the stored penalty was incremented.
      await waitForMookFields(game, actorId, {
        "system.derivedStats.deathSave.penalty": 1,
      });
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`),
      ).toHaveText("1");

      // The displayed value is the reset trigger.
      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`).click();
      await waitForMookFields(game, actorId, {
        "system.derivedStats.deathSave.penalty": 0,
      });
      // Visible proof: the display is back to zero.
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`),
      ).toHaveText("0");
    });

    await test.step("the reset value is on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`),
      ).toHaveText("0");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("rolling a death save posts a self-consistent roll-under card", async ({
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

    await test.step("setting a low BODY gives a known roll-under target", async () => {
      // A target of 6 keeps both outcomes reachable and makes the natural-10 auto-fail rule
      // subsumed by the roll-under check (a natural 10 always totals >= 10 > 6).
      await setMookSheetField(game, sheetId, MOOK_FIELD.bodyStatInput, 6);
      await waitForMookFields(game, actorId, { "system.stats.body.value": 6 });
    });

    const bodyStat = await game.evaluate(
      (id) => game.actors.get(id).system.stats.body.value,
      actorId,
    );
    await openSidebarTab(game, "chat");

    await test.step("each death save roll is consistent with its total and BODY", async () => {
      for (let i = 0; i < 6; i += 1) {
        const { rollClass, resultTotal, outcome } = await rollDeathSave(
          game,
          sheetId,
        );
        expect(rollClass).toBe("CPRDeathSaveRoll");
        // Success iff the total rolls strictly under BODY (natural 10 subsumed at BODY 6).
        const expected = resultTotal < bodyStat ? "success" : "failure";
        expect(
          outcome,
          `total ${resultTotal} vs BODY ${bodyStat} should be ${expected}`,
        ).toBe(expected);
      }
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
