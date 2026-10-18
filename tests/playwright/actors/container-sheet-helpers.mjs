import { expect } from "@playwright/test";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  applyLedgerChange,
  closeDocSheet,
  closeLedgerWindow,
  createDocumentViaUI,
  createInventoryItemViaUI,
  expectSheetRendered,
  hoverGearRow,
  openLedgerWindow,
  reopenActorSheetViaUI,
  sheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

export const FIELD = {
  name: 'input[name="name"]',
  tradeWith: 'select[name="trade-with-dropdown"]',
  eurobucksValue: ".eurobucks-value",
  eurobucksNA: ".eurobucks-value span[data-tooltip]",
  ledgerButton: ".eurobucks-open-ledger",
  containerTypeDropdown: "select.container-type-dropdown",
  flagCheckbox: (name) => `.checkbox-toggle[data-flag-name="${name}"]`,
  vendorConfigureLink: ".vendor-configure-sell-to",
  imageBlock: ".image-block img",
  gmSettings: ".settings-gm-section",
  createButton: ".item-create",
  createButtonByType: (type) => `.item-create[data-item-type="${type}"]`,
  categoryHeader: ".items-header.collapsible",
  expandButton: ".expand-button",
  collapseIcon: ".collapse-icon",
  expandIcon: ".expand-icon",
  itemName: ".item-edit",
  itemAmount: ".item.flexrow .item-detail",
  itemPrice: ".gear-data",
  purchaseAll: 'a.item-action[data-action-type="purchase"]',
  purchasePart: 'a.item-action[data-action-type="purchaseFraction"]',
  takeItemAll: 'a.item-action[data-action-type="purchase"]',
  takeItemPart: 'a.item-action[data-action-type="purchaseFraction"]',
  deleteItem: 'a.item-action[data-action-type="delete"]',
  toggleInstalled: ".toggle-installed-visibility",
};

/**
 * Convenience function to generate a container actor with an item in its inventory.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} containerName - base name for the container actor (made unique)
 * @param {String} itemType - type of the item created in the container's inventory
 * @param {String} itemName - (optional) name for the item; defaults to "New {Type}"
 * @returns {Object} - an object with an actorId, sheetId, and itemId
 */
export async function createContainerWithItem(
  game,
  { containerName, itemType, itemName },
) {
  const actorId = await createDocumentViaUI(game, {
    documentTab: "actors",
    type: "container",
    name: uniqueName(containerName),
  });

  const sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });

  const { itemId, sheetId: freshSheetId } = await createInventoryItemViaUI(
    game,
    { actorId, sheetId, itemType, itemName },
  );

  return { actorId, sheetId: freshSheetId, itemId };
}

/**
 * Similar to createContainerWithItem but sets the type to stash after
 * creating the actor and item.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} stashName - base name for the stash (made unique)
 * @param {String} itemName - (optional) name for the item; defaults to "New {Type}"
 * @returns {Object} - an object with an actorId and sheetId
 */
export async function createStashWithItem(game, { stashName, itemName }) {
  const { actorId } = await createContainerWithItem(game, {
    containerName: stashName,
    itemType: "gear",
    itemName,
  });

  const sheetId = await setContainerTypeViaUI(game, actorId, "stash");

  return { actorId, sheetId };
}

/**
 * Set a container actor's type through the GM settings dropdown on its
 * sheet, waiting for the flag to land on the actor.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} actorId - id of the container actor
 * @param {String} type - one of "shop", "loot", "stash", or "custom"
 * @returns {Promise<String>} the rendered sheet element id
 */
export async function setContainerTypeViaUI(game, actorId, type) {
  await game.evaluate(({ id }) => game.actors.get(id).sheet.render(true), {
    id: actorId,
  });
  const sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });
  await sheet(game, sheetId)
    .locator(FIELD.containerTypeDropdown)
    .selectOption({ value: type });
  await game.waitForFunction(
    ({ actorId, type }) => {
      const actor = game.actors.get(actorId);
      return actor?.getFlag(game.system.id, "container-type") === type;
    },
    { actorId, type },
    { timeout: 5000 },
  );
  return sheetId;
}

