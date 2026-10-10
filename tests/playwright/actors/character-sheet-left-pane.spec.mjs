import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  openSidebarTab,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  CHARACTER_FIELD,
  CTRL_CLICK_MODIFIERS,
  addRoleToCharacter,
  applyLedgerChange,
  chatMessageCount,
  closeAndReopenCharacterSheet,
  closeLedgerWindow,
  confirmRollDialog,
  createCharacterViaUI,
  installConsoleErrorHarness,
  openLedgerWindow,
  openStatRollDialog,
  setCharacterField,
  setStatRollLuck,
  statMaxInput,
  statRollable,
  statValueInput,
  waitForCharacterFields,
  waitForNewChatMessage,
} from "./character-sheet-helpers.mjs";

async function rollDeathSave(page, sheetId) {
  const before = await chatMessageCount(page);
  await page
    .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveRollable}`)
    .click({ modifiers: CTRL_CLICK_MODIFIERS });
  const messageId = await waitForNewChatMessage(page, before, {
    requireRoll: true,
  });
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

async function woundStateLabel(page, state) {
  return page.evaluate(
    (s) => game.i18n.localize(`CPR.global.woundState.${s}`),
    state,
  );
}

installConsoleErrorHarness();

test.describe("Character sheet — left pane", () => {
  test("name and role text edits persist", async ({ page }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const newName = "Hardened Nomad";
    const newRole = "Solo";

    await test.step("setting the name commits it", async () => {
      await setCharacterField(
        page,
        sheetId,
        CHARACTER_FIELD.nameInput,
        newName,
      );
      await waitForCharacterFields(page, actorId, { name: newName });
    });

    await test.step("setting the role commits it", async () => {
      await setCharacterField(
        page,
        sheetId,
        CHARACTER_FIELD.roleInput,
        newRole,
      );
      await waitForCharacterFields(page, actorId, {
        "system.roleInfo.activeRole": newRole,
      });
    });

    let reopened = sheetId;
    await test.step("both values are on a fresh render", async () => {
      reopened = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${reopened} ${CHARACTER_FIELD.nameInput}`),
      ).toHaveValue(newName);
      await expect(
        page.locator(`#${reopened} ${CHARACTER_FIELD.roleInput}`),
      ).toHaveValue(newRole);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the hardened shield overlay appears with its reason tooltip", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("no hardened overlay at the default stats", async () => {
      await expect(
        page.locator(`#${sheetId} .actor-details-image i.fa-shield.overlay`),
      ).toHaveCount(0);
    });

    await test.step("raising WILL and BODY to 8 marks the character hardened", async () => {
      await setCharacterField(page, sheetId, statValueInput("will"), 8);
      await setCharacterField(page, sheetId, statValueInput("body"), 8);
      await waitForCharacterFields(page, actorId, {
        "system.stats.will.value": 8,
        "system.stats.body.value": 8,
        "system.derivedStats.isHardened.value": true,
      });
    });

    let reopened = sheetId;
    await test.step("the overlay is on a fresh render and lists the WILL + BODY reason", async () => {
      reopened = await closeAndReopenCharacterSheet(page, actorId);
      const overlay = page.locator(
        `#${reopened} .actor-details-image i.fa-shield.overlay`,
      );
      await expect(overlay).toBeVisible();

      const [willName, bodyName] = await page.evaluate(() => [
        game.i18n.localize("CPR.global.stats.will"),
        game.i18n.localize("CPR.global.stats.body"),
      ]);
      const tooltip = await overlay.getAttribute("data-tooltip");
      expect(tooltip).toContain(`${willName} + ${bodyName} is 16 or over`);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("HP current and max edits persist; lowering max below current clamps it", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("setting current to 35 and max to 60 commits both", async () => {
      await setCharacterField(page, sheetId, CHARACTER_FIELD.hpValueInput, 35);
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.hp.value": 35,
      });
      await setCharacterField(page, sheetId, CHARACTER_FIELD.hpMaxInput, 60);
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.hp.value": 35,
        "system.derivedStats.hp.max": 60,
      });
    });

    await test.step("both distinct values are on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`),
      ).toHaveValue("35");
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`),
      ).toHaveValue("60");
    });

    await test.step("lowering max to 30 (below current 35) clamps the current down", async () => {
      await setCharacterField(page, sheetId, CHARACTER_FIELD.hpMaxInput, 30);
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
        "system.derivedStats.hp.max": 30,
      });
    });

    await test.step("the clamped 30/30 is on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`),
      ).toHaveValue("30");
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`),
      ).toHaveValue("30");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("clicking the HP title recalculates max from WILL and BODY", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("at 40/40 raising WILL to 8 and recalculating sets 45/45", async () => {
      await setCharacterField(page, sheetId, statValueInput("will"), 8);
      await waitForCharacterFields(page, actorId, {
        "system.stats.will.value": 8,
      });
      await page.locator(`#${sheetId} ${CHARACTER_FIELD.calculateHp}`).click();
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.hp.value": 45,
        "system.derivedStats.hp.max": 45,
      });
    });

    await test.step("the recalculated 45/45 is on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`),
      ).toHaveValue("45");
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`),
      ).toHaveValue("45");
    });

    await test.step("with current 30 and BODY 8, recalculating raises only the max to 50", async () => {
      await setCharacterField(page, sheetId, CHARACTER_FIELD.hpValueInput, 30);
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
      });
      await setCharacterField(page, sheetId, statValueInput("body"), 8);
      await waitForCharacterFields(page, actorId, {
        "system.stats.body.value": 8,
      });
      await page.locator(`#${sheetId} ${CHARACTER_FIELD.calculateHp}`).click();
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
        "system.derivedStats.hp.max": 50,
      });
    });

    await test.step("the 30/50 is on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`),
      ).toHaveValue("30");
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`),
      ).toHaveValue("50");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("clicking the Humanity title recalculates from EMP", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("setting EMP max to 5 and recalculating drops humanity to 50/50", async () => {
      await setCharacterField(page, sheetId, statMaxInput("emp"), 5);
      await waitForCharacterFields(page, actorId, {
        "system.stats.emp.max": 5,
      });
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.calculateHumanity}`)
        .click();
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.humanity.value": 50,
        "system.derivedStats.humanity.max": 50,
        "system.stats.emp.value": 6,
        "system.stats.emp.max": 5,
      });
    });

    await test.step("the recalculated values are on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityValueInput}`),
      ).toHaveValue("50");
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityMaxInput}`),
      ).toHaveValue("50");
      await expect(
        page.locator(`#${sheetId} ${statValueInput("emp")}`),
      ).toHaveValue("6");
      await expect(
        page.locator(`#${sheetId} ${statMaxInput("emp")}`),
      ).toHaveValue("5");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the death save increase and reset glyphs update the display", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("each increase click adds one to the penalty and display", async () => {
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveIncrease}`)
        .click();
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.deathSave.penalty": 1,
      });
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`),
      ).toHaveText("1");

      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveIncrease}`)
        .click();
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.deathSave.penalty": 2,
      });
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`),
      ).toHaveText("2");
    });

    await test.step("the increased value is on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`),
      ).toHaveText("2");
    });

    await test.step("the reset glyph returns the penalty and display to zero", async () => {
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveReset}`)
        .click();
      await waitForCharacterFields(page, actorId, {
        "system.derivedStats.deathSave.penalty": 0,
      });
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`),
      ).toHaveText("0");
    });

    await test.step("the reset value is on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`),
      ).toHaveText("0");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("rolling a death save posts a card and success raises the penalty", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    const bodyStat = await page.evaluate(
      (id) => game.actors.get(id).system.stats.body.value,
      actorId,
    );
    let penalty = await page.evaluate(
      (id) => game.actors.get(id).system.derivedStats.deathSave.penalty,
      actorId,
    );
    await openSidebarTab(page, "chat");

    let sawSuccess = false;
    await test.step("each death save roll is consistent and success raises the penalty", async () => {
      for (let i = 0; i < 15 && !(sawSuccess && i >= 3); i += 1) {
        const { rollClass, resultTotal, outcome } = await rollDeathSave(
          page,
          sheetId,
        );
        expect(rollClass).toBe("CPRDeathSaveRoll");
        const expected = resultTotal < bodyStat ? "success" : "failure";
        expect(
          outcome,
          `total ${resultTotal} vs BODY ${bodyStat} should be ${expected}`,
        ).toBe(expected);

        if (outcome === "success") {
          penalty += 1;
          sawSuccess = true;
        }
        await waitForCharacterFields(page, actorId, {
          "system.derivedStats.deathSave.penalty": penalty,
        });
      }
    });

    expect(
      sawSuccess,
      "at least one death save should succeed within the loop",
    ).toBe(true);

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the wound state icon reflects HP across all four states", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    const assertWoundState = async (state) => {
      const expected = await woundStateLabel(page, state);
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.woundStateImage}`),
      ).toHaveAttribute("alt", expected);
    };

    await test.step("at the default HP (40/40) the icon is not wounded", async () => {
      await assertWoundState("notWounded");
    });

    for (const { state, hp } of [
      { state: "lightlyWounded", hp: 20 },
      { state: "seriouslyWounded", hp: 19 },
      { state: "mortallyWounded", hp: 0 },
    ]) {
      await test.step(`at HP ${hp} the icon is ${state}`, async () => {
        await setCharacterField(
          page,
          sheetId,
          CHARACTER_FIELD.hpValueInput,
          hp,
        );
        await waitForCharacterFields(page, actorId, {
          "system.derivedStats.hp.value": hp,
        });
        sheetId = await closeAndReopenCharacterSheet(page, actorId);
        await assertWoundState(state);
      });
    }

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the IP value displays and the ledger add/subtract/set update it", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("a fresh character shows 0 improvement points", async () => {
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.improvementPointsValue}`),
      ).toHaveText("0");
    });

    const ledger = await openLedgerWindow(
      page,
      sheetId,
      CHARACTER_FIELD.improvementPointsLedgerIcon,
    );

    await test.step("the fresh IP ledger shows a total of 0 and no history", async () => {
      await expect(ledger.locator(".ledger-info")).toContainText(
        "Improvement Points",
      );
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "0 I.P.",
      );
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(0);
    });

    await test.step("adding 5 raises the total to 5 and records it", async () => {
      await applyLedgerChange(
        page,
        actorId,
        "system.improvementPoints.value",
        "add",
        5,
        "session",
      );
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "5 I.P.",
      );
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(1);
    });

    await test.step("subtracting 2 lowers the total to 3 and records it", async () => {
      await applyLedgerChange(
        page,
        actorId,
        "system.improvementPoints.value",
        "subtract",
        2,
        "session",
      );
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "3 I.P.",
      );
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(2);
    });

    await test.step("setting 10 replaces the total and records it", async () => {
      await applyLedgerChange(
        page,
        actorId,
        "system.improvementPoints.value",
        "set",
        10,
        "session",
      );
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "10 I.P.",
      );
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(3);
    });

    await test.step("the sheet IP display tracks the ledger total", async () => {
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.improvementPointsValue}`),
      ).toHaveText("10");
    });

    await closeLedgerWindow(page);

    let reopened = sheetId;
    await test.step("the total and history persist across a sheet close and reopen", async () => {
      reopened = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${reopened} ${CHARACTER_FIELD.improvementPointsValue}`),
      ).toHaveText("10");
      const reopenedLedger = await openLedgerWindow(
        page,
        reopened,
        CHARACTER_FIELD.improvementPointsLedgerIcon,
      );
      await expect(
        reopenedLedger.locator(".ledger-info > div:last-child"),
      ).toHaveText("10 I.P.");
      await expect(
        reopenedLedger.locator(".ledger-list > li.item"),
      ).toHaveCount(3);
      await closeLedgerWindow(page);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the facedown roll posts a card and the reputation ledger opens", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("a fresh character shows 0 reputation", async () => {
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.reputationValue}`),
      ).toHaveText("0");
    });

    const before = await chatMessageCount(page);
    await openSidebarTab(page, "chat");
    await test.step("ctrl-clicking the facedown roll posts a card attributed to the actor", async () => {
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.facedownRollable}`)
        .click({ modifiers: CTRL_CLICK_MODIFIERS });
      const messageId = await waitForNewChatMessage(page, before, {
        requireRoll: true,
      });
      const message = await page.evaluate((id) => {
        const msg = game.messages.get(id);
        return {
          rollClass: msg.rolls?.[0]?.constructor?.name ?? null,
          actor: msg.speaker.actor,
        };
      }, messageId);
      expect(message.rollClass).toBe("CPRFacedownRoll");
      expect(message.actor).toBe(actorId);
    });

    await test.step("the reputation ledger opens with no history", async () => {
      const ledger = await openLedgerWindow(
        page,
        sheetId,
        CHARACTER_FIELD.reputationLedgerIcon,
      );
      await expect(ledger.locator(".ledger-info")).toContainText("Reputation");
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(0);
      await closeLedgerWindow(page);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("the eurobucks value displays and the wealth ledger opens", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("a fresh character shows 0 eb", async () => {
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.eurobucksValue}`),
      ).toHaveText("0 eb");
    });

    await test.step("the wealth ledger opens with a total of 0 eb and no history", async () => {
      const ledger = await openLedgerWindow(
        page,
        sheetId,
        CHARACTER_FIELD.eurobucksLedgerIcon,
      );
      await expect(ledger.locator(".ledger-info")).toContainText("Eurobucks");
      await expect(ledger.locator(".ledger-info > div:last-child")).toHaveText(
        "0 eb",
      );
      await expect(ledger.locator(".ledger-list > li.item")).toHaveCount(0);
      await closeLedgerWindow(page);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("clicking a stat rolls through the verify dialog; ctrl-click skips it", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);

    let messageId = null;
    const before = await chatMessageCount(page);

    await test.step("clicking the BODY title opens the roll dialog and confirms it", async () => {
      const dialog = await openStatRollDialog(page, sheetId, "body");
      await expect(dialog.locator('input[name="statValue"]')).toBeDisabled();
      await setStatRollLuck(dialog, 2);
      await confirmRollDialog(dialog);
    });

    await test.step("confirming posts one roll card attributed to the actor", async () => {
      messageId = await waitForNewChatMessage(page, before, {
        requireRoll: true,
      });
      const message = await page.evaluate((id) => {
        const msg = game.messages.get(id);
        return { rolls: msg.rolls.length, actor: msg.speaker.actor };
      }, messageId);
      expect(message.rolls).toBe(1);
      expect(message.actor).toBe(actorId);
    });

    await test.step("the LUCK used in the dialog is consumed from the pool", async () => {
      await waitForCharacterFields(page, actorId, {
        "system.stats.luck.value": 4,
      });
    });

    const beforeRef = await chatMessageCount(page);
    await openSidebarTab(page, "chat");
    await test.step("ctrl-clicking the REF title posts a roll without the dialog", async () => {
      await page
        .locator(`#${sheetId} ${statRollable("ref")}`)
        .click({ modifiers: CTRL_CLICK_MODIFIERS });
      const refMessageId = await waitForNewChatMessage(page, beforeRef, {
        requireRoll: true,
      });
      expect(refMessageId).toBeTruthy();
      const dialogCount = await page
        .locator(".application")
        .filter({ has: page.locator('input[name="luck"]') })
        .count();
      expect(dialogCount).toBe(0);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("LUCK and EMP value/max pairs persist", async ({ page }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("setting LUCK and EMP value and max commits all four", async () => {
      await setCharacterField(page, sheetId, statValueInput("luck"), 3);
      await waitForCharacterFields(page, actorId, {
        "system.stats.luck.value": 3,
      });
      await setCharacterField(page, sheetId, statMaxInput("luck"), 7);
      await waitForCharacterFields(page, actorId, {
        "system.stats.luck.max": 7,
      });
      await setCharacterField(page, sheetId, statValueInput("emp"), 4);
      await waitForCharacterFields(page, actorId, {
        "system.stats.emp.value": 4,
      });
      await setCharacterField(page, sheetId, statMaxInput("emp"), 9);
      await waitForCharacterFields(page, actorId, {
        "system.stats.emp.max": 9,
      });
    });

    await test.step("all four values are on a fresh render", async () => {
      sheetId = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${sheetId} ${statValueInput("luck")}`),
      ).toHaveValue("3");
      await expect(
        page.locator(`#${sheetId} ${statMaxInput("luck")}`),
      ).toHaveValue("7");
      await expect(
        page.locator(`#${sheetId} ${statValueInput("emp")}`),
      ).toHaveValue("4");
      await expect(
        page.locator(`#${sheetId} ${statMaxInput("emp")}`),
      ).toHaveValue("9");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("dragging a role onto a fresh character fills the empty Role field", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    const roleName = uniqueName("role");

    await test.step("a fresh character has an empty Role field", async () => {
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.roleInput}`),
      ).toHaveValue("");
    });

    await test.step("dragging a role item fills the empty Role field", async () => {
      await addRoleToCharacter(page, { actorId, sheetId, name: roleName });
      await waitForCharacterFields(page, actorId, {
        "system.roleInfo.activeRole": roleName,
      });
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.roleInput}`),
      ).toHaveValue(roleName);
    });

    let reopened = sheetId;
    await test.step("the role persists on a fresh render", async () => {
      reopened = await closeAndReopenCharacterSheet(page, actorId);
      await expect(
        page.locator(`#${reopened} ${CHARACTER_FIELD.roleInput}`),
      ).toHaveValue(roleName);
    });

    await test.step("dragging a second role does not overwrite the existing Role text", async () => {
      const secondRole = uniqueName("role");
      await addRoleToCharacter(page, {
        actorId,
        sheetId: reopened,
        name: secondRole,
      });
      await waitForCharacterFields(page, actorId, {
        "system.roleInfo.activeRole": roleName,
      });
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});
