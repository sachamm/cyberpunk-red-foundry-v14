import { test, expect } from "@playwright/test";
import {
  closeDocSheet,
  closeOwnedItemSheet,
  createItemViaUI,
  dismissNotifications,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openSidebarTab,
  setItemField,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  MOOK_FIELD,
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  confirmInstallCyberwareDialog,
  createMookViaUI,
  coreFoundationalId,
  installConsoleErrorHarness,
  openInstallCyberwareDialog,
  ownedItemIdsByNames,
  closeAndReopenMookSheet,
  waitForNewChatMessage,
  yesNoDialog,
  resolveYesNo,
  deleteKeyRemove,
  waitItemRemoved,
} from "./mook-sheet-helpers.mjs";

const GEAR_TYPES = ["ammo", "clothing", "gear", "netarch"];
const EQUIPPABLE_GEAR = new Set(["clothing", "gear"]);

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

    await test.step("the equippable types are auto-equipped on drop", async () => {
      for (const type of GEAR_TYPES) {
        if (!EQUIPPABLE_GEAR.has(type)) continue;
        await game.waitForFunction(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId)?.system?.equipped ===
            "equipped",
          { actorId, itemId: listed[type].embeddedId },
        );
      }
    });

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

    await test.step("the dragged cyberdeck is auto-equipped", async () => {
      await game.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId)?.system?.equipped ===
          "equipped",
        { actorId, itemId: deckEmbeddedId },
      );
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
      await game.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId)?.system?.equipped ===
          "equipped",
        { actorId, itemId: embeddedId },
      );

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
      const dialog = yesNoDialog(game);
      await expect(dialog).toBeVisible({ timeout: 10000 });
      return dialog;
    };

    await test.step("canceling the consumption confirmation does not consume the drug", async () => {
      const dialog = await openSnortDialog();
      await expect(dialog.locator(".cpr-dialog-message")).toContainText(
        itemName,
      );
      await resolveYesNo(dialog, "no");
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
      await resolveYesNo(dialog, "yes");
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

    await test.step("ctrl-clicking the name posts the item card to chat", async () => {
      const messagesBefore = await chatMessageCount(game);
      await game
        .locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
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
      await deleteKeyRemove(
        game,
        game.locator(
          `#${sheetId} ${MOOK_FIELD.specialGearItem}[data-item-id="${embeddedId}"]`,
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

  test.describe("Cyberware", () => {
    async function installFoundationalArm(game, { actorId }) {
      const name = uniqueName("cyberware");
      const itemId = await createItemViaUI(game, { type: "cyberware", name });
      await closeDocSheet(game, { collection: "items", id: itemId });
      const sheetId = await closeAndReopenMookSheet(game, actorId);

      const dialog = await openInstallCyberwareDialog(game, {
        itemId,
        sheetId,
        actorId,
      });
      await expect(dialog.locator('select[name="foundationalId"]')).toHaveCount(
        0,
      );
      await confirmInstallCyberwareDialog(dialog);

      const ids = await ownedItemIdsByNames(game, actorId, [name]);
      return { name, embeddedId: ids[name], sheetId };
    }

    async function installOptionalIntoCore(game, { actorId }) {
      const name = uniqueName("cyberware");
      const itemId = await createItemViaUI(game, { type: "cyberware", name });
      const itemSheetId = await expectSheetRendered(game, {
        collection: "items",
        id: itemId,
      });
      await setItemSelected(game, {
        sheetId: itemSheetId,
        itemId,
        name: "system.type",
        value: "cyberwareInternal",
      });
      await closeDocSheet(game, { collection: "items", id: itemId });
      const sheetId = await closeAndReopenMookSheet(game, actorId);

      const coreId = await coreFoundationalId(
        game,
        actorId,
        "cyberwareInternal",
      );
      expect(
        coreId,
        "the mook should ship with a seeded core Internal",
      ).toBeTruthy();

      const dialog = await openInstallCyberwareDialog(game, {
        itemId,
        sheetId,
        actorId,
      });
      const foundationalSelect = dialog.locator(
        'select[name="foundationalId"]',
      );
      await expect(foundationalSelect).toBeVisible();
      await expect(
        foundationalSelect.locator(`option[value="${coreId}"]`),
      ).toHaveCount(1);
      await foundationalSelect.selectOption(coreId);
      await confirmInstallCyberwareDialog(dialog);

      const ids = await ownedItemIdsByNames(game, actorId, [name]);
      return { name, embeddedId: ids[name], sheetId };
    }

    test("a foundational cyberarm installs directly on the mook and renders as a clickable link", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      let arm;

      await test.step("dragging the arm onto the mook installs it straight on the actor", async () => {
        arm = await installFoundationalArm(game, { actorId, sheetId });
        expect(
          arm.embeddedId,
          "the arm should be embedded on the mook",
        ).toBeTruthy();

        const isInstalled = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.isInstalled,
          { actorId, itemId: arm.embeddedId },
        );
        expect(isInstalled).toBe(true);
        const installedIn = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.installedIn,
          { actorId, itemId: arm.embeddedId },
        );
        expect(installedIn).toEqual([actorId]);
      });

      await test.step("a fresh render lists the arm as a clickable cyberware link", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        const link = game.locator(
          `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
        );
        await expect(link).toBeVisible();
        await expect(link).toContainText(arm.name);
      });
    });

    test("an internal optional installs into the seeded core and renders under its label", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const coreInternalId = await coreFoundationalId(
        game,
        actorId,
        "cyberwareInternal",
      );
      expect(
        coreInternalId,
        "the mook should ship with a seeded core Internal",
      ).toBeTruthy();

      let optional;
      await test.step("dragging the internal onto the mook installs it into the core Internal", async () => {
        optional = await installOptionalIntoCore(game, { actorId, sheetId });
        expect(optional.embeddedId).toBeTruthy();

        const installedIn = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.installedIn,
          { actorId, itemId: optional.embeddedId },
        );
        expect(installedIn).toEqual([coreInternalId]);
      });

      await test.step("a fresh render shows the core label with the optional in parentheses", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        const link = game.locator(
          `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${optional.embeddedId}"]`,
        );
        await expect(link).toBeVisible();
        await expect(link).toContainText(optional.name);
        await expect(link).toHaveAttribute(
          "data-foundational-id",
          coreInternalId,
        );
        const internalLabel = game
          .locator(`#${sheetId} .mook-special-content span.text-semi`)
          .filter({ hasText: "Internal" });
        await expect(internalLabel).toHaveCount(1);
      });
    });

    test("clicking a cyberware link opens its item sheet in read-only mode", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const arm = await installFoundationalArm(game, { actorId, sheetId });

      await test.step("a normal click on the link opens a non-editable item sheet", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await game
          .locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          )
          .click();

        const itemSheet = game.locator(".application .item-sheet");
        await expect(itemSheet).toBeVisible({ timeout: 10000 });

        const itemSheetId = await game.evaluate(
          ({ actorId, itemId }) => {
            const sheet = game.actors.get(actorId).items.get(itemId).sheet;
            return sheet.element?.id ?? null;
          },
          { actorId, itemId: arm.embeddedId },
        );
        expect(itemSheetId, "the item sheet should be rendered").toBeTruthy();

        await openItemSettings(game, itemSheetId);
        await expect(
          game.locator(`#${itemSheetId} select[name="system.type"]`),
        ).toHaveCount(0);
        const typeSpan = game
          .locator(`#${itemSheetId} .setting-value span.text-flex-end`)
          .first();
        await expect(typeSpan).toBeVisible();
      });

      await test.step("closing the read-only sheet leaves the mook unchanged", async () => {
        await closeOwnedItemSheet(game, { actorId, itemId: arm.embeddedId });
      });
    });

    test("ctrl-clicking a cyberware link posts its card to chat", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const arm = await installFoundationalArm(game, { actorId, sheetId });

      await test.step("ctrl-clicking the link posts an item card and opens no sheet", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        const messagesBefore = await chatMessageCount(game);
        await game
          .locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
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
        await expect(card.locator(".item-card-name")).toContainText(
          "cyberware",
        );

        await expect(game.locator(".application .item-sheet")).toHaveCount(0);
      });
    });

    test("shift-clicking an installed foundational uninstalls it", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const arm = await installFoundationalArm(game, { actorId, sheetId });

      await test.step("shift-clicking the link confirms and uninstalls the arm", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await game
          .locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          )
          .click({ modifiers: ["Shift"] });

        const confirmDialog = yesNoDialog(game);
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(
          confirmDialog.locator(".cpr-dialog-message"),
        ).toContainText(arm.name);
        await resolveYesNo(confirmDialog, "yes");
        await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

        const isInstalled = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.isInstalled,
          { actorId, itemId: arm.embeddedId },
        );
        expect(isInstalled).toBe(false);
      });

      await test.step("a fresh render no longer lists the uninstalled arm", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await expect(
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          ),
        ).toHaveCount(0);
      });
    });

    test("shift-clicking an installed optional uninstalls it from its core", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const coreInternalId = await coreFoundationalId(
        game,
        actorId,
        "cyberwareInternal",
      );
      expect(coreInternalId).toBeTruthy();
      const optional = await installOptionalIntoCore(game, {
        actorId,
        sheetId,
      });

      await test.step("shift-clicking the optional confirms and uninstalls it", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await game
          .locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${optional.embeddedId}"]`,
          )
          .click({ modifiers: ["Shift"] });

        const confirmDialog = yesNoDialog(game);
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(
          confirmDialog.locator(".cpr-dialog-message"),
        ).toContainText(optional.name);
        await resolveYesNo(confirmDialog, "yes");
        await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

        const isInstalled = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.isInstalled,
          { actorId, itemId: optional.embeddedId },
        );
        expect(isInstalled).toBe(false);
      });

      await test.step("a fresh render no longer shows the core label or the optional", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await expect(
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${optional.embeddedId}"]`,
          ),
        ).toHaveCount(0);
        const internalLabel = game
          .locator(`#${sheetId} .mook-special-content span.text-semi`)
          .filter({ hasText: "Internal" });
        await expect(internalLabel).toHaveCount(0);
      });
    });

    test("pressing Delete on a focused foundational removes it", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const arm = await installFoundationalArm(game, { actorId, sheetId });

      await test.step("focusing the link and pressing Delete removes the arm after confirmation", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await deleteKeyRemove(
          game,
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          ),
        );

        const confirmDialog = yesNoDialog(game);
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(
          confirmDialog.locator(".cpr-dialog-message"),
        ).toContainText(arm.name);
        await resolveYesNo(confirmDialog, "yes");
        await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

        const stillOwned = await game.evaluate(
          ({ actorId, itemId }) => game.actors.get(actorId).items.has(itemId),
          { actorId, itemId: arm.embeddedId },
        );
        expect(stillOwned, "the arm should be deleted from the mook").toBe(
          false,
        );
      });

      await test.step("a fresh render no longer lists the removed arm", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await expect(
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          ),
        ).toHaveCount(0);
      });
    });

    test("pressing Delete on a foundational holding an optional offers the container-delete dialog", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const arm = await installFoundationalArm(game, { actorId, sheetId });

      let optional;
      await test.step("installing a matching optional into the arm makes the arm a container", async () => {
        const name = uniqueName("cyberware");
        const itemId = await createItemViaUI(game, { type: "cyberware", name });
        const itemSheetId = await expectSheetRendered(game, {
          collection: "items",
          id: itemId,
        });
        await openItemSettings(game, itemSheetId);
        await game
          .locator(
            `#${itemSheetId} a.item-checkbox[data-target="system.isFoundational"]`,
          )
          .click();
        await game.waitForFunction(
          (id) => game.items.get(id).system.isFoundational === false,
          itemId,
          { timeout: 10000 },
        );
        await closeDocSheet(game, { collection: "items", id: itemId });
        sheetId = await closeAndReopenMookSheet(game, actorId);

        const dialog = await openInstallCyberwareDialog(game, {
          itemId,
          sheetId,
          actorId,
        });
        const foundationalSelect = dialog.locator(
          'select[name="foundationalId"]',
        );
        await expect(foundationalSelect).toBeVisible();
        await expect(
          foundationalSelect.locator(`option[value="${arm.embeddedId}"]`),
        ).toHaveCount(1);
        await foundationalSelect.selectOption(arm.embeddedId);
        await dialog
          .locator('select[name="humanityLossType"]')
          .selectOption("none");
        await dialog.locator(MOOK_FIELD.dialogConfirm).click();
        await expect(dialog).toHaveCount(0, { timeout: 10000 });

        const ids = await ownedItemIdsByNames(game, actorId, [name]);
        optional = { name, embeddedId: ids[name] };
        expect(optional.embeddedId).toBeTruthy();

        const installedIn = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId).system.installedIn,
          { actorId, itemId: optional.embeddedId },
        );
        expect(installedIn).toEqual([arm.embeddedId]);
      });

      await test.step("pressing Delete on the arm confirms removal then offers the container-delete dialog", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await deleteKeyRemove(
          game,
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          ),
        );

        const removeDialog = yesNoDialog(game);
        await expect(removeDialog).toBeVisible({ timeout: 10000 });
        await expect(removeDialog.locator(".cpr-dialog-message")).toContainText(
          arm.name,
        );
        await resolveYesNo(removeDialog, "yes");
        await expect(removeDialog).toHaveCount(0, { timeout: 10000 });

        const containerDialog = game.locator(".cpr-dialog").filter({
          has: game.locator('input[name="deleteInstalled"]'),
        });
        await expect(containerDialog).toBeVisible({ timeout: 10000 });
        await containerDialog.locator('input[name="deleteInstalled"]').check();
        await containerDialog.locator(MOOK_FIELD.dialogConfirm).click();
        await expect(containerDialog).toHaveCount(0, { timeout: 10000 });

        const remaining = await game.evaluate(
          ({ actorId, armId, optionalId }) => ({
            arm: game.actors.get(actorId).items.has(armId),
            optional: game.actors.get(actorId).items.has(optionalId),
          }),
          {
            actorId,
            armId: arm.embeddedId,
            optionalId: optional.embeddedId,
          },
        );
        expect(remaining.arm, "the arm should be deleted").toBe(false);
        expect(
          remaining.optional,
          "the nested optional should be deleted too",
        ).toBe(false);
      });

      await test.step("a fresh render lists neither the arm nor its former optional", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        await expect(
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${arm.embeddedId}"]`,
          ),
        ).toHaveCount(0);
        await expect(
          game.locator(
            `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${optional.embeddedId}"]`,
          ),
        ).toHaveCount(0);
      });
    });

    test("two optionals in one core render comma-separated", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);
      const first = await installOptionalIntoCore(game, { actorId, sheetId });
      const second = await installOptionalIntoCore(game, { actorId, sheetId });

      await test.step("a fresh render lists both optionals under the core label", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        const firstLink = game.locator(
          `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${first.embeddedId}"]`,
        );
        const secondLink = game.locator(
          `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${second.embeddedId}"]`,
        );
        await expect(firstLink).toBeVisible();
        await expect(secondLink).toBeVisible();
        const content = game.locator(`#${sheetId} .mook-special-content`);
        await expect(content).toContainText(first.name);
        await expect(content).toContainText(second.name);
      });
    });

    test("installing and removing non-core cyberware leaves the seeded cores intact", async ({
      page: game,
    }) => {
      let { actorId, sheetId } = await createMookViaUI(game);

      const readCores = () =>
        game.evaluate((id) => {
          const cores = game.actors
            .get(id)
            .itemTypes.cyberware.filter(
              (c) => c.system.core === true && c.system.isInstalled,
            );
          return cores
            .map((c) => ({ id: c.id, type: c.system.type }))
            .sort((a, b) => a.type.localeCompare(b.type));
        }, actorId);

      let baseline;
      await test.step("a fresh mook ships with three installed core foundationals", async () => {
        baseline = await readCores();
        expect(baseline).toHaveLength(3);
        expect(baseline.map((c) => c.type)).toEqual([
          "cyberwareExternal",
          "cyberwareInternal",
          "fashionware",
        ]);
      });

      const arm = await installFoundationalArm(game, { actorId, sheetId });
      const optional = await installOptionalIntoCore(game, {
        actorId,
        sheetId,
      });

      await test.step("uninstalling the non-core arm and optional removes only those", async () => {
        sheetId = await closeAndReopenMookSheet(game, actorId);
        for (const item of [arm, optional]) {
          await game
            .locator(
              `#${sheetId} ${MOOK_FIELD.cyberwareItem}[data-item-id="${item.embeddedId}"]`,
            )
            .click({ modifiers: ["Shift"] });

          const confirmDialog = yesNoDialog(game);
          await expect(confirmDialog).toBeVisible({ timeout: 10000 });
          await resolveYesNo(confirmDialog, "yes");
          await expect(confirmDialog).toHaveCount(0, { timeout: 10000 });

          sheetId = await closeAndReopenMookSheet(game, actorId);
        }
      });

      await test.step("the same three core foundationals are still installed afterwards", async () => {
        const after = await readCores();
        expect(after).toEqual(baseline);
      });
    });
  });
});
