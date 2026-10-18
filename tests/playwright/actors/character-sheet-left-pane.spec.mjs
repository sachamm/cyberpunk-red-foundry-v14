import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  applyLedgerChange,
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeLedgerWindow,
  openLedgerWindow,
  openSidebarTab,
  setSheetField,
  waitForActorFields,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";
import {
  CHARACTER_FIELD,
  confirmRollDialog,
  createCharacterViaUI,
  createRoleItemViaUI,
  dragRoleItemToCharacter,
  openStatRollDialog,
  setStatRollLuck,
  statMaxInput,
  statRollable,
  statValueInput,
} from "./character-sheet-helpers.mjs";

async function assertWoundState(page, sheetId, state) {
  const expected = await page.evaluate(
    (s) => game.i18n.localize(`CPR.global.woundState.${s}`),
    state,
  );
  await expect
    .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.woundStateImage}`))
    .toHaveAttribute("alt", expected);
}

async function assertHardenedOverlay(page, sheetId) {
  const overlay = page.locator(
    `#${sheetId} .actor-details-image i.fa-shield.overlay`,
  );
  await expect.soft(overlay).toBeVisible();
  const [willName, bodyName] = await page.evaluate(() => [
    game.i18n.localize("CPR.global.stats.will"),
    game.i18n.localize("CPR.global.stats.body"),
  ]);
  const tooltip = await overlay.getAttribute("data-tooltip");
  expect.soft(tooltip).toContain(`${willName} + ${bodyName} is 16 or over`);
}

async function queueDeathSaveFaces(page, faces) {
  await page.evaluate((queuedFaces) => {
    window.__cprOrigRandomUniform = CONFIG.Dice.randomUniform;
    const queue = queuedFaces.map((face) => 1 - (face - 0.5) / 10);
    let i = 0;
    CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
  }, faces);
}

async function restoreDice(page) {
  await page.evaluate(() => {
    if (window.__cprOrigRandomUniform) {
      CONFIG.Dice.randomUniform = window.__cprOrigRandomUniform;
      delete window.__cprOrigRandomUniform;
    }
  });
}

async function rollDeathSave(page, sheetId) {
  const before = await chatMessageCount(page);
  await page
    .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveRollable}`)
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
  const card = page.locator(
    `#chat .chat-message[data-message-id="${messageId}"]`,
  );
  const resultTotal = Number(
    await card.locator(".d10-number-div span.clickable").textContent(),
  );
  const outcome =
    (await card.locator(".roll-success").count()) > 0 ? "success" : "failure";
  return { ...message, resultTotal, outcome };
}

installConsoleErrorHarness();

