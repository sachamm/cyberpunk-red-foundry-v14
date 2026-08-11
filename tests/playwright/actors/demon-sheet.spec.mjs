import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createDocumentViaUI,
  expectSheetRendered,
  reopenActorSheetViaUI,
  closeDocSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

const FIELD = {
  name: 'input[name="name"]',
  rezValue: 'input[name="system.stats.rez.value"]',
  rezMax: 'input[name="system.stats.rez.max"]',
  interface: 'input[name="system.stats.interface"]',
  actions: 'input[name="system.stats.actions"]',
  combatNumber: 'input[name="system.stats.combatNumber"]',
  rollInterface: 'a.rollable[data-action="roll"][data-roll-title="interface"]',
  rollCombatNumber:
    'a.rollable[data-action="roll"][data-roll-title="combatNumber"]',
  notesEditor: "prose-mirror",
};

function sheet(page, sheetId) {
  return page.locator(`#${sheetId}`);
}

async function waitForActorFields(page, actorId, expected) {
  await page.waitForFunction(
    ({ actorId, expected }) => {
      const actor = game.actors.get(actorId);
      if (!actor) return false;
      return Object.entries(expected).every(
        ([path, value]) => foundry.utils.getProperty(actor, path) === value,
      );
    },
    { actorId, expected },
    { timeout: 10000 },
  );
}

async function setInputField(page, sheetId, selector, value) {
  const input = sheet(page, sheetId).locator(selector);
  await input.fill(String(value));
  await input.blur();
}

