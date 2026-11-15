import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  CTRL_CLICK_MODIFIERS,
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  closeOwnedItemSheet,
  createItemViaUI,
  deleteActorViaUI,
  deleteItemViaUI,
  expectSheetRendered,
  openItemSettings,
  openOwnedItemSheet,
  openSidebarTab,
  ownedItemIdByName,
  resolveYesNo,
  setItemField,
  toggleItemCheckbox,
  uniqueName,
  waitForNewChatMessage,
  yesNoDialog,
} from "../../../tools/playwright/ui/index.mjs";
import {
  CHARACTER_FIELD,
  chatRollCard,
  confirmInstallCyberwareDialog,
  createCharacterViaUI,
  cyberwareRow,
  embedWorldItemOnCharacterSheet,
  gearRow,
  installCyberwareDialog,
  installCyberwareGlyph,
  openCyberwareTab,
  openGearTab,
  openInstallCyberwareDialog,
} from "./character-sheet-helpers.mjs";

installConsoleErrorHarness();

const CYBERWARE_TYPE_LABEL_KEYS = [
  "CPR.global.cyberwareType.cyberAudioSuite",
  "CPR.global.cyberwareType.cyberEye",
  "CPR.global.cyberwareType.cyberArm",
  "CPR.global.cyberwareType.cyberLeg",
  "CPR.global.cyberwareType.neuralware",
  "CPR.global.cyberwareType.cyberwareInternal",
  "CPR.global.cyberwareType.cyberwareExternal",
  "CPR.global.cyberwareType.fashionware",
  "CPR.global.cyberwareType.borgware",
];

async function createWorldCyberware(
  page,
  { name, staticLoss = null, slots = null, optional = false },
) {
  const itemId = await createItemViaUI(page, { type: "cyberware", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  if (staticLoss !== null) {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.humanityLoss.static",
      path: "system.humanityLoss.static",
      value: staticLoss,
    });
  }
  if (slots !== null) {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.installedItems.slots",
      path: "system.installedItems.slots",
      value: slots,
    });
  }
  if (optional) {
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.isFoundational",
      expected: false,
    });
  }
  await closeDocSheet(page, { collection: "items", id: itemId });
  return { itemId, name };
}

