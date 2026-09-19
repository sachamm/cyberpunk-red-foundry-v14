import { test, expect } from "@playwright/test";
import {
  closeOwnedItemSheet,
  openOwnedItemSheet,
  openSidebarTab,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  CTRL_CLICK_MODIFIERS,
  cancelCriticalInjuryRollDialog,
  chatMessageCount,
  closeAndReopenMookSheet,
  confirmCriticalInjuryRoll,
  createMookViaUI,
  installConsoleErrorHarness,
  openCriticalInjuryRollDialog,
  seedCriticalInjuryOnMook,
  waitForNewChatMessage,
  yesNoDialog,
  resolveYesNo,
  deleteKeyRemove,
  waitItemRemoved,
} from "./mook-sheet-helpers.mjs";

installConsoleErrorHarness();

const BODY_CRITICAL_INJURY_TABLE = "Critical Injuries (Body)";
const HEAD_CRITICAL_INJURY_TABLE = "Critical Injuries (Head)";

test.describe("Critical Injury Pane", () => {
  test("a fresh mook shows an empty critical injuries pane", async ({
    page: game,
  }) => {
    const { sheetId } = await createMookViaUI(game);

    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryHeader}`),
    ).toBeVisible();
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryRollButton}`),
    ).toBeVisible();
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryContent}`),
    ).toBeVisible();
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(0);
  });

  test("dragging a critical injury onto a mook lists it in the critical injuries pane", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("criticalInjury");
    let embeddedId;
    await test.step("dragging the injury onto the mook embeds it without equipping or installing", async () => {
      embeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: itemName,
        location: "body",
      });
      expect(
        embeddedId,
        "the critical injury should be embedded on the mook",
      ).toBeTruthy();

      const flags = await game.evaluate(
        ({ actorId, itemId }) => {
          const item = game.actors.get(actorId).items.get(itemId);
          return {
            equipped: item.system.equipped,
            isInstalled: item.system.isInstalled,
          };
        },
        { actorId, itemId: embeddedId },
      );
      expect(flags.equipped).not.toBe("equipped");
      expect(flags.isInstalled).toBeFalsy();
    });

    await test.step("a fresh render lists the injury in the critical injuries pane", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
      await expect(link).toHaveText(itemName);
    });
  });

  test("critical injuries render as a comma-separated list with location icons", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const bodyName = uniqueName("criticalInjury");
    const headName = uniqueName("criticalInjury");
    let bodyEmbeddedId;
    let headEmbeddedId;
    await test.step("dragging a body injury and a head injury onto the mook embeds both", async () => {
      bodyEmbeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: bodyName,
        location: "body",
      });
      headEmbeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: headName,
        location: "head",
      });
      expect(
        bodyEmbeddedId && headEmbeddedId,
        "both critical injuries should be embedded on the mook",
      ).toBeTruthy();
    });

    await test.step("a fresh render lists them comma-separated with a location icon each", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const bodyLink = game.locator(
        `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${bodyEmbeddedId}"]`,
      );
      const headLink = game.locator(
        `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${headEmbeddedId}"]`,
      );
      await expect(bodyLink).toBeVisible();
      await expect(headLink).toBeVisible();
      await expect(bodyLink).toHaveText(`${bodyName},`);
      await expect(headLink).toHaveText(headName);
      await expect(bodyLink.locator("i.fas.fa-user-injured")).toHaveCount(1);
      await expect(headLink.locator("i.fas.fa-user-injured")).toHaveCount(1);
    });
  });

  test("an injury flagged deathSaveIncrease renders bold", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("criticalInjury");
    let embeddedId;
    await test.step("dragging the flagged injury onto the mook embeds it", async () => {
      embeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: itemName,
        location: "body",
        deathSaveIncrease: true,
      });
      expect(
        embeddedId,
        "the critical injury should be embedded on the mook",
      ).toBeTruthy();
    });

    await test.step("a fresh render bolds the injury's name", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
      await expect(link).toHaveText(itemName);
      await expect(link).toHaveClass(/text-semi/);
    });
  });

  test("an injury flagged deathSaveIncrease raises the displayed death-save value by one", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("criticalInjury");
    let embeddedId;
    await test.step("dragging the flagged injury onto the mook embeds it", async () => {
      embeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: itemName,
        location: "body",
        deathSaveIncrease: true,
      });
      expect(
        embeddedId,
        "the critical injury should be embedded on the mook",
      ).toBeTruthy();
    });

    await test.step("a fresh render shows the death-save value increased by one", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const deathSaveValue = game.locator(
        `#${sheetId} ${MOOK_FIELD.deathSaveValue}`,
      );
      await expect(deathSaveValue).toHaveText("1");

      const basePenalty = await game.evaluate(
        (id) => game.actors.get(id).system.derivedStats.deathSave.basePenalty,
        actorId,
      );
      expect(basePenalty).toBe(1);
    });
  });

  test("clicking a listed injury opens its item sheet", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("criticalInjury");
    let embeddedId;
    await test.step("dragging the injury onto the mook lists it", async () => {
      embeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: itemName,
        location: "body",
      });
      expect(
        embeddedId,
        "the critical injury should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(
          `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
        ),
      ).toBeVisible();
    });

    await test.step("clicking the injury's name opens its item sheet", async () => {
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
        )
        .click();

      const itemSheetId = await openOwnedItemSheet(game, {
        actorId,
        itemId: embeddedId,
      });
      await expect(game.locator(`#${itemSheetId}`)).toBeVisible();
      await closeOwnedItemSheet(game, { actorId, itemId: embeddedId });
    });
  });

  test("ctrl-clicking a listed injury posts its card to chat", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("criticalInjury");
    let embeddedId;
    await test.step("dragging the injury onto the mook lists it", async () => {
      embeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: itemName,
        location: "body",
      });
      expect(
        embeddedId,
        "the critical injury should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(
          `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
        ),
      ).toBeVisible();
    });

    await test.step("ctrl-clicking the name posts the item card to chat", async () => {
      const messagesBefore = await chatMessageCount(game);
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
        )
        .click({ modifiers: CTRL_CLICK_MODIFIERS });

      const messageId = await waitForNewChatMessage(game, messagesBefore, {
        requireContent: true,
      });

      await openSidebarTab(game, "chat");
      const card = game
        .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
        .locator(".item-card-grid-container");
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator(".item-card-type")).toContainText(
        "Critical Injury",
      );
    });

    await test.step("ctrl-click does not open the item sheet", async () => {
      await expect(game.locator(".application .item-sheet")).toHaveCount(0);
    });
  });

  test("pressing Delete while focused on a listed injury removes it after confirmation", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("criticalInjury");
    let embeddedId;
    await test.step("dragging the injury onto the mook lists it", async () => {
      embeddedId = await seedCriticalInjuryOnMook(game, {
        actorId,
        sheetId,
        name: itemName,
        location: "body",
      });
      expect(
        embeddedId,
        "the critical injury should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
    });

    await test.step("focusing the name and pressing Delete removes it after confirmation", async () => {
      await deleteKeyRemove(
        game,
        game.locator(
          `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
        ),
      );

      const confirmDialog = yesNoDialog(game);
      await expect(confirmDialog).toBeVisible({ timeout: 10000 });
      await expect(confirmDialog.locator(".cpr-dialog-message")).toContainText(
        itemName,
      );
      await resolveYesNo(confirmDialog, "yes");
      await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

      await waitItemRemoved(game, { actorId, itemId: embeddedId });

      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(
          `#${freshSheet} ${MOOK_FIELD.criticalInjuryItem}[data-item-id="${embeddedId}"]`,
        ),
      ).toHaveCount(0);
    });
  });
});

