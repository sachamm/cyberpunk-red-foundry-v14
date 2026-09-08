import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createItemViaUI,
  dismissNotifications,
  dragItemToActorSheet,
  expectSheetRendered,
  openSidebarTab,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  chatMessageCount,
  createMookViaUI,
  ownedItemIdsByNames,
  closeAndReopenMookSheet,
  waitForNewChatMessage,
} from "./mook-sheet-helpers.mjs";

/*
 * Special Gear Pane — basic item types, drugs, and name-link actions. The pane
 * lists every owned item of the types ammo/clothing/cyberdeck/drug/gear/
 * itemUpgrade/netarch as a plain name link (cyberware renders separately above
 * them); other types, such as programs, are embedded but never listed —
 * programs are managed on the cyberdeck's item sheet. Stackable items show an
 * "(xN)" amount after their name; drug items
 * additionally render a snort glyph that consumes one dose behind a yes/no
 * confirmation. Note the confirm path posts a transient notification banner
 * ("<name> consumed..."), not a chat card — snort() calls DisplayMessage(
 * "notify", ...). Ctrl-clicking a name link posts the item card to chat;
 * focusing a name link and pressing Delete removes the item behind the delete
 * confirmation (the deleteItemConfirmation setting defaults on). Item upgrades
 * and cyberware behaviors come in later batches.
 */