/**
 * Set an actor's eurobucks wealth through the ledger window: open the actor
 * sheet, open its eurobucks ledger, type the value, and click "set". The
 * ledger window is closed again afterwards. Works for any actor whose sheet
 * exposes the ledger button (characters and containers).
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} actorId - id of the actor
 * @param {Number} value - wealth value to set
 */
export async function setActorWealthViaUI(game, actorId, value) {
  const sheetId = await reopenActorSheetViaUI(game, actorId);
  await openLedgerWindow(game, sheetId, FIELD.ledgerButton);
  await applyLedgerChange(
    game,
    actorId,
    "system.wealth.value",
    "set",
    value,
    "Test setup",
  );
  await closeLedgerWindow(game);
}

/**
 * Enable a container settings flag through the checkbox in the GM section of
 * the container sheet (e.g. "infinite-stock", "items-free", "players-create").
 * Checkboxes only render for certain container types - "custom" shows all of
 * them, while "shop" and unset containers only show "infinite-stock" - so the
 * caller must have set the type first. No-ops when the flag is already on.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} actorId - id of the container actor
 * @param {String} flagName - value of the checkbox's data-flag-name attribute
 */
export async function setContainerFlagViaUI(game, actorId, flagName) {
  const isOn = await game.evaluate(
    ({ id, flag }) => game.actors.get(id)?.getFlag(game.system.id, flag),
    { id: actorId, flag: flagName },
  );
  if (isOn === true) return;

  await game.evaluate(({ id }) => game.actors.get(id).sheet.render(true), {
    id: actorId,
  });
  const sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });
  const toggle = sheet(game, sheetId).locator(FIELD.flagCheckbox(flagName));
  await expect(toggle).toBeVisible();
  await toggle.click();

  await game.waitForFunction(
    ({ id, flag }) =>
      game.actors.get(id)?.getFlag(game.system.id, flag) === true,
    { id: actorId, flag: flagName },
    { timeout: 5000 },
  );
}

/**
 * Configure which item types a container buys and at what percentage of
 * market price through the sheet's "Configure Shop" prompt (the shop link on
 * shop containers, or the wrench next to "Sell items?" on custom containers).
 * Opens the prompt, sets one item type's purchase percentage (ensuring its
 * purchasing checkbox is enabled), confirms, and waits for the value to land
 * on the actor. Other item types keep their current values.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} actorId - id of the container actor (sheet must be rendered)
 * @param {Object} options
 * @param {String} options.itemType - item type to configure (e.g. "gear")
 * @param {Number} [options.purchasePercentage=100] - percentage of market price paid when buying
 */
export async function configureContainerVendorViaUI(
  game,
  actorId,
  { itemType, purchasePercentage = 100 },
) {
  const sheetId = await expectSheetRendered(game, {
    collection: "actors",
    id: actorId,
  });
  const configureLink = sheet(game, sheetId).locator(FIELD.vendorConfigureLink);
  await expect(configureLink).toBeVisible();
  await configureLink.click();

  const percentInput = `input[name="currentConfig.itemTypes.${itemType}.purchasePercentage"]`;
  const dialog = game
    .locator(".dialog")
    .filter({ has: game.locator(percentInput) })
    .first();
  await expect(dialog).toBeVisible();
  await dialog.locator(percentInput).fill(String(purchasePercentage));
  const buyCheckbox = dialog.locator(
    `input[name="currentConfig.itemTypes.${itemType}.isPurchasing"]`,
  );
  if (!(await buyCheckbox.isChecked())) await buyCheckbox.check();
  await dialog.locator('button[data-action="confirm"]').click();

  await game.waitForFunction(
    ({ actorId, itemType, purchasePercentage }) => {
      const actor = game.actors.get(actorId);
      const value =
        actor?.system?.vendor?.itemTypes?.[itemType]?.purchasePercentage;
      return Number(value) === purchasePercentage;
    },
    { actorId, itemType, purchasePercentage },
    { timeout: 5000 },
  );
}

/**
 * Select a trade partner on a container sheet and give them a known amount of
 * wealth through the ledger window on their character sheet. The partner's
 * sheet is closed again afterwards so the container sheet stays clickable.
 * When `partnerName` is omitted, the first selectable partner is used.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} sheetId - rendered element id of the container actor's sheet
 * @param {Object} [options]
 * @param {String} [options.partnerName] - name of the trade partner to select
 * @param {Number} [options.wealth=999999] - wealth value to set on the selected trade partner
 * @returns {Promise<String>} the id of the selected trade partner
 */
