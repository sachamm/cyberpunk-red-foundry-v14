import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  closeOwnedItemSheet,
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
  installConsoleErrorHarness,
  ownedItemIdsByNames,
  closeAndReopenMookSheet,
  waitForNewChatMessage,
} from "./mook-sheet-helpers.mjs";

const GEAR_TYPES = ["ammo", "clothing", "gear", "netarch"];

installConsoleErrorHarness();

test.describe("Special Gear Pane", () => {
  test("dragging plain gear types onto a mook lists each of them in the special gear pane", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const listed = {};
    for (const type of GEAR_TYPES) {
      await test.step(`dragging a ${type} onto the mook embeds it`, async () => {
        const itemName = uniqueName(type);
        const itemId = await createItemViaUI(game, { type, name: itemName });
        await closeDocSheet(game, { collection: "items", id: itemId });
        await dragItemToActorSheet(game, { itemId, sheetId, actorId });
        const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
        listed[type] = { name: itemName, embeddedId: ids[itemName] };
        expect(
          listed[type].embeddedId,
          `the ${type} should be embedded on the mook`,
        ).toBeTruthy();
      });
    }

    await test.step("every type's name appears in the special gear pane on a fresh render", async () => {
      sheetId = await closeAndReopenMookSheet(game, actorId);
      for (const type of GEAR_TYPES) {
        const link = game.locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${listed[type].embeddedId}"]`,
        );
        await expect(link).toBeVisible();
        await expect(link).toHaveText(listed[type].name);
      }
    });
  });

  test("only allowed item types are listed in the special gear pane", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const deckName = uniqueName("cyberdeck");
    const programName = uniqueName("program");
    const deckId = await createItemViaUI(game, {
      type: "cyberdeck",
      name: deckName,
    });
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
      const ids = await ownedItemIdsByNames(game, actorId, [
        deckName,
        programName,
      ]);
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

  test("an item upgrade lists in the special gear pane with an install glyph", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const itemName = uniqueName("itemUpgrade");
    const itemId = await createItemViaUI(game, {
      type: "itemUpgrade",
      name: itemName,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    let embeddedId;
    await test.step("dragging the upgrade onto the mook lists it with an install glyph", async () => {
      await dragItemToActorSheet(game, { itemId, sheetId, actorId });
      const ids = await ownedItemIdsByNames(game, actorId, [itemName]);
      embeddedId = ids[itemName];
      expect(
        embeddedId,
        "the upgrade should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
      const link = game.locator(
        `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
      );
      await expect(link).toBeVisible();
      await expect(link).toHaveText(itemName);

      const glyph = game.locator(
        `#${sheetId} ${MOOK_FIELD.upgradeInstallAction}[data-item-id="${embeddedId}"]`,
      );
      await expect(glyph).toBeVisible();
      await expect(glyph.locator("i.fa-right-to-bracket")).toHaveCount(1);
    });

    await test.step("clicking the glyph with no compatible target offers nothing to install into", async () => {
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.upgradeInstallAction}[data-item-id="${embeddedId}"]`,
        )
        .click();

      const dialog = game.locator(".cpr-dialog").filter({
        hasText: "can be installed into",
      });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await expect(dialog).toContainText(itemName);
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 10000 });

      const isInstalled = await game.evaluate(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.isInstalled,
        { actorId, itemId: embeddedId },
      );
      expect(isInstalled).toBe(false);
    });

    await test.step("clicking the name opens the upgrade's editable item sheet", async () => {
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
        )
        .click();
      await expect(game.locator(".application .item-sheet")).toBeVisible({
        timeout: 10000,
      });
      await closeOwnedItemSheet(game, { actorId, itemId: embeddedId });
    });
  });

  test("the install glyph installs the upgrade into the selected weapon and back out again", async ({
    page: game,
  }) => {
    let { actorId, sheetId } = await createMookViaUI(game);

    const weaponName = uniqueName("weapon");
    const upgradeName = uniqueName("itemUpgrade");
    const weaponId = await createItemViaUI(game, {
      type: "weapon",
      name: weaponName,
    });
    const upgradeId = await createItemViaUI(game, {
      type: "itemUpgrade",
      name: upgradeName,
    });
    await closeDocSheet(game, { collection: "items", id: weaponId });
    await closeDocSheet(game, { collection: "items", id: upgradeId });

    let weaponEmbeddedId;
    let upgradeEmbeddedId;
    await test.step("dragging a weapon and an upgrade onto the mook embeds both", async () => {
      await dragItemToActorSheet(game, { itemId: weaponId, sheetId, actorId });
      await dragItemToActorSheet(game, { itemId: upgradeId, sheetId, actorId });
      const ids = await ownedItemIdsByNames(game, actorId, [
        weaponName,
        upgradeName,
      ]);
      weaponEmbeddedId = ids[weaponName];
      upgradeEmbeddedId = ids[upgradeName];
      expect(
        weaponEmbeddedId && upgradeEmbeddedId,
        "both items should be embedded on the mook",
      ).toBeTruthy();

      sheetId = await closeAndReopenMookSheet(game, actorId);
    });

    const installGlyph = game.locator(
      `#${sheetId} ${MOOK_FIELD.upgradeInstallAction}[data-item-id="${upgradeEmbeddedId}"]`,
    );

    await test.step("clicking the install glyph installs the upgrade into the selected weapon", async () => {
      await installGlyph.click();

      const dialog = game.locator(".cpr-dialog").filter({
        has: game.locator('input[name="selectedTarget"]'),
      });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      // The header names the upgrade; the weapon row offers a target radio and
      // its available slots.
      await expect(dialog).toContainText(upgradeName);
      const weaponRow = dialog
        .locator(".dialog-item")
        .filter({ hasText: weaponName });
      await expect(weaponRow).toBeVisible();
      await expect(weaponRow).toContainText("3/3");
      await weaponRow.locator('input[name="selectedTarget"]').check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 10000 });

      await game.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.isInstalled ===
          true,
        { actorId, itemId: upgradeEmbeddedId },
        { timeout: 10000 },
      );
      const installedIn = await game.evaluate(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.installedItems.list,
        { actorId, itemId: weaponEmbeddedId },
      );
      expect(installedIn).toContain(upgradeEmbeddedId);

      // On a fresh render the glyph flips to its active uninstall variant.
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const uninstallGlyph = game.locator(
        `#${sheetId} ${MOOK_FIELD.upgradeUninstallAction}[data-item-id="${upgradeEmbeddedId}"]`,
      );
      await expect(uninstallGlyph).toBeVisible();
      await expect(uninstallGlyph).toHaveClass(/button-active/);
      await expect(
        uninstallGlyph.locator("i.fa-arrow-right-from-bracket"),
      ).toHaveCount(1);
    });

    await test.step("clicking the uninstall glyph removes the upgrade from the weapon again", async () => {
      const uninstallGlyph = game.locator(
        `#${sheetId} ${MOOK_FIELD.upgradeUninstallAction}[data-item-id="${upgradeEmbeddedId}"]`,
      );
      await uninstallGlyph.click();

      const dialog = game.locator(".cpr-dialog").filter({
        has: game.locator('input[name="selectedItems"]'),
      });
      await expect(dialog).toBeVisible({ timeout: 10000 });
      // The weapon is the only container the upgrade is installed in, and its
      // row comes pre-checked.
      const weaponRow = dialog
        .locator(".dialog-item")
        .filter({ hasText: weaponName });
      await expect(weaponRow).toBeVisible();
      await expect(
        weaponRow.locator('input[name="selectedItems"]'),
      ).toBeChecked();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0, { timeout: 10000 });

      await game.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.isInstalled ===
          false,
        { actorId, itemId: upgradeEmbeddedId },
        { timeout: 10000 },
      );

      // On a fresh render the plain install glyph is back.
      sheetId = await closeAndReopenMookSheet(game, actorId);
      const glyph = game.locator(
        `#${sheetId} ${MOOK_FIELD.upgradeInstallAction}[data-item-id="${upgradeEmbeddedId}"]`,
      );
      await expect(glyph).toBeVisible();
      await expect(glyph).not.toHaveClass(/button-active/);
    });
  });
});