const GEAR_TYPES = ["ammo", "clothing", "gear", "netarch"];

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Special Gear Pane", () => {
  for (const type of GEAR_TYPES) {
    test(`dragging a ${type} onto a mook lists it in the special gear pane`, async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);

      const itemName = uniqueName(type);
      const itemId = await createItemViaUI(game, { type, name: itemName });
      // Close the item's sheet so it does not cover the drop target.
      await closeDocSheet(game, { collection: "items", id: itemId });

      let embeddedId;
      await test.step(`dragging the ${type} onto the mook embeds it`, async () => {
        await dragItemToActorSheet(game, { itemId, sheetId, actorId });
        const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
        embeddedId = ids[itemName];
        expect(
          embeddedId,
          `the ${type} should be embedded on the mook`,
        ).toBeTruthy();
      });

      await test.step(`the ${type}'s name appears in the special gear pane on a fresh render`, async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        const link = game.locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
        );
        await expect(link).toBeVisible();
        await expect(link).toHaveText(itemName);
      });
    });
  }

  test("only allowed item types are listed in the special gear pane", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const deckName = uniqueName("cyberdeck");
    const programName = uniqueName("program");
    const deckId = await createItemViaUI(game, { type: "cyberdeck", name: deckName });
    const programId = await createItemViaUI(game, {
      type: "program",
      name: programName,
    });
    // Close the items' sheets so they do not cover the drop target.
    await closeDocSheet(game, { collection: "items", id: deckId });
    await closeDocSheet(game, { collection: "items", id: programId });

    let deckEmbeddedId;
    let programEmbeddedId;
    await test.step("dragging a cyberdeck and a program onto the mook embeds both", async () => {
      await dragItemToActorSheet(game, { itemId: deckId, sheetId, actorId });
      await dragItemToActorSheet(game, { itemId: programId, sheetId, actorId });
      const ids = await ownedItemIdsByNames(game, actorId, [deckName, programName]);
      deckEmbeddedId = ids[deckName];
      programEmbeddedId = ids[programName];
      expect(
        deckEmbeddedId && programEmbeddedId,
        "both items should be embedded on the mook",
      ).toBeTruthy();
    });

    await test.step("the cyberdeck is listed but the program is not", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const deckLink = game.locator(
        `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${deckEmbeddedId}"]`,
      );
      await expect(deckLink).toBeVisible();
      await expect(deckLink).toHaveText(deckName);

      // Programs are managed on the cyberdeck's item sheet, not the mook sheet:
      // no name link for the program, and its name nowhere in the pane.
      await expect(
        game.locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${programEmbeddedId}"]`,
        ),
      ).toHaveCount(0);
      await expect(
        game.locator(`#${sheetId} .mook-special-content`),
      ).not.toContainText(programName);
    });
  });

  test("consuming a drug via the snort icon decrements its amount by one", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("drug");
    const itemId = await createItemViaUI(game, {
      type: "drug",
      name: itemName,
    });
    const itemSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: itemId,
    });
    await setItemField(game, {
      sheetId: itemSheetId,
      itemId,
      name: "system.amount",
      path: "system.amount",
      value: 3,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    let embeddedId;
    await test.step("dragging the drug onto the mook lists it with its amount", async () => {
      await dragItemToActorSheet(game, { itemId, sheetId, actorId });
      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      embeddedId = ids[itemName];
      expect(
        embeddedId,
        "the drug should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
      await expect(link).toHaveText(itemName);
      await expect(
        game.locator(`#${sheetId} .mook-special-content`),
      ).toContainText("(x3)");
    });

    const chatBefore = await chatMessageCount(game);

    // Click the drug's snort glyph and wait for the consumption confirmation.
    const openSnortDialog = async () => {
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.snortAction}[data-item-id="${embeddedId}"]`,
        )
        .click();
      const dialog = game.locator(".cpr-dialog").filter({
        has: game.locator(".cpr-dialog-message"),
      });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      return dialog;
    };

    await test.step("canceling the consumption confirmation does not consume the drug", async () => {
      const dialog = await openSnortDialog();
      await expect(dialog.locator(".cpr-dialog-message")).toContainText(
        itemName,
      );
      await dialog.locator('button[data-action="no"]').click();
      await expect(dialog).toHaveCount(0, { timeout: 10000 });

      await expect(game.locator(".notification.info")).toHaveCount(0);
      expect(await chatMessageCount(game)).toBe(chatBefore);

      sheetId = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(`#${sheetId} .mook-special-content`),
      ).toContainText("(x3)");
    });

    await test.step("confirming the consumption confirmation consumes one dose", async () => {
      const dialog = await openSnortDialog();
      await dialog.locator('button[data-action="yes"]').click();
      await expect(dialog).toHaveCount(0, { timeout: 10000 });

      const banner = game
        .locator(".notification.info")
        .filter({ hasText: "consumed. Make it count!" });
      await expect(banner).toBeVisible();
      await dismissNotifications(game);

      expect(await chatMessageCount(game)).toBe(chatBefore);

      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
      await expect(
        game.locator(`#${sheetId} .mook-special-content`),
      ).toContainText("(x2)");
      const amount = await game.evaluate(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.amount,
        { actorId, itemId: embeddedId },
      );
      expect(amount).toBe(2);
    });
  });

  test("ctrl-clicking a listed item posts its card to chat", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("gear");
    const itemId = await createItemViaUI(game, {
      type: "gear",
      name: itemName,
    });
    // Close the item's sheet so it does not cover the drop target.
    await closeDocSheet(game, { collection: "items", id: itemId });

    let embeddedId;
    await test.step("dragging the gear onto the mook lists it in the special gear pane", async () => {
      await dragItemToActorSheet(game, { itemId, sheetId, actorId });
      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      embeddedId = ids[itemName];
      expect(
        embeddedId,
        "the gear should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
    });

    // macOS Chromium treats Ctrl+click as a right-click (context menu) and never
    // dispatches `click`, so use Cmd there. The handler accepts both ctrlKey/metaKey.
    const cardModifier = process.platform === "darwin" ? ["Meta"] : ["Control"];

    await test.step("ctrl-clicking the name posts the item card to chat", async () => {
      const messagesBefore = await chatMessageCount(game);
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
        )
        .click({ modifiers: cardModifier });

      const messageId = await waitForNewChatMessage(game, messagesBefore, {
        requireContent: true,
      });

      await openSidebarTab(game, "chat");
      const card = game
        .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
        .locator(".item-card-grid-container");
      await expect(card).toBeVisible({ timeout: 10000 });
      // The card truncates names over 16 characters, so match the type word
      // ("E2E gear ...") instead of the full unique name.
      await expect(card.locator(".item-card-name")).toContainText(
        itemName.split(" ")[1],
      );
    });

    await test.step("ctrl-click does not open the item sheet", async () => {
      await expect(game.locator(".application .item-sheet")).toHaveCount(0);
    });
  });

  test("pressing Delete while focused on a listed item removes it", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("gear");
    const itemId = await createItemViaUI(game, {
      type: "gear",
      name: itemName,
    });
    // Close the item's sheet so it does not cover the drop target.
    await closeDocSheet(game, { collection: "items", id: itemId });

    let embeddedId;
    await test.step("dragging the gear onto the mook lists it in the special gear pane", async () => {
      await dragItemToActorSheet(game, { itemId, sheetId, actorId });
      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      embeddedId = ids[itemName];
      expect(
        embeddedId,
        "the gear should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
    });

    await test.step("focusing the name and pressing Delete removes it after confirmation", async () => {
      // "changeable" elements focus on hover in the sheet; focusing directly is
      // the deterministic equivalent for the keydown handler.
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
        )
        .focus();
      await game.keyboard.press("Delete");

      const confirmDialog = game.locator(".cpr-dialog").filter({
        has: game.locator(".cpr-dialog-message"),
      });
      await expect(confirmDialog).toBeVisible({ timeout: 10000 });
      await expect(confirmDialog.locator(".cpr-dialog-message")).toContainText(
        itemName,
      );
      await confirmDialog.locator('button[data-action="yes"]').click();
      await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

      await game.waitForFunction(
        ({ actorId, itemId }) => !game.actors.get(actorId).items.has(itemId),
        { actorId, itemId: embeddedId },
        { timeout: 10000 },
      );

      const freshSheet = await closeAndReopenMookSheet(game, actorId);
      await expect(
        game.locator(
          `#${freshSheet} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
        ),
      ).toHaveCount(0);
    });
  });
});
