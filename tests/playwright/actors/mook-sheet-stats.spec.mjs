import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  openSidebarTab,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  createMookViaUI,
  waitForNewChatMessage,
  waitForMookFields,
  closeAndReopenMookSheet,
  setMookSheetField,
  installConsoleErrorHarness,
} from "./mook-sheet-helpers.mjs";

async function rollDeathSave(page, sheetId) {
  const before = await chatMessageCount(page);
  await page
    .locator(`#${sheetId} ${MOOK_FIELD.deathSaveRollable}`)
    .click({ modifiers: CTRL_CLICK_MODIFIERS });
  const messageId = await waitForNewChatMessage(page, before);
  const rollClass = await page.evaluate(
    (id) => game.messages.get(id).rolls?.[0]?.constructor?.name ?? null,
    messageId,
  );
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

installConsoleErrorHarness();

test.describe("Stat Pane", () => {
  test("editing a stat in-line persists after close/reopen", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    await test.step("setting BODY in-line commits the new value", async () => {
      await setMookSheetField(game, sheetId, MOOK_FIELD.bodyStatInput, 12);
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
    let { actorId, sheetId } = await createMookViaUI(game);

    await test.step("setting current and max to different values commits both", async () => {
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpValueInput, 35);
      await waitForMookFields(game, actorId, {
        "system.derivedStats.hp.value": 35,
      });
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpMaxInput, 60);
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
    let { actorId, sheetId } = await createMookViaUI(game);

    await test.step("setting current above max clamps it down to max", async () => {
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpValueInput, 70);
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
    let { actorId, sheetId } = await createMookViaUI(game);

    await test.step("lowering max under the current value pulls current down to it", async () => {
      await setMookSheetField(game, sheetId, MOOK_FIELD.hpMaxInput, 30);
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
    const { actorId, sheetId } = await createMookViaUI(game);

    let messageId = null;
    const messagesBefore = await chatMessageCount(game);

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
      messageId = await waitForNewChatMessage(game, messagesBefore);
      await openSidebarTab(game, "chat");
      const card = game.locator(
        `#chat .chat-message[data-message-id="${messageId}"]`,
      );
      await expect(card).toBeVisible();
    });

    await test.step("the posted card is a single roll attributed to the mook", async () => {
      const message = await game.evaluate((id) => {
        const msg = game.messages.get(id);
        return { rolls: msg.rolls.length, actor: msg.speaker.actor };
      }, messageId);
      expect(message.rolls).toBe(1);
      expect(message.actor).toBe(actorId);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("wound state reflects HP against max across all four states", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    // A fresh mook's HP defaults to 40/40 (hp-schema.js). The seriously-wounded threshold is ceil(max / 2) = 20
    // (CPRActor._calculateDerivedStats, cpr-actor.js), so the derived states map to:
    //   Not Wounded       hp == max             (40 is the default)
    //   Lightly Wounded   threshold <= hp < max  (20..39)
    //   Seriously Wounded 1 <= hp < threshold    (1..19)
    //   Mortally Wounded  hp < 1                (<= 0)

    await test.step('at the default HP the wound state reads "Not Wounded"', async () => {
      await expect(
        game.locator(`#${sheetId} ${MOOK_FIELD.woundStateStat}`),
      ).toHaveText("Not Wounded");
    });

    for (const { label, hp } of [
      { label: "Lightly Wounded", hp: 20 },
      { label: "Seriously Wounded", hp: 19 },
      { label: "Mortally Wounded", hp: 0 },
    ]) {
      await test.step(`at HP ${hp} the wound state reads "${label}"`, async () => {
        await setMookSheetField(game, sheetId, MOOK_FIELD.hpValueInput, hp);
        await waitForMookFields(game, actorId, {
          "system.derivedStats.hp.value": hp,
        });
        sheetId = await closeAndReopenMookSheet(game, actorId);
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
    let { actorId, sheetId } = await createMookViaUI(game);

    await test.step("each increase click adds one to the penalty and display", async () => {
      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveIncrease}`).click();
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
    let { actorId, sheetId } = await createMookViaUI(game);

    await test.step("increasing then clicking the value resets the penalty to zero", async () => {
      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveIncrease}`).click();
      await waitForMookFields(game, actorId, {
        "system.derivedStats.deathSave.penalty": 1,
      });

      await game.locator(`#${sheetId} ${MOOK_FIELD.deathSaveValue}`).click();
      await waitForMookFields(game, actorId, {
        "system.derivedStats.deathSave.penalty": 0,
      });
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
    const { actorId, sheetId } = await createMookViaUI(game);

    // A fresh mook's BODY defaults to 6 (stat-schema.js), which keeps both outcomes reachable after a few rolls
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