export async function setTradePartnerWithWealth(
  game,
  sheetId,
  { partnerName = null, wealth = 999999 } = {},
) {
  const containerSheet = sheet(game, sheetId);

  const tradeDropdown = containerSheet.locator(FIELD.tradeWith);
  await expect(tradeDropdown).toBeVisible();

  const options = await tradeDropdown.evaluate((el) =>
    Array.from(el.options).map((o) => ({
      value: o.value,
      name: o.textContent.trim(),
    })),
  );

  let tradePartnerId;
  if (partnerName) {
    tradePartnerId = options.find((o) => o.name === partnerName)?.value;
    expect(
      tradePartnerId,
      `expected the container sheet to offer a trade partner named "${partnerName}"`,
    ).toBeTruthy();
  } else {
    tradePartnerId = options.find((o) => o.value !== "")?.value;
    expect(
      tradePartnerId,
      "expected the container sheet to offer a trade partner",
    ).toBeTruthy();
  }

  await tradeDropdown.selectOption({ value: tradePartnerId });

  // Trade partners are always characters (the dropdown only lists owned
  // characters), so their sheet exposes the eurobucks ledger button. The
  // ledger flow opens the partner's sheet on top of the container sheet, so
  // close it again to keep the container sheet clickable for the caller.
  await setActorWealthViaUI(game, tradePartnerId, wealth);
  await closeDocSheet(game, { collection: "actors", id: tradePartnerId });

  return tradePartnerId;
}

/**
 * Click the equip action on an owned item's gear row until the item is
 * equipped, stepping through the carried state first.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} actorSheetId - rendered element id of the actor's sheet
 * @param {String} actorId - id of the actor owning the item
 * @param {String} itemId - id of the owned item to equip
 */
