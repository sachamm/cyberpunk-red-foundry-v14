import { test, expect } from "@playwright/test";
import {
  activateGearTab,
  closeDocSheet,
  closeOwnedItemSheet,
  createDocumentViaUI,
  createItemViaUI,
  dismissNotifications,
  dragItemToActorSheet,
  dragOwnedItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openOwnedItemSheet,
  positionActorSheet,
  reopenActorSheetViaUI,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  configureContainerVendorViaUI,
  createContainerWithItem,
  createInventoryItemViaUI,
  enablePlayersCreateInventory,
  equipWeapon,
  FIELD,
  installConsoleErrorHarness,
  purchaseAllViaUI,
  purchasePartViaUI,
  sellItemToContainerViaUI,
  setContainerFlagViaUI,
  setContainerTypeViaUI,
  setActorWealthViaUI,
  sheet,
  setTradePartnerWithWealth,
  waitForActorFields,
} from "./container-sheet-helpers.mjs";

installConsoleErrorHarness();

test.describe("Shop", () => {
  test("a newly created container renders its default shop presentation for GMs", async ({
    page: game,
  }) => {
    const initialName = uniqueName("container");
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: initialName,
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("first render shows editable name, image block, and trade-with selector", async () => {
      const containerSheet = sheet(game, sheetId);

      await expect(containerSheet.locator(FIELD.name)).toHaveValue(initialName);
      await expect(containerSheet.locator(FIELD.name)).toBeVisible();
      await expect(containerSheet.locator(FIELD.name)).toBeEnabled();

      await expect(containerSheet.locator(FIELD.imageBlock)).toBeVisible();

      await expect(containerSheet.locator(FIELD.tradeWith)).toBeVisible();
    });

    await test.step("GM settings section is visible for GM user", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.gmSettings)).toBeVisible();
    });

    await test.step("container type dropdown is present with shop as default", async () => {
      const containerSheet = sheet(game, sheetId);
      const dropdown = containerSheet.locator(FIELD.containerTypeDropdown);
      await expect(dropdown).toBeVisible();
      const selected = await dropdown.evaluate(
        (el) => el.options[el.selectedIndex].textContent,
      );
      expect(selected).toBeTruthy();
    });

    await test.step("eurobucks display shows a numeric value for shop container", async () => {
      const containerSheet = sheet(game, sheetId);
      const eurobucksText = await containerSheet
        .locator(FIELD.eurobucksValue)
        .evaluate((el) => el.textContent?.trim() ?? "");
      expect(Number(eurobucksText)).not.toBeNaN();
    });

    await test.step("ledger button is visible for GM on non-loot container", async () => {
      const containerSheet = sheet(game, sheetId);
      await expect(containerSheet.locator(FIELD.ledgerButton)).toBeVisible();
    });

    // One could argue that the expansion/collapse glyphs should not be displayed if a category is empty
    // While this test is "to spec", it is a little nonsensical.
    await test.step("inventory categories are rendered as collapsible sections even when empty", async () => {
      const containerSheet = sheet(game, sheetId);
      const categories = containerSheet.locator(FIELD.categoryHeader);
      const count = await categories.count();
      expect(count).toBeGreaterThan(0);

      const firstCategory = categories.first();
      await expect(firstCategory.locator(FIELD.expandIcon)).toBeVisible();

      const categoryNames = await categories.evaluateAll((els) =>
        els.map((el) => el.textContent.trim()),
      );
      expect(categoryNames.length).toBeGreaterThan(0);
    });

    await test.step("create item buttons are visible for GM on category headers", async () => {
      const containerSheet = sheet(game, sheetId);
      const createButtons = containerSheet.locator(FIELD.createButton);
      const count = await createButtons.count();
      expect(count).toBeGreaterThan(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("GM can purchase items from container inventory with sufficient funds", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "purchase-test-container",
      itemType: "gear",
    });

    await test.step("set trade partner with sufficient funds", async () => {
      await setTradePartnerWithWealth(game, sheetId);
    });

    await test.step("purchase all items and verify they are removed", async () => {
      const containerSheet = sheet(game, sheetId);

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );

      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(0);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("infinite stock prevents item removal on purchase", async ({
    page: game,
  }) => {
    const itemName = uniqueName("infinite-stock-gear");
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "shop-infinite-stock-container",
      itemType: "gear",
      itemName,
    });

    await test.step("enable infinite stock flag on shop container", async () => {
      await setContainerFlagViaUI(game, actorId, "infinite-stock");
    });

    let tradePartnerId = null;
    await test.step("set trade partner with sufficient funds", async () => {
      tradePartnerId = await setTradePartnerWithWealth(game, sheetId);
    });

    await test.step("purchase item and verify it is NOT removed", async () => {
      const containerSheet = sheet(game, sheetId);

      await purchaseAllViaUI(game, sheetId, itemName);

      await game.waitForFunction(
        async ({ tradePartnerId, itemName }) => {
          const tradePartner = game.actors.get(tradePartnerId);
          if (!tradePartner) return false;
          const transactions = tradePartner.system?.wealth?.transactions ?? [];
          return transactions.some((entry) => {
            const reason = Array.isArray(entry) ? entry[1] : null;
            return typeof reason === "string" && reason.includes(itemName);
          });
        },
        { tradePartnerId, itemName },
        { timeout: 5000 },
      );

      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: itemName });
      await expect(remainingItems).toHaveCount(1);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("both actors' eurobucks ledgers update when selling items to shop", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    await enablePlayersCreateInventory(game);

    const playerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("seller-character"),
    });

    const playerSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: playerActorId,
    });

    const weaponName = uniqueName("assault-rifle");
    await createInventoryItemViaUI(game, {
      actorId: playerActorId,
      sheetId: playerSheetId,
      itemType: "weapon",
      itemName: weaponName,
      data: {
        system: {
          weaponType: "assaultRifle",
          isRanged: true,
          magazine: { value: 0, max: 30 },
          installedItems: { allowedTypes: ["ammo"] },
          ammoVariety: ["rifle"],
        },
      },
    });

    const containerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("shop-sell-container"),
    });

    await expectSheetRendered(game, {
      collection: "actors",
      id: containerActorId,
    });

    await test.step("configure container to buy weapons at 50% of market price", async () => {
      await setContainerTypeViaUI(game, containerActorId, "shop");
      await configureContainerVendorViaUI(game, containerActorId, {
        itemType: "weapon",
        purchasePercentage: 50,
      });
    });

    await test.step("set up shop with sufficient funds", async () => {
      await setActorWealthViaUI(game, containerActorId, 999999);
    });

    await test.step("sell item to shop via drag-and-drop and verify both ledgers update", async () => {
      const itemBefore = await game.evaluate(
        async ({ playerActorId, weaponName }) => {
          const player = game.actors.get(playerActorId);
          const item = player.items.find((i) => i.name === weaponName);
          if (!item) return null;
          return {
            price: item.system.price.market,
            magazineValue: item.system.magazine?.value,
            magazineMax: item.system.magazine?.max,
          };
        },
        { playerActorId, weaponName },
      );

      const itemId = await game.evaluate(
        ({ playerActorId, weaponName }) =>
          game.actors
            .get(playerActorId)
            .items.find((i) => i.name === weaponName)?.id ?? null,
        { playerActorId, weaponName },
      );

      await sellItemToContainerViaUI(game, browser, baseURL, {
        containerActorId,
        characterActorId: playerActorId,
        itemId,
      });

      const containerItemAfter = await game.evaluate(
        async ({ containerActorId, weaponName }) => {
          const container = game.actors.get(containerActorId);
          if (!container) return false;
          return container.items.some((i) => i.name === weaponName);
        },
        { containerActorId, weaponName },
      );
      expect(containerItemAfter).toBe(true);

      const containerItemData = await game.evaluate(
        async ({ containerActorId, weaponName }) => {
          const container = game.actors.get(containerActorId);
          const item = container.items.find((i) => i.name === weaponName);
          return {
            price: item?.system?.price?.market,
            magazineValue: item?.system?.magazine?.value,
            magazineMax: item?.system?.magazine?.max,
          };
        },
        { containerActorId, weaponName },
      );
      expect(containerItemData.price).toBe(itemBefore.price);
      expect(containerItemData.magazineValue).toBe(itemBefore.magazineValue);
      expect(containerItemData.magazineMax).toBe(itemBefore.magazineMax);

      const ledgerData = await game.evaluate(
        async ({ playerActorId, containerActorId }) => {
          const player = game.actors.get(playerActorId);
          const container = game.actors.get(containerActorId);
          return {
            playerWealth: player.system.wealth.value,
            playerTransactions: player.system.wealth.transactions,
            shopWealth: container.system.wealth.value,
            shopTransactions: container.system.wealth.transactions,
          };
        },
        { playerActorId, containerActorId },
      );

      expect(ledgerData.playerWealth).toBe(50);

      expect(ledgerData.shopWealth).toBe(999949);

      expect(
        ledgerData.playerTransactions.some((t) => t[0].includes("increase")),
      ).toBe(true);

      expect(
        ledgerData.shopTransactions.some((t) => t[0].includes("decrease")),
      ).toBe(true);
    });

    await closeDocSheet(game, { collection: "actors", id: playerActorId });
    await closeDocSheet(game, { collection: "actors", id: containerActorId });
  });

  /**
   * Note: the shop has zero wealth, and this test confirms that the player (seller)
   * does not get any Eurobucks because the shop doesn't have any. We may want
   * to add a warning that is displayed during such a transaction.
   */
  test("player sells item to shop with zero wealth", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    await enablePlayersCreateInventory(game);

    const playerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("seller-zero-wealth"),
    });

    await test.step("create a gear item on the player character", async () => {
      const playerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: playerActorId,
      });

      await createInventoryItemViaUI(game, {
        actorId: playerActorId,
        sheetId: playerSheetId,
        itemType: "gear",
        itemName: "Sellable Gear Zero",
      });
    });

    const containerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("shop-zero-wealth-container"),
    });

    await expectSheetRendered(game, {
      collection: "actors",
      id: containerActorId,
    });

    await test.step("configure container to buy gear at 50% with zero funds", async () => {
      await setContainerTypeViaUI(game, containerActorId, "shop");
      await setActorWealthViaUI(game, containerActorId, 0);
      await configureContainerVendorViaUI(game, containerActorId, {
        itemType: "gear",
        purchasePercentage: 50,
      });
    });

    await test.step("sell item to shop with zero funds and verify ledgers update", async () => {
      const itemId = await game.evaluate(
        ({ playerActorId }) =>
          game.actors
            .get(playerActorId)
            .items.find((i) => i.name === "Sellable Gear Zero")?.id ?? null,
        { playerActorId },
      );

      await sellItemToContainerViaUI(game, browser, baseURL, {
        containerActorId,
        characterActorId: playerActorId,
        itemId,
      });

      const containerItemAfter = await game.evaluate(
        async ({ containerActorId }) => {
          const container = game.actors.get(containerActorId);
          if (!container) return false;
          return container.items.some((i) => i.name === "Sellable Gear Zero");
        },
        { containerActorId },
      );
      expect(containerItemAfter).toBe(true);

      const ledgerData = await game.evaluate(
        async ({ playerActorId, containerActorId }) => {
          const player = game.actors.get(playerActorId);
          const container = game.actors.get(containerActorId);
          return {
            playerWealth: player.system.wealth.value,
            playerTransactions: player.system.wealth.transactions,
            shopWealth: container.system.wealth.value,
            shopTransactions: container.system.wealth.transactions,
          };
        },
        { playerActorId, containerActorId },
      );

      expect(ledgerData.playerWealth).toBe(0);

      expect(ledgerData.shopWealth).toBe(0);

      expect(ledgerData.playerTransactions.length).toBeGreaterThan(0);
      expect(ledgerData.shopTransactions.length).toBeGreaterThan(0);
    });

    await closeDocSheet(game, { collection: "actors", id: playerActorId });
    await closeDocSheet(game, { collection: "actors", id: containerActorId });
  });

  test("purchasing part of a stack leaves the remainder in stock", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("partial-purchase-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create a gear item with amount > 1", async () => {
      sheetId = (
        await createInventoryItemViaUI(game, {
          actorId,
          sheetId,
          itemType: "gear",
          data: { "system.amount": 5 },
        })
      ).sheetId;
    });

    await test.step("set trade partner and click purchase fraction", async () => {
      await setTradePartnerWithWealth(game, sheetId);

      await purchasePartViaUI(game, sheetId, "New Gear", 2);
    });

    await test.step("verify remaining amount is 3 (5 - 2)", async () => {
      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          const item = actor.items.find((i) => i.name === "New Gear");
          return item?.system?.amount === 3;
        },
        { actorId },
        { timeout: 10000 },
      );

      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "New Gear" });
      await expect(itemRow).toBeVisible();
      const amountText = await itemRow
        .locator(".item-detail")
        .evaluate((el) => el.textContent);
      expect(amountText).toContain("3");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("purchase with insufficient funds shows warning", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "insufficient-funds-container",
      itemType: "gear",
    });

    await test.step("set trade partner with zero wealth", async () => {
      await setTradePartnerWithWealth(game, sheetId, { wealth: 0 });
    });

    await test.step("attempting purchase shows a warning notification", async () => {
      const containerSheet = sheet(game, sheetId);

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await expect(
        game.locator(".notification.warning, .notification.error"),
      ).toBeVisible();
      await dismissNotifications(game);

      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(1);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("failed purchase of installed ammo leaves the shop's weapon and stock intact", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    await enablePlayersCreateInventory(game);

    const characterName = uniqueName("ammo-seller");
    const characterActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: characterName,
    });
    let characterSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: characterActorId,
    });

    const weaponName = uniqueName("assault-rifle");
    const ammoName = uniqueName("rifle-ammo");
    let embeddedWeaponId;
    let embeddedAmmoId;

    await test.step("give the character a rifle and matching ammo", async () => {
      ({ sheetId: characterSheetId } = await createInventoryItemViaUI(game, {
        actorId: characterActorId,
        sheetId: characterSheetId,
        itemType: "weapon",
        itemName: weaponName,
        data: {
          system: {
            weaponType: "assaultRifle",
            isRanged: true,
            magazine: { value: 0, max: 30 },
            installedItems: { allowedTypes: ["ammo"] },
            ammoVariety: ["rifle"],
          },
        },
      }));
      ({ sheetId: characterSheetId } = await createInventoryItemViaUI(game, {
        actorId: characterActorId,
        sheetId: characterSheetId,
        itemType: "ammo",
        itemName: ammoName,
        data: {
          system: { variety: "rifle", amount: 50 },
        },
      }));

      ({ embeddedWeaponId, embeddedAmmoId } = await game.evaluate(
        ({ characterActorId, weaponName, ammoName }) => {
          const actor = game.actors.get(characterActorId);
          return {
            embeddedWeaponId: actor.items.find((i) => i.name === weaponName).id,
            embeddedAmmoId: actor.items.find((i) => i.name === ammoName).id,
          };
        },
        { characterActorId, weaponName, ammoName },
      ));
    });

    await test.step("equip the rifle and load 30 rounds", async () => {
      await equipWeapon(game, {
        actorSheetId: characterSheetId,
        actorId: characterActorId,
        itemId: embeddedWeaponId,
      });

      const actorSheet = game.locator(`#${characterSheetId}`);
      await actorSheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
      await actorSheet
        .locator(
          `.bottom-content-section .item-action[data-item-id="${embeddedWeaponId}"][data-action="select-ammo"]`,
        )
        .click();
      const loadDialog = game
        .locator(".application")
        .filter({ has: game.locator('select[name="selectedAmmo"]') });
      await expect(
        loadDialog.locator('select[name="selectedAmmo"]'),
      ).toHaveValue(embeddedAmmoId);
      await loadDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(loadDialog).toHaveCount(0);

      await game.waitForFunction(
        ({ characterActorId, weaponId, ammoId }) => {
          const actor = game.actors.get(characterActorId);
          return (
            actor.items.get(weaponId).system.magazine.value === 30 &&
            actor.items.get(ammoId).system.amount === 20
          );
        },
        {
          characterActorId,
          weaponId: embeddedWeaponId,
          ammoId: embeddedAmmoId,
        },
        { timeout: 10000 },
      );
    });

    const containerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("shop-installed-ammo"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: containerActorId,
    });
    await setActorWealthViaUI(game, containerActorId, 999999);

    await test.step("sell the rifle to the shop", async () => {
      await sellItemToContainerViaUI(game, browser, baseURL, {
        containerActorId,
        characterActorId,
        itemId: embeddedWeaponId,
      });

      await game.evaluate(({ id }) => game.actors.get(id).sheet.render(true), {
        id: containerActorId,
      });
      sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });
    });

    const readShopState = () =>
      game.evaluate(
        ({ containerActorId, weaponName, ammoName }) => {
          const actor = game.actors.get(containerActorId);
          const weapon = actor.items.find((i) => i.name === weaponName);
          const ammo = actor.items.find((i) => i.name === ammoName);
          return {
            hasWeapon: Boolean(weapon),
            hasAmmo: Boolean(ammo),
            magazineValue: weapon?.system?.magazine?.value ?? null,
            ammoAmount: ammo?.system?.amount ?? null,
            ammoInstalledInWeapon:
              Boolean(weapon) &&
              Boolean(ammo) &&
              weapon.system.installedItems.list.includes(ammo.id),
          };
        },
        { containerActorId, weaponName, ammoName },
      );

    await test.step("the shop holds the rifle with its empty ammo stack installed", async () => {
      const state = await readShopState();
      expect(state.hasWeapon).toBe(true);
      expect(state.hasAmmo).toBe(true);
      expect(state.magazineValue).toBe(0);
      expect(state.ammoAmount).toBe(0);
      expect(state.ammoInstalledInWeapon).toBe(true);
    });

    const getAmmoRow = () => {
      const containerSheet = sheet(game, sheetId);
      return containerSheet
        .locator(".collapsible")
        .filter({ has: game.locator("#gearTab-ammo") })
        .locator(".item.flexrow")
        .filter({ hasText: ammoName });
    };

    await test.step("restock the shop's ammo stack to 50 rounds", async () => {
      const shopAmmoId = await game.evaluate(
        ({ containerActorId, ammoName }) =>
          game.actors
            .get(containerActorId)
            .items.find((i) => i.name === ammoName).id,
        { containerActorId, ammoName },
      );

      await getAmmoRow().locator(".item-edit").click();
      const itemSheetId = await openOwnedItemSheet(game, {
        actorId: containerActorId,
        itemId: shopAmmoId,
      });
      const itemSheet = await openItemSettings(game, itemSheetId);
      const amountInput = itemSheet.locator('input[name="system.amount"]');
      await expect(amountInput).toBeVisible();
      await amountInput.fill("50");
      await amountInput.press("Tab");
      await game.waitForFunction(
        ({ containerActorId, itemId }) =>
          game.actors.get(containerActorId).items.get(itemId).system.amount ===
          50,
        { containerActorId, itemId: shopAmmoId },
        { timeout: 10000 },
      );
      await closeOwnedItemSheet(game, {
        actorId: containerActorId,
        itemId: shopAmmoId,
      });

      const state = await readShopState();
      expect(state.ammoAmount).toBe(50);
    });

    const clickPurchaseAllOnAmmoRow = async () => {
      const ammoRow = getAmmoRow();
      await expect(ammoRow).toBeVisible();
      await ammoRow.locator(FIELD.purchaseAll).click();
    };

    await test.step("a broke buyer cannot purchase the installed ammo", async () => {
      await setTradePartnerWithWealth(game, sheetId, {
        partnerName: characterName,
        wealth: 0,
      });

      await clickPurchaseAllOnAmmoRow();

      await expect(
        game.locator(".notification.warning, .notification.error"),
      ).toBeVisible();
      await dismissNotifications(game);
    });

    await test.step("the failed purchase left the shop's weapon and stock untouched", async () => {
      const state = await readShopState();
      expect(state.hasWeapon).toBe(true);
      expect(state.hasAmmo).toBe(true);
      expect(state.magazineValue).toBe(0);
      expect(state.ammoAmount).toBe(50);
      expect(state.ammoInstalledInWeapon).toBe(true);

      const buyerHasAmmo = await game.evaluate(
        ({ characterActorId, ammoName }) =>
          game.actors
            .get(characterActorId)
            .items.some((i) => i.name === ammoName),
        { characterActorId, ammoName },
      );
      expect(buyerHasAmmo).toBe(false);
    });

    await test.step("a funded buyer completes the purchase", async () => {
      await setTradePartnerWithWealth(game, sheetId, {
        partnerName: characterName,
        wealth: 5000,
      });

      await clickPurchaseAllOnAmmoRow();

      await game.waitForFunction(
        ({ containerActorId, characterActorId, ammoName }) => {
          const shop = game.actors.get(containerActorId);
          const buyer = game.actors.get(characterActorId);
          return (
            !shop.items.some((i) => i.name === ammoName) &&
            buyer.items.find((i) => i.name === ammoName)?.system.amount === 50
          );
        },
        { containerActorId, characterActorId, ammoName },
        { timeout: 10000 },
      );

      const after = await game.evaluate(
        ({ containerActorId, characterActorId, weaponName }) => {
          const shop = game.actors.get(containerActorId);
          return {
            shopHasWeapon: shop.items.some((i) => i.name === weaponName),
            buyerWealth: game.actors.get(characterActorId).system.wealth.value,
          };
        },
        { containerActorId, characterActorId, weaponName },
      );
      expect(after.shopHasWeapon).toBe(true);
      // Ammo is priced per 10 rounds: 50 x (100 / 10) = 500.
      expect(after.buyerWealth).toBe(4500);
    });

    await closeDocSheet(game, { collection: "actors", id: containerActorId });
  });

  test("purchase without trade partner shows warning", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "no-trade-partner-container",
      itemType: "gear",
    });

    await test.step("attempting purchase without trade partner shows warning", async () => {
      const containerSheet = sheet(game, sheetId);

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await expect(game.locator(".notification.warning")).toBeVisible();
      await dismissNotifications(game);

      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(1);
    });

    await test.step("selecting trade partner and completing purchase works", async () => {
      await setTradePartnerWithWealth(game, sheetId);

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await game.waitForFunction(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  /**
   * The "edge case" is on page 344 in the core rulebook: ammo is purchased in
   * stacks of 10, so we divide by that when considering an items amount.
   */
  test("ammo purchases are priced per 10 rounds", async ({ page: game }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("ammo-pricing-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create an ammo item with market price 100", async () => {
      sheetId = (
        await createInventoryItemViaUI(game, {
          actorId,
          sheetId,
          itemType: "ammo",
          data: { "system.price.market": 100 },
        })
      ).sheetId;
    });

    await test.step("purchase ammo and verify price is divided by 10", async () => {
      const tradePartnerId = await setTradePartnerWithWealth(game, sheetId);

      const tradePartnerWealthBefore = await game.evaluate(
        async ({ tradePartnerId }) => {
          const tradePartner = game.actors.get(tradePartnerId);
          return tradePartner?.system?.wealth?.value ?? 0;
        },
        { tradePartnerId },
      );

      await purchaseAllViaUI(game, sheetId, "New Ammo");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Ammo");
        },
        { actorId },
        { timeout: 5000 },
      );

      await waitForActorFields(game, tradePartnerId, {
        "system.wealth.value": tradePartnerWealthBefore - 10,
      });
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("purchased items stack with the buyer's existing items", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("stacking-container"),
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("create a stack of three 'Airhypo' in the container", async () => {
      sheetId = (
        await createInventoryItemViaUI(game, {
          actorId,
          sheetId,
          itemType: "gear",
          itemName: "Airhypo",
          data: { "system.amount": 3 },
        })
      ).sheetId;
    });

    let tradePartnerId = null;
    let worldAirhypoId = null;

    await test.step("create trade partner and a world 'Airhypo'", async () => {
      tradePartnerId = await setTradePartnerWithWealth(game, sheetId);

      worldAirhypoId = await createItemViaUI(game, {
        type: "gear",
        name: "Airhypo",
      });
      await closeDocSheet(game, { collection: "items", id: worldAirhypoId });
    });

    await test.step("purchase one 'Airhypo' and verify the shop stack drops to two", async () => {
      sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });
      await purchasePartViaUI(game, sheetId, "Airhypo");

      const shopAmount = await game.waitForFunction(
        ({ actorId }) => {
          const item = game.actors
            .get(actorId)
            ?.items.find((i) => i.name === "Airhypo");
          return item?.system?.amount === 2 ? item.system.amount : null;
        },
        { actorId },
        { timeout: 10000 },
      );
      expect(await shopAmount.jsonValue()).toBe(2);

      await game.waitForFunction(
        ({ partnerId }) => {
          const partner = game.actors.get(partnerId);
          const airhypo = partner?.items.find((i) => i.name === "Airhypo");
          return airhypo?.system?.amount === 1;
        },
        { partnerId: tradePartnerId },
        { timeout: 10000 },
      );
    });

    await test.step("purchase a second 'Airhypo' and verify it stacks in the partner's inventory", async () => {
      sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });
      await purchasePartViaUI(game, sheetId, "Airhypo");

      const shopAmount = await game.waitForFunction(
        ({ actorId }) => {
          const item = game.actors
            .get(actorId)
            ?.items.find((i) => i.name === "Airhypo");
          return item?.system?.amount === 1 ? item.system.amount : null;
        },
        { actorId },
        { timeout: 10000 },
      );
      expect(await shopAmount.jsonValue()).toBe(1);

      const amountHandle = await game.waitForFunction(
        ({ partnerId }) => {
          const partner = game.actors.get(partnerId);
          const airhypo = partner?.items.find((i) => i.name === "Airhypo");
          return airhypo?.system.amount === 2 ? airhypo.system.amount : null;
        },
        { partnerId: tradePartnerId },
        { timeout: 10000 },
      );
      const tradePartnerAmount = await amountHandle.jsonValue();
      expect(tradePartnerAmount).toBe(2);
    });

    await test.step("drag the world 'Airhypo' onto the partner and verify it stacks to three", async () => {
      const partnerSheetId = await reopenActorSheetViaUI(game, tradePartnerId);
      await dragItemToActorSheet(game, {
        itemId: worldAirhypoId,
        sheetId: partnerSheetId,
        actorId: tradePartnerId,
        expectStack: true,
      });

      const stackHandle = await game.waitForFunction(
        ({ partnerId }) => {
          const partner = game.actors.get(partnerId);
          const airhypoItems =
            partner?.items.filter((i) => i.name === "Airhypo") ?? [];
          if (airhypoItems.length !== 1) return null;
          return airhypoItems[0].system.amount === 3
            ? airhypoItems[0].system.amount
            : null;
        },
        { partnerId: tradePartnerId },
        { timeout: 10000 },
      );
      expect(await stackHandle.jsonValue()).toBe(3);

      await closeDocSheet(game, { collection: "actors", id: tradePartnerId });
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("eurobucks ledger updates after purchase", async ({ page: game }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "ledger-update-container",
      itemType: "gear",
    });

    let selectedTradePartnerId = null;

    await test.step("set up trade partner with known wealth", async () => {
      selectedTradePartnerId = await setTradePartnerWithWealth(game, sheetId, {
        wealth: 500,
      });
    });

    await test.step("purchase item and verify wealth changes", async () => {
      const containerWealthBefore = await game.evaluate(
        async ({ actorId }) => {
          const container = game.actors.get(actorId);
          return container?.system?.wealth?.value ?? 0;
        },
        { actorId },
      );

      const tradePartnerWealthBefore = await game.evaluate(
        async ({ tradePartnerId }) => {
          if (!tradePartnerId) return 0;
          const tradePartner = game.actors.get(tradePartnerId);
          if (!tradePartner) return 0;
          return tradePartner.system?.wealth?.value ?? 0;
        },
        { tradePartnerId: selectedTradePartnerId },
      );

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );

      await waitForActorFields(game, selectedTradePartnerId, {
        "system.wealth.value": tradePartnerWealthBefore - 100,
      });
      await waitForActorFields(game, actorId, {
        "system.wealth.value": containerWealthBefore + 100,
      });
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("trade log entries after purchase", async ({ page: game }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "trade-log-container",
      itemType: "gear",
    });

    await test.step("set up trade partner with sufficient funds", async () => {
      await setTradePartnerWithWealth(game, sheetId);
    });

    await test.step("purchase item and verify trade log entry exists", async () => {
      await purchaseAllViaUI(game, sheetId, "New Gear");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );

      const recordsJson = await game.waitForFunction(
        (params) => {
          const container = game.actors.get(params.actorId);
          if (!container) return null;
          const recs = container.listRecords("wealth");
          if (!Array.isArray(recs) || recs.length === 0) return null;
          const latestEntry = recs[recs.length - 1];
          return typeof latestEntry?.[1] === "string" &&
            latestEntry[1].includes("New Gear") &&
            latestEntry[1].includes("100")
            ? JSON.stringify(recs)
            : null;
        },
        { actorId },
        { timeout: 5000 },
      );

      const records = JSON.parse(recordsJson);
      expect(records.length).toBeGreaterThan(0);
      const latestEntry = records[records.length - 1];
      expect(latestEntry[1]).toContain("New Gear");
      expect(latestEntry[1]).toContain("100");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("changing trade partner mid-session", async ({ page: game }) => {
    const secondPartnerName = uniqueName("second-partner");
    const secondPartnerId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: secondPartnerName,
    });

    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "trade-partner-change-container",
      itemType: "gear",
    });

    await test.step("set up first trade partner with known wealth", async () => {
      await setTradePartnerWithWealth(game, sheetId, { wealth: 1000 });
    });

    await test.step("switch to second trade partner and purchase", async () => {
      await game.evaluate(
        async ({ actorId }) => {
          const actor = game.actors.get(actorId);
          if (actor && actor.sheet.rendered) {
            await actor.sheet.render();
          }
        },
        { actorId },
      );

      await setTradePartnerWithWealth(game, sheetId, {
        partnerName: secondPartnerName,
        wealth: 5000,
      });

      await game.waitForFunction(
        async ({ sheetId, secondPartnerId }) => {
          const sheetEl = document.getElementById(sheetId);
          if (!sheetEl) return false;
          const select = sheetEl.querySelector(
            'select[name="trade-with-dropdown"]',
          );
          return select?.value === secondPartnerId;
        },
        { sheetId, secondPartnerId },
        { timeout: 5000 },
      );

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return !actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );

      await waitForActorFields(game, secondPartnerId, {
        "system.wealth.value": 4900,
      });

      await closeDocSheet(game, { collection: "actors", id: actorId });
      await closeDocSheet(game, {
        collection: "actors",
        id: secondPartnerId,
      });
    });
  });

  test("transacted items arrive with their installed upgrades", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    const weaponName = uniqueName("upgraded-rifle");
    const upgradeName = uniqueName("rifle-upgrade");
    let playerActorId;
    let playerName;
    let containerActorId;
    let embeddedWeaponId;
    let embeddedUpgradeId;

    /**
     * Once we have item tests this can likely be moved out as a helper.
     */
    const readInstalledState = (actorId) =>
      game.evaluate(
        ({ actorId, weaponName, upgradeName }) => {
          const actor = game.actors.get(actorId);
          const weapon = actor.items.find((i) => i.name === weaponName);
          const list = weapon.system.installedItems.list;
          return {
            listLength: list.length,
            allReferencesResolve: list.every((ref) =>
              actor.items.some((i) => i.id === ref || i.uuid === ref),
            ),
            upgradeCount: actor.items.filter(
              (i) => i.name === upgradeName && i.type === "itemUpgrade",
            ).length,
          };
        },
        { actorId, weaponName, upgradeName },
      );

    await test.step("create a character, a weapon, and an upgrade via the UI", async () => {
      playerName = uniqueName("upgrade-trade-character");
      playerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: playerName,
      });
      const worldWeaponId = await createItemViaUI(game, {
        type: "weapon",
        name: weaponName,
      });
      const worldUpgradeId = await createItemViaUI(game, {
        type: "itemUpgrade",
        name: upgradeName,
      });
      await closeDocSheet(game, { collection: "items", id: worldWeaponId });
      await closeDocSheet(game, { collection: "items", id: worldUpgradeId });

      const playerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: playerActorId,
      });
      await dragItemToActorSheet(game, {
        itemId: worldWeaponId,
        sheetId: playerSheetId,
        actorId: playerActorId,
      });
      await dragItemToActorSheet(game, {
        itemId: worldUpgradeId,
        sheetId: playerSheetId,
        actorId: playerActorId,
      });

      ({ embeddedWeaponId, embeddedUpgradeId } = await game.evaluate(
        ({ playerActorId, weaponName, upgradeName }) => {
          const actor = game.actors.get(playerActorId);
          return {
            embeddedWeaponId: actor.items.find((i) => i.name === weaponName).id,
            embeddedUpgradeId: actor.items.find((i) => i.name === upgradeName)
              .id,
          };
        },
        { playerActorId, weaponName, upgradeName },
      ));
    });

    await test.step("install the upgrade into the weapon from the weapon's item sheet", async () => {
      const playerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: playerActorId,
      });
      const gear = await activateGearTab(game, playerSheetId);
      const weaponRow = gear
        .locator('li.item[data-item-category="weapon"]')
        .filter({ hasText: weaponName });
      await expect(weaponRow).toBeVisible();
      await weaponRow.locator(".item-edit").click();

      let itemSheetId = await openOwnedItemSheet(game, {
        actorId: playerActorId,
        itemId: embeddedWeaponId,
      });
      let itemSheet = await openItemSettings(game, itemSheetId);
      const manageLink = itemSheet.locator(".manage-installed-upgrades");
      await expect(manageLink).toBeVisible();
      await manageLink.click();

      const dialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="selectedItems"]') });
      await expect(dialog).toBeVisible();
      const checkbox = dialog.locator(
        `input[name="selectedItems"][value="${embeddedUpgradeId}"]`,
      );
      await expect(checkbox).toBeVisible();
      await checkbox.check();
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();

      await game.waitForFunction(
        ({ actorId, itemId }) =>
          game.actors.get(actorId).items.get(itemId).system.installedItems.list
            .length === 1,
        { actorId: playerActorId, itemId: embeddedWeaponId },
        { timeout: 10000 },
      );

      await closeOwnedItemSheet(game, {
        actorId: playerActorId,
        itemId: embeddedWeaponId,
      });
      await weaponRow.locator(".item-edit").click();
      itemSheetId = await openOwnedItemSheet(game, {
        actorId: playerActorId,
        itemId: embeddedWeaponId,
      });
      itemSheet = await openItemSettings(game, itemSheetId);
      await expect(
        itemSheet.locator("a.item-view", { hasText: upgradeName }),
      ).toBeVisible();
    });

    await test.step("sell the upgraded weapon to a shop container", async () => {
      containerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("upgrade-shop-container"),
      });
      await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });

      await setActorWealthViaUI(game, containerActorId, 999999);

      await sellItemToContainerViaUI(game, browser, baseURL, {
        containerActorId,
        characterActorId: playerActorId,
        itemId: embeddedWeaponId,
      });
    });

    await test.step("the shop's copy of the weapon still has the upgrade installed", async () => {
      const containerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });
      const containerSheet = sheet(game, containerSheetId);
      const weaponRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: weaponName });
      await expect(weaponRow).toBeVisible();
      await expect(weaponRow.locator(".fa-square-caret-up")).toBeVisible();

      const shopWeaponId = await game.evaluate(
        ({ containerActorId, weaponName }) =>
          game.actors
            .get(containerActorId)
            .items.find((i) => i.name === weaponName).id,
        { containerActorId, weaponName },
      );

      await weaponRow.locator(".item-edit").click();
      const itemSheetId = await openOwnedItemSheet(game, {
        actorId: containerActorId,
        itemId: shopWeaponId,
      });
      const itemSheet = await openItemSettings(game, itemSheetId);
      await expect(
        itemSheet.locator("a.item-view", { hasText: upgradeName }),
      ).toBeVisible();

      const state = await readInstalledState(containerActorId);
      expect(state.listLength).toBe(1);
      expect(state.allReferencesResolve, JSON.stringify(state)).toBe(true);
      expect(state.upgradeCount, JSON.stringify(state)).toBe(1);

      await closeOwnedItemSheet(game, {
        actorId: containerActorId,
        itemId: shopWeaponId,
      });
    });

    await test.step("buy the upgraded weapon back from the shop", async () => {
      const containerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });
      await setTradePartnerWithWealth(game, containerSheetId, {
        partnerName: playerName,
      });

      await purchaseAllViaUI(game, containerSheetId, weaponName);

      await game.waitForFunction(
        ({ playerActorId, containerActorId, weaponName }) => {
          const player = game.actors.get(playerActorId);
          const container = game.actors.get(containerActorId);
          return (
            player.items.some((i) => i.name === weaponName) &&
            !container.items.some((i) => i.name === weaponName)
          );
        },
        { playerActorId, containerActorId, weaponName },
        { timeout: 10000 },
      );
    });

    await test.step("the purchased weapon still has the upgrade installed", async () => {
      await closeDocSheet(game, {
        collection: "actors",
        id: containerActorId,
      });
      // The trade partner setup closed the player's sheet; bring it back to
      // front through the sidebar.
      const playerSheetId = await reopenActorSheetViaUI(game, playerActorId);
      const gear = await activateGearTab(game, playerSheetId);
      const weaponRow = gear
        .locator('li.item[data-item-category="weapon"]')
        .filter({ hasText: weaponName });
      await expect(weaponRow).toBeVisible();
      await expect(weaponRow.locator(".fa-square-caret-up")).toBeVisible();

      const finalWeaponId = await game.evaluate(
        ({ playerActorId, weaponName }) =>
          game.actors
            .get(playerActorId)
            .items.find((i) => i.name === weaponName).id,
        { playerActorId, weaponName },
      );

      await weaponRow.locator(".item-edit").click();
      const itemSheetId = await openOwnedItemSheet(game, {
        actorId: playerActorId,
        itemId: finalWeaponId,
      });
      const itemSheet = await openItemSettings(game, itemSheetId);
      await expect(
        itemSheet.locator("a.item-view", { hasText: upgradeName }),
      ).toBeVisible();

      const state = await readInstalledState(playerActorId);
      expect(state.listLength).toBe(1);
      expect(state.allReferencesResolve, JSON.stringify(state)).toBe(true);
      expect(state.upgradeCount, JSON.stringify(state)).toBe(1);

      await closeOwnedItemSheet(game, {
        actorId: playerActorId,
        itemId: finalWeaponId,
      });
      await closeDocSheet(game, { collection: "actors", id: playerActorId });
      await closeDocSheet(game, {
        collection: "actors",
        id: containerActorId,
      });
    });
  });

  test("a generated empty ammo pile cannot be purchased separately from its loaded weapon (#1291, #1386)", async ({
    page: game,
  }) => {
    const weaponName = uniqueName("loaded-rifle");
    const ammoName = uniqueName("rifle-ammo");
    let characterActorId;
    let characterSheetId;
    let embeddedWeaponId;
    let embeddedAmmoId;
    let containerActorId;
    let containerSheetId;
    let buyerOneId;
    let buyerTwoId;

    await test.step("create a character with a loaded assault rifle", async () => {
      characterActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("rifle-character"),
      });
      characterSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: characterActorId,
      });

      const weaponId = await createDocumentViaUI(game, {
        documentTab: "items",
        type: "weapon",
        name: weaponName,
      });
      const weaponSheetId = await expectSheetRendered(game, {
        collection: "items",
        id: weaponId,
      });
      let weaponSheet = await openItemSettings(game, weaponSheetId);
      await weaponSheet
        .locator('select[name="system.weaponType"]')
        .selectOption("assaultRifle");
      await weaponSheet
        .locator('a.item-checkbox[data-target="system.isRanged"]')
        .click();
      await game.waitForFunction(
        (id) => game.items.get(id).system.isRanged === true,
        weaponId,
      );
      await setItemField(game, {
        sheetId: weaponSheetId,
        itemId: weaponId,
        name: "system.magazine.max",
        path: "system.magazine.max",
        value: 30,
      });
      // Allow the weapon to have ammo installed in it.
      await (await openItemSettings(game, weaponSheetId))
        .locator(".manage-installable-types")
        .click();
      const installableTypesDialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="selectedTypes"]') });
      await installableTypesDialog
        .locator('input[name="selectedTypes"][value="ammo"]')
        .check();
      await installableTypesDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await game.waitForFunction((id) => {
        const allowedTypes =
          game.items.get(id).system.installedItems.allowedTypes;
        return allowedTypes.includes("ammo");
      }, weaponId);
      // Make the weapon compatible with rifle ammo.
      await (await openItemSettings(game, weaponSheetId))
        .locator(".select-compatible-ammo")
        .click();
      const compatibleAmmoDialog = game
        .locator(".application")
        .filter({ has: game.locator('input[name="selectedAmmo"]') });
      await compatibleAmmoDialog
        .locator('input[name="selectedAmmo"][value="rifle"]')
        .check();
      await compatibleAmmoDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await game.waitForFunction(
        (id) => game.items.get(id).system.ammoVariety.includes("rifle"),
        weaponId,
      );
      await closeDocSheet(game, { collection: "items", id: weaponId });

      const ammoId = await createDocumentViaUI(game, {
        documentTab: "items",
        type: "ammo",
        name: ammoName,
      });
      const ammoSheetId = await expectSheetRendered(game, {
        collection: "items",
        id: ammoId,
      });
      const ammoSheet = await openItemSettings(game, ammoSheetId);
      await ammoSheet
        .locator('select[name="system.variety"]')
        .selectOption("rifle");
      await game.waitForFunction(
        (id) => game.items.get(id).system.variety === "rifle",
        ammoId,
      );
      await setItemField(game, {
        sheetId: ammoSheetId,
        itemId: ammoId,
        name: "system.amount",
        path: "system.amount",
        value: 40,
      });
      await closeDocSheet(game, { collection: "items", id: ammoId });

      for (const itemId of [weaponId, ammoId]) {
        await dragItemToActorSheet(game, {
          itemId,
          sheetId: characterSheetId,
          actorId: characterActorId,
        });
      }

      ({ embeddedWeaponId, embeddedAmmoId } = await game.evaluate(
        ({ actorId, weaponName, ammoName }) => {
          const actor = game.actors.get(actorId);
          return {
            embeddedWeaponId: actor.items.find((i) => i.name === weaponName).id,
            embeddedAmmoId: actor.items.find((i) => i.name === ammoName).id,
          };
        },
        { actorId: characterActorId, weaponName, ammoName },
      ));

      await equipWeapon(game, {
        actorSheetId: characterSheetId,
        actorId: characterActorId,
        itemId: embeddedWeaponId,
      });

      // Load the rifle from the fight tab's change-ammo action. The
      // magazine fills to its max and the remainder stays in the pile.
      const characterSheet = game.locator(`#${characterSheetId}`);
      await characterSheet
        .locator('.navtabs-bottom a[data-tab="fight"]')
        .click();
      await characterSheet
        .locator(
          `.bottom-content-section .item-action[data-item-id="${embeddedWeaponId}"][data-action="select-ammo"]`,
        )
        .click();
      const loadDialog = game
        .locator(".application")
        .filter({ has: game.locator('select[name="selectedAmmo"]') });
      await expect(
        loadDialog.locator('select[name="selectedAmmo"]'),
      ).toHaveValue(embeddedAmmoId);
      await loadDialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await game.waitForFunction(
        ({ actorId, weaponId }) => {
          const weapon = game.actors.get(actorId).items.get(weaponId);
          return (
            weapon.system.magazine.value === 30 &&
            weapon.system.installedItems.list.length === 1
          );
        },
        { actorId: characterActorId, weaponId: embeddedWeaponId },
        { timeout: 10000 },
      );
    });

    await test.step("drag the loaded weapon to a container", async () => {
      containerActorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "container",
        name: uniqueName("rifle-shop-container"),
      });
      containerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: containerActorId,
      });
      await setActorWealthViaUI(game, containerActorId, 999999);

      // The two sheets together are wider than the test viewport, so they
      // cannot sit fully side by side. Park the character sheet at the left
      // edge and the container sheet at the right edge; bringing the
      // character sheet to front for the drag leaves a strip of the
      // container sheet visible to receive the drop.
      const [charBox, contBox] = await Promise.all([
        game.locator(`#${characterSheetId}`).boundingBox(),
        game.locator(`#${containerSheetId}`).boundingBox(),
      ]);
      const viewportWidth = await game.evaluate(() => window.innerWidth);
      const charLeft = 8;
      const contLeft = Math.min(
        charLeft + charBox.width + 8,
        viewportWidth - contBox.width - 8,
      );
      await positionActorSheet(game, {
        actorId: characterActorId,
        left: charLeft,
        top: 8,
      });
      await positionActorSheet(game, {
        actorId: containerActorId,
        left: contLeft,
        top: 8,
      });

      await dragOwnedItemToActorSheet(game, {
        sourceActorId: characterActorId,
        sourceSheetId: characterSheetId,
        itemId: embeddedWeaponId,
        targetActorId: containerActorId,
        targetSheetId: containerSheetId,
        requireUiDrag: true,
        // Drop on the part of the container sheet not covered by the
        // character sheet; its center would be underneath.
        dropPosition: {
          x:
            (Math.max(contLeft, charLeft + charBox.width) +
              (contLeft + contBox.width)) /
              2 -
            contLeft,
          y: contBox.height / 2,
        },
      });

      const state = await game.evaluate(
        ({ containerActorId, weaponName, ammoName }) => {
          const container = game.actors.get(containerActorId);
          const weapon = container.items.find((i) => i.name === weaponName);
          const pile = container.items.find(
            (i) => i.type === "ammo" && i.name === ammoName,
          );
          const list = weapon?.system.installedItems.list ?? [];
          return {
            hasWeapon: !!weapon,
            hasPile: !!pile,
            pileAmount: pile ? pile.system.amount : null,
            installedListLength: list.length,
            referencesResolve: list.every((ref) =>
              container.items.some((i) => i.id === ref),
            ),
          };
        },
        { containerActorId, weaponName, ammoName },
      );
      expect(state.hasWeapon).toBe(true);
      // Dragging a loaded weapon generates an empty ammo pile on the
      // container, referenced by the weapon's installed items list.
      expect(state.hasPile, JSON.stringify(state)).toBe(true);
      expect(state.pileAmount, JSON.stringify(state)).toBe(0);
      expect(state.installedListLength, JSON.stringify(state)).toBe(1);
      expect(state.referencesResolve, JSON.stringify(state)).toBe(true);

      // Park the container sheet back where it opened so it stops covering
      // the sidebar; the next step reopens it through the sidebar, which
      // also brings it back to front.
      await positionActorSheet(game, {
        actorId: containerActorId,
        left: contBox.x,
        top: contBox.y,
      });
    });

    await test.step("buyer one cannot purchase the generated empty ammo pile", async () => {
      const buyerOneName = uniqueName("ammo-buyer");
      buyerOneId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: buyerOneName,
      });
      await expectSheetRendered(game, {
        collection: "actors",
        id: buyerOneId,
      });
      await closeDocSheet(game, { collection: "actors", id: buyerOneId });

      // Re-render so the trade partner dropdown offers the new buyer.
      containerSheetId = await reopenActorSheetViaUI(game, containerActorId);
      await setTradePartnerWithWealth(game, containerSheetId, {
        partnerName: buyerOneName,
        wealth: 999999,
      });

      // The pile's name also appears in the weapon row's nested sub-list,
      // so scope to ammo rows and rely on only the top-level pile row
      // carrying a purchase action.
      const containerSheet = sheet(game, containerSheetId);
      const pilePurchase = containerSheet
        .locator('li.item.flexrow[data-item-category="ammo"]')
        .filter({ hasText: ammoName })
        .locator(FIELD.purchaseAll);
      await expect(pilePurchase).toHaveCount(0);

      const state = await game.evaluate(
        ({ containerActorId, buyerOneId, weaponName, ammoName }) => {
          const container = game.actors.get(containerActorId);
          const buyer = game.actors.get(buyerOneId);
          const weapon = container.items.find((i) => i.name === weaponName);
          const ammo = container.items.find((i) => i.name === ammoName);
          return {
            buyerHasAmmo: buyer.items.some((i) => i.name === ammoName),
            ammoAmount: ammo?.system.amount,
            magazine: weapon?.system.magazine.value,
            referencesAmmo:
              weapon?.system.installedItems.list.includes(ammo?.id) ?? false,
          };
        },
        { containerActorId, buyerOneId, weaponName, ammoName },
      );
      expect(state.buyerHasAmmo, JSON.stringify(state)).toBe(false);
      expect(state.ammoAmount, JSON.stringify(state)).toBe(0);
      expect(state.magazine, JSON.stringify(state)).toBe(30);
      expect(state.referencesAmmo, JSON.stringify(state)).toBe(true);
    });

    await test.step("buyer two purchases the weapon", async () => {
      const buyerTwoName = uniqueName("weapon-buyer");
      buyerTwoId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: buyerTwoName,
      });
      await expectSheetRendered(game, {
        collection: "actors",
        id: buyerTwoId,
      });
      await closeDocSheet(game, { collection: "actors", id: buyerTwoId });

      containerSheetId = await reopenActorSheetViaUI(game, containerActorId);
      await setTradePartnerWithWealth(game, containerSheetId, {
        partnerName: buyerTwoName,
        wealth: 999999,
      });

      await purchaseAllViaUI(game, containerSheetId, weaponName);

      await game.waitForFunction(
        ({ containerActorId, buyerTwoId, weaponName }) => {
          const container = game.actors.get(containerActorId);
          const buyer = game.actors.get(buyerTwoId);
          return (
            !container.items.some((i) => i.name === weaponName) &&
            buyer.items.some((i) => i.name === weaponName)
          );
        },
        { containerActorId, buyerTwoId, weaponName },
        { timeout: 10000 },
      );
    });

    await test.step("the purchased weapon has no dangling installed item references", async () => {
      const state = await game.evaluate(
        ({ buyerTwoId, weaponName }) => {
          const buyer = game.actors.get(buyerTwoId);
          const weapon = buyer.items.find((i) => i.name === weaponName);
          if (!weapon) return null;
          const list = weapon.system.installedItems.list;
          const ammo = buyer.items.get(list[0]);
          return {
            installedListLength: list.length,
            referencesResolve: list.every((ref) =>
              buyer.items.some((i) => i.id === ref),
            ),
            magazine: weapon.system.magazine.value,
            ammoAmount: ammo?.system.amount,
          };
        },
        { buyerTwoId, weaponName },
      );
      expect(state, "expected the weapon to have been purchased").toBeTruthy();
      expect(state.installedListLength, JSON.stringify(state)).toBe(1);
      expect(state.referencesResolve, JSON.stringify(state)).toBe(true);
      expect(state.magazine, JSON.stringify(state)).toBe(30);
      expect(state.ammoAmount, JSON.stringify(state)).toBe(0);
    });

    await closeDocSheet(game, { collection: "actors", id: characterActorId });
    await closeDocSheet(game, { collection: "actors", id: containerActorId });
  });
});
