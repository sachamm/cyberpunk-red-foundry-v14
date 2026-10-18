import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  createDocumentViaUI,
  expectSheetRendered,
  setSheetField,
  sheet,
  uniqueName,
  waitForActorFields,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";

const FIELD = {
  name: 'input[name="name"]',
  class: 'select[name="system.class"]',
  cost: 'input[name="system.cost"]',
  per: 'input[name="system.stats.per"]',
  spd: 'input[name="system.stats.spd"]',
  atk: 'input[name="system.stats.atk"]',
  def: 'input[name="system.stats.def"]',
  rezValue: 'input[name="system.stats.rez.value"]',
  rezMax: 'input[name="system.stats.rez.max"]',
  damageFormula: ".blackice-stats-dmg-value",
  damageRoll: 'a.rollable[data-roll-type="damage"]',
  configureFromProgram:
    'a.configure-from-program[data-action="configureFromProgram"]',
  statRollPer: 'a.rollable[data-roll-type="stat"][data-roll-title="per"]',
};

async function setSelectField(page, sheetId, selector, value) {
  const select = sheet(page, sheetId).locator(selector);
  await select.selectOption(value);
}

async function clearNotifications(page) {
  await page.evaluate(() => {
    try {
      globalThis.ui?.notifications?.clear?.();
    } catch {
      /* ignore */
    }
    document
      .querySelectorAll(".notification")
      .forEach((toast) => toast.remove());
  });
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Black ICE world actor sheet", () => {
  test("world Black ICE actors render, persist edits, warn on configure, and roll stats", async ({
    page: game,
  }) => {
    const initialName = uniqueName("black-ice");
    const editedName = uniqueName("black-ice-edited");
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "blackIce",
      name: initialName,
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("first render shows editable world-actor fields and world-only actions", async () => {
      const actorSheet = sheet(game, sheetId);

      await expect(actorSheet.locator(FIELD.name)).toHaveValue(initialName);
      await expect(actorSheet.locator(FIELD.name)).toBeVisible();
      await expect(actorSheet.locator(FIELD.name)).toBeEnabled();

      await expect(actorSheet.locator(FIELD.class)).toBeVisible();
      await expect(actorSheet.locator(FIELD.class)).toBeEnabled();

      await expect(actorSheet.locator(FIELD.cost)).toBeVisible();
      await expect(actorSheet.locator(FIELD.cost)).toBeEnabled();

      await expect(actorSheet.locator(FIELD.per)).toBeVisible();
      await expect(actorSheet.locator(FIELD.per)).toBeEnabled();
      await expect(actorSheet.locator(FIELD.spd)).toBeVisible();
      await expect(actorSheet.locator(FIELD.spd)).toBeEnabled();
      await expect(actorSheet.locator(FIELD.atk)).toBeVisible();
      await expect(actorSheet.locator(FIELD.atk)).toBeEnabled();
      await expect(actorSheet.locator(FIELD.def)).toBeVisible();
      await expect(actorSheet.locator(FIELD.def)).toBeEnabled();

      await expect(actorSheet.locator(FIELD.rezValue)).toBeVisible();
      await expect(actorSheet.locator(FIELD.rezValue)).toBeEnabled();
      await expect(actorSheet.locator(FIELD.rezMax)).toBeVisible();
      await expect(actorSheet.locator(FIELD.rezMax)).toBeEnabled();

      await expect(actorSheet.locator(FIELD.damageFormula)).toHaveText("N/A");
      await expect(actorSheet.locator(FIELD.damageRoll)).toHaveCount(0);
      await expect(
        actorSheet.locator(FIELD.configureFromProgram),
      ).toBeVisible();
    });

    await test.step("identity edits persist after close and reopen", async () => {
      await setSheetField(game, sheetId, FIELD.name, editedName);
      await waitForActorFields(game, actorId, { name: editedName });

      await setSelectField(game, sheetId, FIELD.class, "antiprogram");
      await waitForActorFields(game, actorId, {
        "system.class": "antiprogram",
      });

      await setSheetField(game, sheetId, FIELD.cost, 777);
      await waitForActorFields(game, actorId, {
        "system.cost": 777,
      });

      sheetId = await closeAndReopenActorSheet(game, actorId);

      const actorSheet = sheet(game, sheetId);
      await expect(actorSheet.locator(FIELD.name)).toHaveValue(editedName);
      await expect(actorSheet.locator(FIELD.class)).toHaveValue("antiprogram");
      await expect(actorSheet.locator(FIELD.cost)).toHaveValue("777");
    });

    await test.step("stat edits persist after close and reopen", async () => {
      await setSheetField(game, sheetId, FIELD.per, 8);
      await waitForActorFields(game, actorId, { "system.stats.per": 8 });

      await setSheetField(game, sheetId, FIELD.spd, 9);
      await waitForActorFields(game, actorId, { "system.stats.spd": 9 });

      await setSheetField(game, sheetId, FIELD.atk, 10);
      await waitForActorFields(game, actorId, { "system.stats.atk": 10 });

      await setSheetField(game, sheetId, FIELD.def, 11);
      await waitForActorFields(game, actorId, { "system.stats.def": 11 });

      sheetId = await closeAndReopenActorSheet(game, actorId);

      const actorSheet = sheet(game, sheetId);
      await expect(actorSheet.locator(FIELD.per)).toHaveValue("8");
      await expect(actorSheet.locator(FIELD.spd)).toHaveValue("9");
      await expect(actorSheet.locator(FIELD.atk)).toHaveValue("10");
      await expect(actorSheet.locator(FIELD.def)).toHaveValue("11");
    });

    await test.step("REZ edits persist after close and reopen", async () => {
      await setSheetField(game, sheetId, FIELD.rezValue, 6);
      await waitForActorFields(game, actorId, {
        "system.stats.rez.value": 6,
      });

      await setSheetField(game, sheetId, FIELD.rezMax, 12);
      await waitForActorFields(game, actorId, {
        "system.stats.rez.max": 12,
      });

      sheetId = await closeAndReopenActorSheet(game, actorId);

      const actorSheet = sheet(game, sheetId);
      await expect(actorSheet.locator(FIELD.rezValue)).toHaveValue("6");
      await expect(actorSheet.locator(FIELD.rezMax)).toHaveValue("12");
    });

    await test.step("configure from program warns that only tokens can be linked", async () => {
      const actorSheet = sheet(game, sheetId);
      await actorSheet.locator(FIELD.configureFromProgram).click();

      await expect(game.locator(".notification.error")).toContainText(
        "Only tokens can be linked to a Black ICE Program",
      );

      await clearNotifications(game);
    });

    await test.step("a stat roll opens the Black ICE net-roll dialog and posts a chat card", async () => {
      const actorSheet = sheet(game, sheetId);
      const messagesBefore = await chatMessageCount(game);

      await actorSheet.locator(FIELD.statRollPer).click();

      const dialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="statValue"]') });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('input[name="statValue"]')).toHaveValue("8");
      await expect(dialog.locator('input[name="luck"]')).toHaveCount(0);

      const confirm = dialog.locator(
        'button.cpr-dialog-button[data-action="confirm"]',
      );
      await expect(async () => {
        await confirm.click();
        await expect(dialog).toHaveCount(0, { timeout: 2000 });
      }).toPass({ timeout: 20000 });

      const messageId = await waitForNewChatMessage(game, messagesBefore);

      const lastMessage = await game.evaluate((id) => {
        const msg = game.messages.get(id);
        const doc = document.implementation.createHTMLDocument("");
        doc.body.innerHTML = msg?.content ?? "";
        return {
          text: doc.body.textContent ?? "",
          rollCount: msg?.rolls?.length ?? 0,
        };
      }, messageId);
      expect(lastMessage.rollCount).toBe(1);
      expect(lastMessage.text).toContain("PER");
      expect(lastMessage.text).toContain("Black ICE");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