export async function equipWeapon(game, { actorSheetId, actorId, itemId }) {
  for (const state of ["carried", "equipped"]) {
    const gear = await activateGearTab(game, actorSheetId);
    const row = await hoverGearRow(gear, itemId);
    await row.locator("a.equip").click();
    await game.waitForFunction(
      ({ actorId, itemId, state }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped === state,
      { actorId, itemId, state },
      { timeout: 10000 },
    );
  }
}

/**
 * Click the purchase-fraction action on a named item row of a container
 * sheet and confirm the prompt with a specific amount.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} sheetId - rendered element id of the container sheet
 * @param {String} itemName - name of the item row to purchase part of
 * @param {Number} [amount=1] - amount to enter in the purchase prompt
 */
export async function purchasePartViaUI(game, sheetId, itemName, amount = 1) {
  const containerSheet = sheet(game, sheetId);
  const itemRow = containerSheet
    .locator(".item.flexrow")
    .filter({ hasText: itemName });
  await expect(itemRow).toBeVisible();

  const purchasePartLink = itemRow.locator(FIELD.purchasePart);
  await expect(purchasePartLink).toBeVisible();
  await purchasePartLink.click();

  const dialog = game.locator(".dialog, .application.dialog");
  await expect(dialog).toBeVisible();
  const amountInput = dialog.locator('input[name="purchaseAmount"]');
  await expect(amountInput).toBeVisible();
  await amountInput.fill(String(amount));
  const confirmBtn = dialog.locator('button[data-action="confirm"]');
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();
  await expect(dialog).not.toBeVisible();
}

/**
 * Click the purchase-all action on a named item row of a container sheet.
 * The same control is rendered as "take" on loot/stash sheets.
 *
 * @param {Object} game - the top-level game object from Foundry
 * @param {String} sheetId - rendered element id of the container sheet
 * @param {String} itemName - name of the item row to purchase
 */
export async function purchaseAllViaUI(game, sheetId, itemName) {
  const containerSheet = sheet(game, sheetId);
  const itemRow = containerSheet
    .locator(".item.flexrow")
    .filter({ hasText: itemName });
  await expect(itemRow).toBeVisible();

  const purchaseLink = itemRow.locator(FIELD.purchaseAll);
  await expect(purchaseLink).toBeVisible();
  await purchaseLink.click();
}

/**
 * Sell an item from a character's inventory to a container by dragging it onto
 * the container sheet as a player. GM drags copy items into the container
 * instead of selling (cpr-container-sheet.js only routes non-GM drops to the
 * vendor flow), so this grants "E2E Player" ownership of both actors, switches
 * the container to custom type when needed and enables its players-sell flag
 * through the sheet's "Sell items?" checkbox, opens a player page, drags the
 * item row from the character's gear tab onto the container sheet, and
 * confirms the "Selling to vendor" offer dialog.
 *
 * @param {Object} game - GM page fixture
 * @param {Object} browser - Playwright browser fixture
 * @param {String} baseURL - Foundry base URL fixture
 * @param {String} containerActorId - id of the container (shop) actor
 * @param {String} characterActorId - id of the character selling the item
 * @param {String} itemId - id of the owned item to sell
 */
export async function sellItemToContainerViaUI(
  game,
  browser,
  baseURL,
  { containerActorId, characterActorId, itemId },
) {
  const playerId = await game.evaluate(
    () => game.users.getName("E2E Player")?.id ?? null,
  );
  expect(playerId).toBeTruthy();

  await game.evaluate(
    async ({ containerActorId, characterActorId, playerId }) => {
      for (const id of [containerActorId, characterActorId]) {
        const actor = game.actors.get(id);
        await actor.update({
          [`ownership.${playerId}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      }
    },
    { containerActorId, characterActorId, playerId },
  );

  // The "Sell items?" checkbox only renders on custom containers; switching to
  // custom has no other flag side effects and the vendor purchase flow does not
  // depend on the container type.
  await setContainerTypeViaUI(game, containerActorId, "custom");
  await setContainerFlagViaUI(game, containerActorId, "players-sell");

  const itemName = await game.evaluate(
    ({ characterActorId, itemId }) =>
      game.actors.get(characterActorId).items.get(itemId)?.name ?? null,
    { characterActorId, itemId },
  );
  expect(
    itemName,
    `expected owned item ${itemId} on actor ${characterActorId}`,
  ).toBeTruthy();

  const { context, page: player } = await openPlayerPage(browser, baseURL);
  try {
    const characterSheetId = await reopenActorSheetViaUI(
      player,
      characterActorId,
    );
    const gear = await activateGearTab(player, characterSheetId);
    const row = await hoverGearRow(gear, itemId);

    const containerSheetId = await reopenActorSheetViaUI(
      player,
      containerActorId,
    );
    const target = player.locator(`#${containerSheetId}`);
    await expect(target).toBeVisible();

    const offerDialog = () =>
      player.locator(".dialog", { hasText: "offering you" });

    await row.dragTo(target, { timeout: 5000 }).catch(() => {});
    await player.mouse.up().catch(() => {});

    const dialogShown = await offerDialog()
      .first()
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!dialogShown) {
      // Native HTML5 drag did not land; dispatch a synthetic drop carrying the
      // same payload Foundry writes on dragstart.
      const uuid = await player.evaluate(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId)?.uuid ?? null,
        { actorId: characterActorId, itemId },
      );
      expect(uuid).toBeTruthy();
      await player.evaluate(
        ({ uuid, containerSheetId, characterActorId }) => {
          const sheetEl = document.getElementById(containerSheetId);
          const data = new DataTransfer();
          data.setData(
            "text/plain",
            JSON.stringify({
              type: "Item",
              uuid,
              system: { actorId: characterActorId, tokenId: null },
            }),
          );
          sheetEl.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: data,
            }),
          );
        },
        { uuid, containerSheetId, characterActorId },
      );
    }

    await expect(offerDialog().first()).toBeVisible({ timeout: 5000 });
    // DialogV2.confirm renders its accept button with data-action="yes".
    await offerDialog().first().locator('button[data-action="yes"]').click();

    await game.waitForFunction(
      ({ containerActorId, characterActorId, itemId, itemName }) => {
        const container = game.actors.get(containerActorId);
        const character = game.actors.get(characterActorId);
        return (
          !character.items.has(itemId) &&
          container.items.some((i) => i.name === itemName)
        );
      },
      { containerActorId, characterActorId, itemId, itemName },
      { timeout: 10000 },
    );
  } finally {
    await context.close();
  }
}