test.describe("Critical Injury Roll", () => {
  test("canceling the critical injury roll prompt changes nothing", async ({
    page: game,
  }) => {
    const { sheetId } = await createMookViaUI(game);
    const messagesBefore = await chatMessageCount(game);

    const dialog = await openCriticalInjuryRollDialog(game, sheetId);
    const tableOptions = dialog.locator(
      `${MOOK_FIELD.criticalInjuryTableSelect} option`,
    );
    await expect(tableOptions).toHaveCount(2);
    await expect(tableOptions.nth(0)).toHaveText(BODY_CRITICAL_INJURY_TABLE);
    await expect(tableOptions.nth(1)).toHaveText(HEAD_CRITICAL_INJURY_TABLE);

    await cancelCriticalInjuryRollDialog(dialog);
    expect(await chatMessageCount(game)).toBe(messagesBefore);
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(0);
  });

  test("rolling from the default tables adds one critical injury and posts its roll card", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);
    const messagesBefore = await chatMessageCount(game);

    const dialog = await openCriticalInjuryRollDialog(game, sheetId);
    await confirmCriticalInjuryRoll(dialog, {
      table: BODY_CRITICAL_INJURY_TABLE,
    });

    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(1, { timeout: 30000 });
    const messageId = await waitForNewChatMessage(game, messagesBefore, {
      requireContent: true,
      timeout: 30000,
    });

    await openSidebarTab(game, "chat");
    const card = game
      .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
      .locator(".rollcard");
    await expect(card).toBeVisible();
    await expect(card.locator(".rollcard-top")).toContainText(
      BODY_CRITICAL_INJURY_TABLE,
    );
    const injuryLink = card.locator(
      '.rollcard-critinjury-data a[data-action="displayInjury"]',
    );
    await expect(injuryLink).toBeVisible();
    await expect(injuryLink).toHaveText(/./);
    const injuryName = await injuryLink.innerText();

    sheetId = await closeAndReopenMookSheet(game, actorId);
    const listItem = game.locator(
      `#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`,
    );
    await expect(listItem).toHaveCount(1);
    await expect(listItem).toHaveText(injuryName);
  });

  test("repeated critical injury rolls add one injury per roll", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);
    const messagesBefore = await chatMessageCount(game);

    let dialog = await openCriticalInjuryRollDialog(game, sheetId);
    await confirmCriticalInjuryRoll(dialog, {
      table: BODY_CRITICAL_INJURY_TABLE,
    });
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(1, { timeout: 30000 });
    sheetId = await closeAndReopenMookSheet(game, actorId);
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(1);

    dialog = await openCriticalInjuryRollDialog(game, sheetId);
    await confirmCriticalInjuryRoll(dialog, {
      table: BODY_CRITICAL_INJURY_TABLE,
    });
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(2, { timeout: 30000 });
    sheetId = await closeAndReopenMookSheet(game, actorId);
    await expect(
      game.locator(`#${sheetId} ${MOOK_FIELD.criticalInjuryItem}`),
    ).toHaveCount(2);

    await expect
      .poll(() => chatMessageCount(game), { timeout: 30000 })
      .toBe(messagesBefore + 2);
  });
});