test.describe("Character sheet Cyberware tab", () => {
  test("with no installed cyberware the tab shows one header per type and no rows", async ({
    page,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(page);
    try {
      const content = await openCyberwareTab(page, sheetId);

      const labels = await page.evaluate(
        (keys) => keys.map((k) => game.i18n.localize(k)),
        CYBERWARE_TYPE_LABEL_KEYS,
      );

      const headers = content.locator("li.items-header .item-name");
      expect(await headers.count()).toBe(CYBERWARE_TYPE_LABEL_KEYS.length);
      expect(
        (await headers.allTextContents()).map((t) => t.trim()).sort(),
      ).toEqual([...labels].sort());

      await expect(content.locator("li.item")).toHaveCount(0);
    } finally {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await deleteActorViaUI(page, actorId);
    }
  });

  test("installing foundational cyberware with static loss lowers humanity value and max and posts one roll card", async ({
    page,
  }) => {
    const { actorId, sheetId: initialSheet } = await createCharacterViaUI(page);
    const itemIds = [];
    try {
      const { itemId, name } = await createWorldCyberware(page, {
        name: uniqueName("cyberarm"),
        staticLoss: 2,
      });
      itemIds.push(itemId);

      const sheetId = await embedWorldItemOnCharacterSheet(page, {
        itemId,
        sheetId: initialSheet,
        actorId,
      });
      const ownedId = await ownedItemIdByName(page, actorId, name);
      expect(ownedId).toBeTruthy();

      const optionSlots = await page.evaluate(() =>
        game.i18n.localize("CPR.itemSheet.cyberware.optionalSlots"),
      );
      const cyberArmLabel = await page.evaluate(() =>
        game.i18n.localize("CPR.global.cyberwareType.cyberArm"),
      );

      await test.step("confirming the prompt with static loss posts one roll card for the static number", async () => {
        await openGearTab(page, sheetId);
        const dialog = await openInstallCyberwareDialog(page, {
          sheetId,
          itemId: ownedId,
        });
        await expect(
          dialog.locator('select[name="foundationalId"]'),
        ).toHaveCount(0);

        const messagesBefore = await chatMessageCount(page);
        await confirmInstallCyberwareDialog(dialog, { humanity: "static" });
        await expect
          .poll(() => chatMessageCount(page))
          .toBe(messagesBefore + 1);
        const messageId = await waitForNewChatMessage(page, messagesBefore, {
          requireRoll: true,
        });
        await openSidebarTab(page, "chat");
        const card = chatRollCard(page, messageId);
        await expect(card).toBeVisible();
        await expect(card.locator(".humanity-static-div")).toHaveText(
          await page.evaluate(() =>
            game.i18n.localize("CPR.chat.humanityLoss.static"),
          ),
        );
        await expect(card.locator(".d6-number-div span")).toHaveText("2");
      });

      await test.step("humanity value and max both drop by the static loss", async () => {
        await expect(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityValueInput}`),
        ).toHaveValue("58");
        await expect(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityMaxInput}`),
        ).toHaveValue("58");
      });

      await test.step("the installed row renders on the Cyberware tab with its option slots", async () => {
        await openCyberwareTab(page, sheetId);
        const row = cyberwareRow(page, sheetId, ownedId);
        await expect(row).toBeVisible();
        await expect(row.locator(".cyberware-data")).toHaveText(cyberArmLabel);
        await expect(row.locator("a.name.item-view")).toHaveText(
          new RegExp(`\\(0/3\\s*${optionSlots}\\)`),
        );
        await expect(
          page
            .locator(`#${sheetId} .tab.gear-tab[data-tab="gear"]`)
            .locator(`li.item[data-item-id="${ownedId}"]`),
        ).toHaveCount(0);
      });

      await test.step("the state survives a fresh render", async () => {
        const freshSheet = await closeAndReopenActorSheet(page, actorId);
        await openCyberwareTab(page, freshSheet);
        await expect(cyberwareRow(page, freshSheet, ownedId)).toBeVisible();
        await expect(
          page.locator(`#${freshSheet} ${CHARACTER_FIELD.humanityValueInput}`),
        ).toHaveValue("58");
        await expect(
          page.locator(`#${freshSheet} ${CHARACTER_FIELD.humanityMaxInput}`),
        ).toHaveValue("58");
      });
    } finally {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await deleteActorViaUI(page, actorId);
      for (const id of itemIds) await deleteItemViaUI(page, id);
    }
  });

  test("an optional cyberware installs into its foundational and renders nested under it", async ({
    page,
  }) => {
    const { actorId, sheetId: initialSheet } = await createCharacterViaUI(page);
    const itemIds = [];
    try {
      const found = await createWorldCyberware(page, {
        name: uniqueName("cyberarm"),
        slots: 2,
      });
      itemIds.push(found.itemId);
      const opt = await createWorldCyberware(page, {
        name: uniqueName("cyberarm option"),
        optional: true,
      });
      itemIds.push(opt.itemId);

      let sheetId = await embedWorldItemOnCharacterSheet(page, {
        itemId: found.itemId,
        sheetId: initialSheet,
        actorId,
      });
      const foundOwnedId = await ownedItemIdByName(page, actorId, found.name);
      expect(foundOwnedId).toBeTruthy();

      await test.step("the foundational installs into the character", async () => {
        await openGearTab(page, sheetId);
        const dialog = await openInstallCyberwareDialog(page, {
          sheetId,
          itemId: foundOwnedId,
        });
        await confirmInstallCyberwareDialog(dialog, { humanity: "none" });
      });

      sheetId = await embedWorldItemOnCharacterSheet(page, {
        itemId: opt.itemId,
        sheetId,
        actorId,
      });
      const optOwnedId = await ownedItemIdByName(page, actorId, opt.name);
      expect(optOwnedId).toBeTruthy();

      const optionSlots = await page.evaluate(() =>
        game.i18n.localize("CPR.itemSheet.cyberware.optionalSlots"),
      );

      await test.step("the install prompt offers the compatible foundational", async () => {
        await openGearTab(page, sheetId);
        const dialog = await openInstallCyberwareDialog(page, {
          sheetId,
          itemId: optOwnedId,
        });
        const foundationalSelect = dialog.locator(
          'select[name="foundationalId"]',
        );
        await expect(foundationalSelect).toHaveCount(1);
        await expect(foundationalSelect).toHaveValue(foundOwnedId);
        await confirmInstallCyberwareDialog(dialog, { humanity: "none" });
      });

      await test.step("the optional row nests under the foundational with one used slot", async () => {
        await openCyberwareTab(page, sheetId);
        const foundRow = cyberwareRow(page, sheetId, foundOwnedId);
        const optRow = cyberwareRow(page, sheetId, optOwnedId);
        await expect(foundRow).toBeVisible();
        await expect(optRow).toBeVisible();

        await expect(foundRow.locator("a.name.item-view")).toHaveText(
          new RegExp(`\\(1/2\\s*${optionSlots}\\)`),
        );
        await expect(optRow).toHaveAttribute(
          "data-installation-id",
          foundOwnedId,
        );
        await expect(optRow.locator("a.name.item-view")).toHaveAttribute(
          "style",
          "padding-left:1rem;",
        );
        await expect(foundRow.locator("a.name.item-view")).not.toHaveAttribute(
          "style",
        );
      });

      await test.step("the nesting survives a fresh render", async () => {
        const freshSheet = await closeAndReopenActorSheet(page, actorId);
        const optRow = cyberwareRow(page, freshSheet, optOwnedId);
        await expect(optRow).toBeVisible();
        await expect(optRow).toHaveAttribute(
          "data-installation-id",
          foundOwnedId,
        );
      });
    } finally {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await deleteActorViaUI(page, actorId);
      for (const id of itemIds) await deleteItemViaUI(page, id);
    }
  });

  test("installing an optional cyberware without a compatible foundational warns and leaves it on the gear tab", async ({
    page,
  }) => {
    const { actorId, sheetId: initialSheet } = await createCharacterViaUI(page);
    const itemIds = [];
    try {
      const { itemId, name } = await createWorldCyberware(page, {
        name: uniqueName("cyberarm option"),
        optional: true,
      });
      itemIds.push(itemId);

      const sheetId = await embedWorldItemOnCharacterSheet(page, {
        itemId,
        sheetId: initialSheet,
        actorId,
      });
      const ownedId = await ownedItemIdByName(page, actorId, name);
      expect(ownedId).toBeTruthy();

      const warningText = await page.evaluate(() =>
        game.i18n.localize(
          "CPR.messages.warnNoFoundationalCyberwareOfCorrectType",
        ),
      );

      await test.step("clicking the install glyph warns instead of opening a prompt", async () => {
        await openGearTab(page, sheetId);
        const glyph = installCyberwareGlyph(page, sheetId, ownedId);
        await expect(glyph).toBeVisible();
        await glyph.click();

        const warning = page
          .locator(".notification.warning")
          .filter({ hasText: warningText });
        await expect(warning).toBeVisible({ timeout: 10000 });
        await expect(installCyberwareDialog(page)).toHaveCount(0);
      });

      await test.step("the cyberware stays on the gear tab and is not installed", async () => {
        await expect(gearRow(page, sheetId, ownedId)).toBeVisible();
        await expect(cyberwareRow(page, sheetId, ownedId)).toHaveCount(0);
      });
    } finally {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await deleteActorViaUI(page, actorId);
      for (const id of itemIds) await deleteItemViaUI(page, id);
    }
  });

  test("uninstalling cyberware removes it from the tab, restores max humanity, and keeps the lost value", async ({
    page,
  }) => {
    const { actorId, sheetId: initialSheet } = await createCharacterViaUI(page);
    const itemIds = [];
    try {
      const { itemId, name } = await createWorldCyberware(page, {
        name: uniqueName("cyberarm"),
        staticLoss: 2,
      });
      itemIds.push(itemId);

      let sheetId = await embedWorldItemOnCharacterSheet(page, {
        itemId,
        sheetId: initialSheet,
        actorId,
      });
      const ownedId = await ownedItemIdByName(page, actorId, name);
      expect(ownedId).toBeTruthy();

      await openGearTab(page, sheetId);
      const installDialog = await openInstallCyberwareDialog(page, {
        sheetId,
        itemId: ownedId,
      });
      await confirmInstallCyberwareDialog(installDialog, {
        humanity: "static",
      });
      await expect(
        page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityValueInput}`),
      ).toHaveValue("58");

      const uninstallGlyph = () =>
        cyberwareRow(page, sheetId, ownedId).locator(
          'a.install-remove-cyberware[data-item-prop="system.isInstalled"]',
        );

      await test.step("declining the confirm dialog keeps the cyberware installed", async () => {
        await openCyberwareTab(page, sheetId);
        await expect(uninstallGlyph()).toBeVisible();
        await uninstallGlyph().click();

        const dialog = yesNoDialog(page);
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await expect(dialog.locator(".window-title")).toHaveText(
          await page.evaluate(() =>
            game.i18n.localize("CPR.dialog.uninstallCyberware.title"),
          ),
        );
        await expect(dialog.locator(".cpr-dialog-message")).toContainText(name);

        await resolveYesNo(dialog, "no");
        await expect(dialog).toHaveCount(0);
        await expect(cyberwareRow(page, sheetId, ownedId)).toBeVisible();
      });

      await test.step("confirming removes the row and restores max humanity but keeps the lost value", async () => {
        await uninstallGlyph().click();
        const dialog = yesNoDialog(page);
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await resolveYesNo(dialog, "yes");

        await expect(cyberwareRow(page, sheetId, ownedId)).toHaveCount(0);
        await expect(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityMaxInput}`),
        ).toHaveValue("60");
        await expect(
          page.locator(`#${sheetId} ${CHARACTER_FIELD.humanityValueInput}`),
        ).toHaveValue("58");

        await openGearTab(page, sheetId);
        await expect(gearRow(page, sheetId, ownedId)).toBeVisible();
        await expect(
          installCyberwareGlyph(page, sheetId, ownedId),
        ).toBeVisible();
      });

      await test.step("the state survives a fresh render", async () => {
        const freshSheet = await closeAndReopenActorSheet(page, actorId);
        await expect(
          page.locator(`#${freshSheet} ${CHARACTER_FIELD.humanityMaxInput}`),
        ).toHaveValue("60");
        await expect(
          page.locator(`#${freshSheet} ${CHARACTER_FIELD.humanityValueInput}`),
        ).toHaveValue("58");
        await openGearTab(page, freshSheet);
        await expect(gearRow(page, freshSheet, ownedId)).toBeVisible();
      });
    } finally {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await deleteActorViaUI(page, actorId);
      for (const id of itemIds) await deleteItemViaUI(page, id);
    }
  });

  test("clicking an installed cyberware's name opens its sheet read-only; ctrl-click posts a chat card", async ({
    page,
  }) => {
    const { actorId, sheetId: initialSheet } = await createCharacterViaUI(page);
    const itemIds = [];
    try {
      const { itemId, name } = await createWorldCyberware(page, {
        name: uniqueName("cyberarm"),
      });
      itemIds.push(itemId);

      const sheetId = await embedWorldItemOnCharacterSheet(page, {
        itemId,
        sheetId: initialSheet,
        actorId,
      });
      const ownedId = await ownedItemIdByName(page, actorId, name);
      expect(ownedId).toBeTruthy();

      await openGearTab(page, sheetId);
      const dialog = await openInstallCyberwareDialog(page, {
        sheetId,
        itemId: ownedId,
      });
      await confirmInstallCyberwareDialog(dialog, { humanity: "none" });

      await test.step("a plain click opens the item sheet read-only", async () => {
        await openCyberwareTab(page, sheetId);
        const row = cyberwareRow(page, sheetId, ownedId);
        await expect(row).toBeVisible();
        await row.locator("a.name.item-view").click();

        const itemSheetId = await openOwnedItemSheet(page, {
          actorId,
          itemId: ownedId,
        });
        expect(itemSheetId).toBeTruthy();
        const settings = await openItemSettings(page, itemSheetId);

        await expect(
          settings.locator('input[name="system.humanityLoss.static"]'),
        ).toHaveCount(0);
        await expect(
          settings.locator('select[name="system.type"]'),
        ).toHaveCount(0);
        await expect(settings.locator("a.item-checkbox")).toHaveCount(0);
        const cyberArmLabel = await page.evaluate(() =>
          game.i18n.localize("CPR.global.cyberwareType.cyberArm"),
        );
        const typeLabel = await page.evaluate(() =>
          game.i18n.localize("CPR.global.generic.type"),
        );
        const typeRow = settings.locator("li.item").filter({
          has: page.locator(".setting-name", {
            hasText: new RegExp(`^\\s*${typeLabel}\\s*$`),
          }),
        });
        await expect(typeRow.locator("span.text-flex-end")).toHaveText(
          cyberArmLabel,
        );

        await closeOwnedItemSheet(page, { actorId, itemId: ownedId });
      });

      await test.step("ctrl-click posts an item card to chat instead of opening the sheet", async () => {
        const messagesBefore = await chatMessageCount(page);
        await cyberwareRow(page, sheetId, ownedId)
          .locator("a.name.item-view")
          .click({ modifiers: CTRL_CLICK_MODIFIERS });

        const messageId = await waitForNewChatMessage(page, messagesBefore, {
          requireContent: true,
        });
        const cardName = await page.evaluate((id) => {
          const el = document.createElement("div");
          el.innerHTML = game.messages.get(id).content;
          return el.querySelector(".item-card-name")?.textContent?.trim();
        }, messageId);
        // RenderItemCard (src/modules/chat/cpr-chat.js) truncates names longer
        // than 16 chars to the first 15 plus an ellipsis.
        const expectedName = name.length > 16 ? `${name.slice(0, 15)}…` : name;
        expect(cardName).toBe(expectedName);
      });
    } finally {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await deleteActorViaUI(page, actorId);
      for (const id of itemIds) await deleteItemViaUI(page, id);
    }
  });
});
