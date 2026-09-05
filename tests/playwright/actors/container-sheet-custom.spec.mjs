import { test, expect } from "@playwright/test";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  closeOwnedItemSheet,
  createDocumentViaUI,
  expectSheetRendered,
  openItemSettings,
  openOwnedItemSheet,
  openTokenSheet,
  reopenActorSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  configureContainerVendorViaUI,
  createContainerWithItem,
  createInventoryItemViaUI,
  enablePlayersCreateInventory,
  FIELD,
  installConsoleErrorHarness,
  purchaseAllViaUI,
  sellItemToContainerViaUI,
  setContainerFlagViaUI,
  setContainerTypeViaUI,
  setActorWealthViaUI,
  sheet,
  setTradePartnerWithWealth,
  waitForActorFields,
} from "./container-sheet-helpers.mjs";

installConsoleErrorHarness();

test.describe("Custom", () => {
  test("shows settings and configure shop link on token sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("custom-token-container"),
    });

    let sheetId = await openTokenSheet(game, actorId);

    await test.step("switch to custom container type", async () => {
      sheetId = await setContainerTypeViaUI(game, actorId, "custom");
    });

    await test.step("custom container shows custom settings section", async () => {
      const containerSheet = sheet(game, sheetId);
      const playersCanLabel = containerSheet.getByText("Can players:");
      await expect(playersCanLabel).toBeVisible();
    });

    await test.step("custom container shows player permission checkboxes", async () => {
      const containerSheet = sheet(game, sheetId);
      const checkboxes = containerSheet.locator(
        ".container-shop-settings .checkbox-toggle",
      );
      const count = await checkboxes.count();
      expect(count).toBeGreaterThan(0);
    });

    await test.step("shop container shows configure shop link", async () => {
      const containerSheet = sheet(game, sheetId);
      const configureLink = containerSheet.locator(FIELD.vendorConfigureLink);
      await expect(configureLink).toBeVisible();
    });

    await test.step("toggling infinite-stock on custom token sheet succeeds", async () => {
      await setContainerFlagViaUI(game, actorId, "infinite-stock");
    });

    await test.step("toggling items-free on custom token sheet succeeds", async () => {
      await setContainerFlagViaUI(game, actorId, "items-free");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("infinite-stock flag prevents item removal on purchase", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createContainerWithItem(game, {
      containerName: "infinite-stock-container",
      itemType: "gear",
    });

    await test.step("enable infinite stock on token sheet", async () => {
      await setContainerFlagViaUI(game, actorId, "infinite-stock");
    });

    await test.step("purchase item and verify it is NOT removed", async () => {
      const containerSheet = sheet(game, sheetId);

      await purchaseAllViaUI(game, sheetId, "New Gear");

      await game.waitForFunction(
        async (params) => {
          const actor = game.actors.get(params.actorId);
          if (!actor) return false;
          return actor.items.some((i) => i.name === "New Gear");
        },
        { actorId },
        { timeout: 5000 },
      );

      const remainingItems = containerSheet
        .locator(FIELD.itemName)
        .filter({ hasText: "New Gear" });
      await expect(remainingItems).toHaveCount(1);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("items-free flag prevents wealth deduction on purchase", async ({
    page: game,
  }) => {
    const { actorId } = await createContainerWithItem(game, {
      containerName: "free-items-container",
      itemType: "gear",
    });

    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    await test.step("switch to custom type and enable items-free", async () => {
      sheetId = await setContainerTypeViaUI(game, actorId, "custom");
      await setContainerFlagViaUI(game, actorId, "items-free");
    });

    await test.step("purchase item and verify trade partner wealth is unchanged", async () => {
      const tradePartnerId = await setTradePartnerWithWealth(game, sheetId);

      const tradePartnerWealthBefore = await game.evaluate(
        async ({ tradePartnerId }) => {
          const tradePartner = game.actors.get(tradePartnerId);
          return tradePartner?.system?.wealth?.value ?? 0;
        },
        { tradePartnerId },
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

      const tradePartnerWealthAfter = await game.evaluate(
        async ({ tradePartnerId }) => {
          const tradePartner = game.actors.get(tradePartnerId);
          return tradePartner?.system?.wealth?.value ?? 0;
        },
        { tradePartnerId },
      );

      expect(tradePartnerWealthAfter).toBe(tradePartnerWealthBefore);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("a player selling to a custom container receives the configured percentage of market price", async ({
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

    await test.step("create a gear item with market price 200 on the player character", async () => {
      const playerSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: playerActorId,
      });

      await createInventoryItemViaUI(game, {
        actorId: playerActorId,
        sheetId: playerSheetId,
        itemType: "gear",
        itemName: "Sellable Gear",
        data: { system: { "price.market": 200 } },
      });
    });

    const containerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("custom-compensation-container"),
    });

    await expectSheetRendered(game, {
      collection: "actors",
      id: containerActorId,
    });

    await test.step("configure container to buy gear at 75% of market price", async () => {
      await setContainerTypeViaUI(game, containerActorId, "custom");
      await configureContainerVendorViaUI(game, containerActorId, {
        itemType: "gear",
        purchasePercentage: 75,
      });
    });

    await test.step("give the container funds", async () => {
      await setActorWealthViaUI(game, containerActorId, 999999);
    });

    await test.step("sell item to container and verify 75% compensation (150)", async () => {
      const playerWealthBefore = await game.evaluate(
        async ({ playerActorId }) => {
          const player = game.actors.get(playerActorId);
          return player?.system?.wealth?.value ?? 0;
        },
        { playerActorId },
      );

      const containerWealthBefore = await game.evaluate(
        async ({ containerActorId }) => {
          const container = game.actors.get(containerActorId);
          return container?.system?.wealth?.value ?? 0;
        },
        { containerActorId },
      );

      const itemId = await game.evaluate(
        ({ playerActorId }) =>
          game.actors
            .get(playerActorId)
            .items.find((i) => i.name === "Sellable Gear")?.id ?? null,
        { playerActorId },
      );

      await sellItemToContainerViaUI(game, browser, baseURL, {
        containerActorId,
        characterActorId: playerActorId,
        itemId,
      });

      await waitForActorFields(game, playerActorId, {
        "system.wealth.value": playerWealthBefore + 150,
      });
      await waitForActorFields(game, containerActorId, {
        "system.wealth.value": containerWealthBefore - 150,
      });
    });

    await closeDocSheet(game, { collection: "actors", id: playerActorId });
    await closeDocSheet(game, { collection: "actors", id: containerActorId });
  });

  test("player permissions: create, delete, and modify items when flags are set", async ({
    page: game,
    browser,
    baseURL,
  }) => {
    const playerId = await game.evaluate(
      () => game.users.getName("E2E Player")?.id ?? null,
    );
    expect(playerId).toBeTruthy();

    const { context, page: player } = await openPlayerPage(browser, baseURL);
    await player.evaluate(async () => {
      await game.settings.set(game.system.id, "deleteItemConfirmation", false);
    });
    try {
      await test.step("player can create items when players-create flag is set", async () => {
        const createActorId = await createDocumentViaUI(game, {
          documentTab: "actors",
          type: "container",
          name: uniqueName("player-create-container"),
        });

        await setContainerTypeViaUI(game, createActorId, "custom");
        await setContainerFlagViaUI(game, createActorId, "players-create");
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            await actor.update({
              [`ownership.${params.playerId}`]:
                CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
            });
          },
          { actorId: createActorId, playerId },
        );

        const sheetId = await reopenActorSheetViaUI(player, createActorId);
        const { itemId } = await createInventoryItemViaUI(player, {
          actorId: createActorId,
          sheetId,
          itemType: "gear",
        });

        const createdName = await game.evaluate(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId)?.name ?? null,
          { actorId: createActorId, itemId },
        );
        expect(createdName).toBe("New Gear");

        await closeDocSheet(player, {
          collection: "actors",
          id: createActorId,
        });
        await closeDocSheet(game, {
          collection: "actors",
          id: createActorId,
        });
      });

      await test.step("player can delete items when players-delete flag is set", async () => {
        const deleteActorId = await createDocumentViaUI(game, {
          documentTab: "actors",
          type: "container",
          name: uniqueName("player-delete-container"),
        });

        const sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: deleteActorId,
        });

        const { itemId } = await createInventoryItemViaUI(game, {
          actorId: deleteActorId,
          sheetId,
          itemType: "gear",
          itemName: "Player-Deleted Item",
        });

        await setContainerTypeViaUI(game, deleteActorId, "custom");
        await setContainerFlagViaUI(game, deleteActorId, "players-delete");
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            await actor.update({
              [`ownership.${params.playerId}`]:
                CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
            });
          },
          { actorId: deleteActorId, playerId },
        );

        await closeDocSheet(game, {
          collection: "actors",
          id: deleteActorId,
        });

        const playerSheetId = await reopenActorSheetViaUI(
          player,
          deleteActorId,
        );
        const containerSheet = sheet(player, playerSheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "Player-Deleted Item" });
        await expect(itemRow).toBeVisible();

        const deleteLink = itemRow.locator(FIELD.deleteItem);
        await expect(deleteLink).toBeVisible();
        await deleteLink.click();

        await game.waitForFunction(
          ({ actorId, itemId }) => !game.actors.get(actorId)?.items.get(itemId),
          { actorId: deleteActorId, itemId },
          { timeout: 5000 },
        );

        await closeDocSheet(player, {
          collection: "actors",
          id: deleteActorId,
        });
      });

      await test.step("player can modify items when players-modify flag is set", async () => {
        const modifyActorId = await createDocumentViaUI(game, {
          documentTab: "actors",
          type: "container",
          name: uniqueName("player-modify-container"),
        });

        const sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: modifyActorId,
        });

        const { itemId } = await createInventoryItemViaUI(game, {
          actorId: modifyActorId,
          sheetId,
          itemType: "gear",
          itemName: "Player-Modified Item",
        });

        await setContainerTypeViaUI(game, modifyActorId, "custom");
        await setContainerFlagViaUI(game, modifyActorId, "players-modify");
        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            await actor.update({
              [`ownership.${params.playerId}`]:
                CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
            });
          },
          { actorId: modifyActorId, playerId },
        );

        await closeDocSheet(game, {
          collection: "actors",
          id: modifyActorId,
        });

        const playerSheetId = await reopenActorSheetViaUI(
          player,
          modifyActorId,
        );
        const containerSheet = sheet(player, playerSheetId);
        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "Player-Modified Item" });
        await expect(itemRow).toBeVisible();

        await itemRow.locator(FIELD.itemName).click();
        const itemSheetId = await openOwnedItemSheet(player, {
          actorId: modifyActorId,
          itemId,
        });
        const itemSheet = await openItemSettings(player, itemSheetId);
        const priceInput = itemSheet.locator(
          'input[name="system.price.market"]',
        );
        await expect(priceInput).toBeVisible();
        await priceInput.fill("750");
        await priceInput.blur();

        await game.waitForFunction(
          ({ actorId, itemId }) =>
            game.actors.get(actorId).items.get(itemId)?.system?.price
              ?.market === 750,
          { actorId: modifyActorId, itemId },
          { timeout: 5000 },
        );

        await closeOwnedItemSheet(player, { actorId: modifyActorId, itemId });
        await closeDocSheet(player, {
          collection: "actors",
          id: modifyActorId,
        });
      });

      await test.step("player without flags sees no create or delete controls", async () => {
        const lockedActorId = await createDocumentViaUI(game, {
          documentTab: "actors",
          type: "container",
          name: uniqueName("player-locked-container"),
        });

        const sheetId = await expectSheetRendered(game, {
          collection: "actors",
          id: lockedActorId,
        });

        await createInventoryItemViaUI(game, {
          actorId: lockedActorId,
          sheetId,
          itemType: "gear",
          itemName: "Locked Item",
        });

        await setContainerTypeViaUI(game, lockedActorId, "custom");

        await game.evaluate(
          async (params) => {
            const actor = game.actors.get(params.actorId);
            await actor.update({
              [`ownership.${params.playerId}`]:
                CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
            });
          },
          { actorId: lockedActorId, playerId },
        );

        await closeDocSheet(game, {
          collection: "actors",
          id: lockedActorId,
        });

        const playerSheetId = await reopenActorSheetViaUI(
          player,
          lockedActorId,
        );
        const containerSheet = sheet(player, playerSheetId);

        await expect(containerSheet.locator(FIELD.createButton)).toHaveCount(0);

        const itemRow = containerSheet
          .locator(".item.flexrow")
          .filter({ hasText: "Locked Item" });
        await expect(itemRow).toBeVisible();
        await expect(itemRow.locator(FIELD.deleteItem)).toHaveCount(0);

        await closeDocSheet(player, {
          collection: "actors",
          id: lockedActorId,
        });
      });
    } finally {
      await context.close();
    }
  });

  test("configuring which items a custom container buys updates its sheet", async ({
    page: game,
  }) => {
    const playerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("seller-actor"),
    });

    const containerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("buying-container"),
    });

    let containerSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: containerActorId,
    });

    await test.step("create a gear item on the container", async () => {
      const result = await createInventoryItemViaUI(game, {
        actorId: containerActorId,
        sheetId: containerSheetId,
        itemType: "gear",
        itemName: "Sellable Gear",
      });
      containerSheetId = result.sheetId;
    });

    await test.step("configure container to buy gear at 50%", async () => {
      await setContainerTypeViaUI(game, containerActorId, "custom");
      await configureContainerVendorViaUI(game, containerActorId, {
        itemType: "gear",
        purchasePercentage: 50,
      });
    });

    await test.step("verify container sheet renders with vendor configuration", async () => {
      const containerSheet = sheet(game, containerSheetId);
      const vendorSection = containerSheet.locator(FIELD.vendorConfigureLink);
      await expect(vendorSection).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: containerActorId });
    await closeDocSheet(game, { collection: "actors", id: playerActorId });
  });
});