test.describe("Character sheet — left pane", () => {
  test("identity, stats, HP, humanity, and wound state persist", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);
    const newName = "Hardened Nomad";
    const newRole = "Solo";

    await test.step("baseline has no hardened overlay and is not wounded", async () => {
      await expect
        .soft(
          page.locator(`#${sheetId} .actor-details-image i.fa-shield.overlay`),
        )
        .toHaveCount(0);
      await assertWoundState(page, sheetId, "notWounded");
    });

    await test.step("name and role text edits persist", async () => {
      await setSheetField(page, sheetId, CHARACTER_FIELD.nameInput, newName);
      await waitForActorFields(page, actorId, { name: newName });
      await setSheetField(page, sheetId, CHARACTER_FIELD.roleInput, newRole);
      await waitForActorFields(page, actorId, {
        "system.roleInfo.activeRole": newRole,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.nameInput}`))
        .toHaveValue(newName);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.roleInput}`))
        .toHaveValue(newRole);
    });

    for (const { state, hp } of [
      { state: "lightlyWounded", hp: 20 },
      { state: "seriouslyWounded", hp: 19 },
      { state: "mortallyWounded", hp: 0 },
    ]) {
      await test.step(`at HP ${hp} the wound state is ${state}`, async () => {
        await setSheetField(page, sheetId, CHARACTER_FIELD.hpValueInput, hp);
        await waitForActorFields(page, actorId, {
          "system.derivedStats.hp.value": hp,
        });
        sheetId = await closeAndReopenActorSheet(page, actorId);
        await assertWoundState(page, sheetId, state);
      });
    }

    await test.step("recalculating HP from a full current value raises both to the stat total", async () => {
      await setSheetField(page, sheetId, CHARACTER_FIELD.hpValueInput, 40);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 40,
      });
      await setSheetField(page, sheetId, statValueInput("will"), 8);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 40,
        "system.stats.will.value": 8,
      });
      await page.locator(`#${sheetId} ${CHARACTER_FIELD.calculateHp}`).click();
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 45,
        "system.derivedStats.hp.max": 45,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`))
        .toHaveValue("45");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`))
        .toHaveValue("45");
    });

    await test.step("recalculating HP from a wounded current value raises only the max and marks hardened", async () => {
      await setSheetField(page, sheetId, CHARACTER_FIELD.hpValueInput, 30);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
      });
      await setSheetField(page, sheetId, statValueInput("body"), 8);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
        "system.stats.body.value": 8,
      });
      await page.locator(`#${sheetId} ${CHARACTER_FIELD.calculateHp}`).click();
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
        "system.derivedStats.hp.max": 50,
        "system.derivedStats.isHardened.value": true,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`))
        .toHaveValue("30");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`))
        .toHaveValue("50");
      await assertHardenedOverlay(page, sheetId);
    });

    await test.step("one humanity recalculation sets 50/50 and EMP 5/5", async () => {
      await setSheetField(page, sheetId, statMaxInput("emp"), 5);
      await waitForActorFields(page, actorId, {
        "system.stats.emp.max": 5,
      });
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.calculateHumanity}`)
        .click();
      await waitForActorFields(page, actorId, {
        "system.derivedStats.humanity.value": 50,
        "system.derivedStats.humanity.max": 50,
        "system.stats.emp.max": 5,
      });
      await expect
        .soft(page.locator(`#${sheetId} ${statValueInput("emp")}`))
        .toHaveValue("5");
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityValueInput}`))
        .toHaveValue("50");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityMaxInput}`))
        .toHaveValue("50");
      await expect
        .soft(page.locator(`#${sheetId} ${statMaxInput("emp")}`))
        .toHaveValue("5");
      await expect
        .soft(page.locator(`#${sheetId} ${statValueInput("emp")}`))
        .toHaveValue("5");
    });

    await test.step("recalculating humanity again leaves Humanity and EMP unchanged", async () => {
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.calculateHumanity}`)
        .click();
      sheetId = await closeAndReopenActorSheet(page, actorId);
      for (const [selector, value] of [
        [CHARACTER_FIELD.humanityValueInput, "50"],
        [CHARACTER_FIELD.humanityMaxInput, "50"],
        [statValueInput("emp"), "5"],
        [statMaxInput("emp"), "5"],
      ]) {
        await expect
          .soft(page.locator(`#${sheetId} ${selector}`))
          .toHaveValue(value);
      }
    });

    for (const { label, humanity, empMax, expectedHumanity, expectedEmp } of [
      {
        label: "depleted Humanity below the new maximum",
        humanity: 37,
        empMax: 5,
        expectedHumanity: 37,
        expectedEmp: 3,
      },
      {
        label: "depleted Humanity above the new maximum",
        humanity: 59,
        empMax: 4,
        expectedHumanity: 40,
        expectedEmp: 4,
      },
      {
        label: "raising the maximum without healing",
        humanity: 60,
        empMax: 7,
        expectedHumanity: 60,
        expectedEmp: 6,
      },
      {
        label: "an unchanged maximum with depleted Humanity",
        humanity: 37,
        empMax: 6,
        expectedHumanity: 37,
        expectedEmp: 3,
      },
      {
        label: "zero Humanity",
        humanity: 0,
        empMax: 5,
        expectedHumanity: 0,
        expectedEmp: 0,
      },
      {
        label: "negative Humanity",
        humanity: -1,
        empMax: 5,
        expectedHumanity: -1,
        expectedEmp: -1,
      },
      {
        label: "lowering the maximum to zero",
        humanity: 60,
        empMax: 0,
        expectedHumanity: 0,
        expectedEmp: 0,
      },
    ]) {
      await test.step(`humanity recalculation handles ${label}`, async () => {
        sheetId = await closeAndReopenActorSheet(page, actorId);
        for (const [selector, path, value] of [
          [
            CHARACTER_FIELD.humanityMaxInput,
            "system.derivedStats.humanity.max",
            60,
          ],
          [
            CHARACTER_FIELD.humanityValueInput,
            "system.derivedStats.humanity.value",
            humanity,
          ],
          [statValueInput("emp"), "system.stats.emp.value", 6],
          [statMaxInput("emp"), "system.stats.emp.max", empMax],
        ]) {
          await setSheetField(page, sheetId, selector, value);
          await waitForActorFields(page, actorId, { [path]: value });
        }
        await page
          .locator(`#${sheetId} ${CHARACTER_FIELD.calculateHumanity}`)
          .click();
        await waitForActorFields(page, actorId, {
          "system.derivedStats.humanity.max": empMax * 10,
          "system.derivedStats.humanity.value": expectedHumanity,
        });
        await expect
          .soft(page.locator(`#${sheetId} ${statValueInput("emp")}`))
          .toHaveValue(String(expectedEmp));
        sheetId = await closeAndReopenActorSheet(page, actorId);
        for (const [selector, value] of [
          [CHARACTER_FIELD.humanityValueInput, expectedHumanity],
          [CHARACTER_FIELD.humanityMaxInput, empMax * 10],
          [statValueInput("emp"), expectedEmp],
          [statMaxInput("emp"), empMax],
        ]) {
          await expect
            .soft(page.locator(`#${sheetId} ${selector}`))
            .toHaveValue(String(value));
        }
      });
    }

    await test.step("HP current and max edits persist", async () => {
      await setSheetField(page, sheetId, CHARACTER_FIELD.hpValueInput, 35);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 35,
      });
      await setSheetField(page, sheetId, CHARACTER_FIELD.hpMaxInput, 60);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 35,
        "system.derivedStats.hp.max": 60,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`))
        .toHaveValue("35");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`))
        .toHaveValue("60");
    });

    await test.step("lowering HP max below current clamps the current down", async () => {
      await setSheetField(page, sheetId, CHARACTER_FIELD.hpMaxInput, 30);
      await waitForActorFields(page, actorId, {
        "system.derivedStats.hp.value": 30,
        "system.derivedStats.hp.max": 30,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpValueInput}`))
        .toHaveValue("30");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.hpMaxInput}`))
        .toHaveValue("30");
    });

    await test.step("LUCK and EMP value/max pairs persist", async () => {
      await setSheetField(page, sheetId, statValueInput("luck"), 3);
      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": 3,
      });
      await setSheetField(page, sheetId, statMaxInput("luck"), 7);
      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": 3,
        "system.stats.luck.max": 7,
      });
      await setSheetField(page, sheetId, statValueInput("emp"), 4);
      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": 3,
        "system.stats.luck.max": 7,
        "system.stats.emp.value": 4,
      });
      await setSheetField(page, sheetId, statMaxInput("emp"), 9);
      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": 3,
        "system.stats.luck.max": 7,
        "system.stats.emp.value": 4,
        "system.stats.emp.max": 9,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${statValueInput("luck")}`))
        .toHaveValue("3");
      await expect
        .soft(page.locator(`#${sheetId} ${statMaxInput("luck")}`))
        .toHaveValue("7");
      await expect
        .soft(page.locator(`#${sheetId} ${statValueInput("emp")}`))
        .toHaveValue("4");
      await expect
        .soft(page.locator(`#${sheetId} ${statMaxInput("emp")}`))
        .toHaveValue("9");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("death save controls and rolls update the penalty", async ({ page }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("increase glyphs raise the displayed penalty", async () => {
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveIncrease}`)
        .click();
      await waitForActorFields(page, actorId, {
        "system.derivedStats.deathSave.penalty": 1,
      });
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`))
        .toHaveText("1");

      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveIncrease}`)
        .click();
      await waitForActorFields(page, actorId, {
        "system.derivedStats.deathSave.penalty": 2,
      });
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`))
        .toHaveText("2");

      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`))
        .toHaveText("2");
    });

    await test.step("reset glyph returns the penalty to zero", async () => {
      await page
        .locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveReset}`)
        .click();
      await waitForActorFields(page, actorId, {
        "system.derivedStats.deathSave.penalty": 0,
      });
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`))
        .toHaveText("0");

      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`))
        .toHaveText("0");
    });

    await test.step("a failed death save leaves the penalty and a success raises it", async () => {
      await openSidebarTab(page, "chat");
      await queueDeathSaveFaces(page, [6, 5]);
      try {
        const failure = await rollDeathSave(page, sheetId);
        expect(failure.rollClass).toBe("CPRDeathSaveRoll");
        expect(failure.actor).toBe(actorId);
        expect(failure.resultTotal).toBe(6);
        expect(failure.outcome).toBe("failure");
        await waitForActorFields(page, actorId, {
          "system.derivedStats.deathSave.penalty": 0,
        });

        const success = await rollDeathSave(page, sheetId);
        expect(success.rollClass).toBe("CPRDeathSaveRoll");
        expect(success.actor).toBe(actorId);
        expect(success.resultTotal).toBe(5);
        expect(success.outcome).toBe("success");
        await waitForActorFields(page, actorId, {
          "system.derivedStats.deathSave.penalty": 1,
        });
      } finally {
        await restoreDice(page);
      }

      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.deathSaveValue}`))
        .toHaveText("1");
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("IP, reputation, and eurobucks surfaces update and open their ledgers", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);

    await test.step("fresh values display zero", async () => {
      await expect
        .soft(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.improvementPointsValue}`),
        )
        .toHaveText("0");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.reputationValue}`))
        .toHaveText("0");
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.eurobucksValue}`))
        .toHaveText("0 eb");
    });

    const ledger = await openLedgerWindow(
      page,
      sheetId,
      CHARACTER_FIELD.improvementPointsLedgerIcon,
    );

    await test.step("the IP ledger opens at zero with no history", async () => {
      await expect
        .soft(ledger.locator(".ledger-info"))
        .toContainText("Improvement Points");
      await expect
        .soft(ledger.locator(".ledger-info > div:last-child"))
        .toHaveText("0 I.P.");
      await expect
        .soft(ledger.locator(".ledger-list > li.item"))
        .toHaveCount(0);
    });

    await test.step("adding 5 IP updates the total, sheet display, and history", async () => {
      await applyLedgerChange(
        page,
        actorId,
        "system.improvementPoints.value",
        "add",
        5,
        "session",
      );
      await expect
        .soft(ledger.locator(".ledger-info > div:last-child"))
        .toHaveText("5 I.P.");
      await expect
        .soft(ledger.locator(".ledger-list > li.item"))
        .toHaveCount(1);
      await expect
        .soft(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.improvementPointsValue}`),
        )
        .toHaveText("5");

      await closeLedgerWindow(page);
      sheetId = await closeAndReopenActorSheet(page, actorId);
      const reopenedLedger = await openLedgerWindow(
        page,
        sheetId,
        CHARACTER_FIELD.improvementPointsLedgerIcon,
      );
      await expect
        .soft(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.improvementPointsValue}`),
        )
        .toHaveText("5");
      await expect
        .soft(reopenedLedger.locator(".ledger-info > div:last-child"))
        .toHaveText("5 I.P.");
      await expect
        .soft(reopenedLedger.locator(".ledger-list > li.item"))
        .toHaveCount(1);
      await closeLedgerWindow(page);
    });

    await test.step("the facedown roll posts an actor-attributed card", async () => {
      const before = await chatMessageCount(page);
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
      const reputationLedger = await openLedgerWindow(
        page,
        sheetId,
        CHARACTER_FIELD.reputationLedgerIcon,
      );
      await expect
        .soft(reputationLedger.locator(".ledger-info"))
        .toContainText("Reputation");
      await expect
        .soft(reputationLedger.locator(".ledger-list > li.item"))
        .toHaveCount(0);
      await closeLedgerWindow(page);
    });

    await test.step("the eurobucks ledger opens at zero", async () => {
      const eurobucksLedger = await openLedgerWindow(
        page,
        sheetId,
        CHARACTER_FIELD.eurobucksLedgerIcon,
      );
      await expect
        .soft(eurobucksLedger.locator(".ledger-info"))
        .toContainText("Eurobucks");
      await expect
        .soft(eurobucksLedger.locator(".ledger-info > div:last-child"))
        .toHaveText("0 eb");
      await expect
        .soft(eurobucksLedger.locator(".ledger-list > li.item"))
        .toHaveCount(0);
      await closeLedgerWindow(page);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });

  test("stat rolls use the verify dialog on click and skip it on ctrl-click", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);
    const before = await chatMessageCount(page);

    await test.step("clicking a stat title opens the verify dialog and consumes LUCK", async () => {
      const dialog = await openStatRollDialog(page, sheetId, "body");
      await expect(dialog.locator('input[name="statValue"]')).toBeDisabled();
      await setStatRollLuck(dialog, 2);
      await confirmRollDialog(dialog);

      const messageId = await waitForNewChatMessage(page, before, {
        requireRoll: true,
      });
      const message = await page.evaluate((id) => {
        const msg = game.messages.get(id);
        return { rolls: msg.rolls.length, actor: msg.speaker.actor };
      }, messageId);
      expect(message.rolls).toBe(1);
      expect(message.actor).toBe(actorId);

      await waitForActorFields(page, actorId, {
        "system.stats.luck.value": 4,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${statValueInput("luck")}`))
        .toHaveValue("4");
    });

    await test.step("ctrl-clicking a stat title posts a roll without the dialog", async () => {
      const refBefore = await chatMessageCount(page);
      await page
        .locator(`#${sheetId} ${statRollable("ref")}`)
        .click({ modifiers: CTRL_CLICK_MODIFIERS });
      const refMessageId = await waitForNewChatMessage(page, refBefore, {
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

  test("dragging a role fills an empty Role field and never overwrites it", async ({
    page,
  }) => {
    let { actorId, sheetId } = await createCharacterViaUI(page);
    const firstRole = await createRoleItemViaUI(page);

    await test.step("a fresh character has an empty Role field", async () => {
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.roleInput}`),
      ).toHaveValue("");
    });

    await test.step("dragging a role item fills the empty Role field", async () => {
      await dragRoleItemToCharacter(page, {
        actorId,
        sheetId,
        itemId: firstRole.itemId,
      });
      await waitForActorFields(page, actorId, {
        "system.roleInfo.activeRole": firstRole.name,
      });
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.roleInput}`))
        .toHaveValue(firstRole.name);
    });

    await test.step("dragging another role does not overwrite the existing Role text", async () => {
      const secondRole = await createRoleItemViaUI(page);
      await dragRoleItemToCharacter(page, {
        actorId,
        sheetId,
        itemId: secondRole.itemId,
      });
      await page.waitForFunction(
        ({ id, expectedRole }) => {
          const actor = game.actors.get(id);
          const roleItems = Array.from(actor.items).filter(
            (item) => item.type === "role",
          ).length;
          return (
            roleItems >= 2 &&
            foundry.utils.getProperty(actor, "system.roleInfo.activeRole") ===
              expectedRole
          );
        },
        { id: actorId, expectedRole: firstRole.name },
        { timeout: 10000 },
      );
      sheetId = await closeAndReopenActorSheet(page, actorId);
      await expect
        .soft(page.locator(`#${sheetId} ${CHARACTER_FIELD.roleInput}`))
        .toHaveValue(firstRole.name);
    });

    await closeDocSheet(page, { collection: "actors", id: actorId });
  });
});