async function closeAndReopenActorSheet(page, actorId) {
  await closeDocSheet(page, { collection: "actors", id: actorId });
  return reopenActorSheetViaUI(page, actorId);
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Demon actor sheet", () => {
  test("renders, persists edits, rolls stats, and edits notes", async ({
    page: game,
  }) => {
    const initialName = uniqueName("demon");
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "demon",
      name: initialName,
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("first render shows editable fields and rollable stats", async () => {
      const demonSheet = sheet(game, sheetId);

      await expect(demonSheet.locator(FIELD.name)).toHaveValue(initialName);
      await expect(demonSheet.locator(FIELD.name)).toBeVisible();
      await expect(demonSheet.locator(FIELD.name)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.rezValue)).toHaveValue("10");
      await expect(demonSheet.locator(FIELD.rezValue)).toBeVisible();
      await expect(demonSheet.locator(FIELD.rezValue)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.rezMax)).toHaveValue("10");
      await expect(demonSheet.locator(FIELD.rezMax)).toBeVisible();
      await expect(demonSheet.locator(FIELD.rezMax)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.interface)).toHaveValue("0");
      await expect(demonSheet.locator(FIELD.interface)).toBeVisible();
      await expect(demonSheet.locator(FIELD.interface)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.actions)).toHaveValue("2");
      await expect(demonSheet.locator(FIELD.actions)).toBeVisible();
      await expect(demonSheet.locator(FIELD.actions)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.combatNumber)).toHaveValue("14");
      await expect(demonSheet.locator(FIELD.combatNumber)).toBeVisible();
      await expect(demonSheet.locator(FIELD.combatNumber)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.rollInterface)).toBeVisible();
      await expect(demonSheet.locator(FIELD.rollInterface)).toBeEnabled();

      await expect(demonSheet.locator(FIELD.rollCombatNumber)).toBeVisible();
      await expect(demonSheet.locator(FIELD.rollCombatNumber)).toBeEnabled();

      // REZ and Net Actions are NOT rollable (excluded by cprListContains in template)
      await expect(
        game.locator('a.rollable[data-roll-title="rez"]'),
      ).toHaveCount(0);
      await expect(
        game.locator('a.rollable[data-roll-title="netactions"]'),
      ).toHaveCount(0);

      // Notes editor should be visible
      await expect(demonSheet.locator(FIELD.notesEditor)).toBeVisible();
    });

    await test.step("identity and stat edits persist after close and reopen", async () => {
      const editedName = uniqueName("demon-edited");

      await setInputField(game, sheetId, FIELD.name, editedName);
      await waitForActorFields(game, actorId, { name: editedName });

      await setInputField(game, sheetId, FIELD.rezValue, 7);
      await waitForActorFields(game, actorId, {
        "system.stats.rez.value": 7,
      });

      await setInputField(game, sheetId, FIELD.rezMax, 15);
      await waitForActorFields(game, actorId, {
        "system.stats.rez.max": 15,
      });

      await setInputField(game, sheetId, FIELD.interface, 5);
      await waitForActorFields(game, actorId, {
        "system.stats.interface": 5,
      });

      await setInputField(game, sheetId, FIELD.actions, 3);
      await waitForActorFields(game, actorId, {
        "system.stats.actions": 3,
      });

      await setInputField(game, sheetId, FIELD.combatNumber, 12);
      await waitForActorFields(game, actorId, {
        "system.stats.combatNumber": 12,
      });

      sheetId = await closeAndReopenActorSheet(game, actorId);

      const demonSheet = sheet(game, sheetId);
      await expect(demonSheet.locator(FIELD.name)).toHaveValue(editedName);
      await expect(demonSheet.locator(FIELD.rezValue)).toHaveValue("7");
      await expect(demonSheet.locator(FIELD.rezMax)).toHaveValue("15");
      await expect(demonSheet.locator(FIELD.interface)).toHaveValue("5");
      await expect(demonSheet.locator(FIELD.actions)).toHaveValue("3");
      await expect(demonSheet.locator(FIELD.combatNumber)).toHaveValue("12");
    });

    await test.step("notes editor is rendered", async () => {
      const demonSheet = sheet(game, sheetId);
      await expect(demonSheet.locator(FIELD.notesEditor)).toBeVisible();
    });

    await test.step("Interface stat roll opens dialog, confirms, and posts chat card", async () => {
      const demonSheet = sheet(game, sheetId);
      const messagesBefore = await game.evaluate(() => game.messages.size);

      await demonSheet.locator(FIELD.rollInterface).click();

      const dialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="statValue"]') });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('input[name="statValue"]')).toHaveValue("5");
      await expect(dialog.locator('input[name="luck"]')).toHaveCount(0);

      const confirm = dialog.locator(
        'button.cpr-dialog-button[data-action="confirm"]',
      );
      await expect(async () => {
        await confirm.click();
        await expect(dialog).toHaveCount(0, { timeout: 2000 });
      }).toPass({ timeout: 20000 });

      await game.waitForFunction(
        (before) => game.messages.size > before,
        messagesBefore,
        { timeout: 10000 },
      );

      const lastMessage = await game.evaluate(() => {
        const msg = game.messages.contents.at(-1);
        const doc = document.implementation.createHTMLDocument("");
        doc.body.innerHTML = msg?.content ?? "";
        return {
          text: doc.body.textContent ?? "",
          rollCount: msg?.rolls?.length ?? 0,
        };
      });
      expect(lastMessage.rollCount).toBe(1);
      expect(lastMessage.text).toContain("Interface");
      // Card shows stat name from rollTitle; program class "demon" is not in programClassList config
    });

    await test.step("Combat Number roll opens dialog and cancel exits without rolling", async () => {
      // Re-fetch sheetId from the actor in case the Interface roll left the sheet in an unexpected state
      sheetId = await game.evaluate((id) => {
        const sheet = game.actors.get(id).sheet;
        return sheet?.element?.id ?? null;
      }, actorId);
      expect(sheetId).toBeTruthy();
      const demonSheet = sheet(game, sheetId);
      const messagesBefore = await game.evaluate(() => game.messages.size);

      await demonSheet.locator(FIELD.rollCombatNumber).click();

      const dialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="statValue"]') });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('input[name="statValue"]')).toHaveValue("12");

      const cancel = dialog.locator(
        'button.cpr-dialog-button[data-action="cancel"]',
      );
      await cancel.click();
      await expect(dialog).toHaveCount(0, { timeout: 2000 });

      await game.waitForFunction(
        (before) => game.messages.size === before,
        messagesBefore,
        { timeout: 5000 },
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
