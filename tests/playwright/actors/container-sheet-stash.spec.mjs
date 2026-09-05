import { test, expect } from "@playwright/test";
import {
  activateGearTab,
  closeDocSheet,
  createDocumentViaUI,
  dragOwnedItemToActorSheet,
  expectSheetRendered,
  positionActorSheet,
  reopenActorSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createInventoryItemViaUI,
  createStashWithItem,
  enablePlayersCreateInventory,
  installConsoleErrorHarness,
  purchaseAllViaUI,
  setActorWealthViaUI,
  setContainerTypeViaUI,
  sheet,
  setTradePartnerWithWealth,
} from "./container-sheet-helpers.mjs";

installConsoleErrorHarness();

test.describe("Stash", () => {
  test("stash items show a take button instead of purchase", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createStashWithItem(game, {
      stashName: "stash-take-button",
      itemName: "Stash Item",
    });

    await test.step("stash container shows hand icon instead of cart icon", async () => {
      const containerSheet = sheet(game, sheetId);
      const itemRow = containerSheet
        .locator(".item.flexrow")
        .filter({ hasText: "Stash Item" });
      await expect(itemRow).toBeVisible();

      const takeBtn = itemRow.locator(
        'a.item-action[data-action-type="purchase"] i',
      );
      await expect(takeBtn).toBeVisible();
      await expect(takeBtn).toHaveClass(/fa-hand/);

      const purchaseBtn = itemRow.locator(
        'a.item-action[data-action-type="purchase"] i',
      );
      await expect(purchaseBtn).not.toHaveClass(/fa-cart-shopping/);
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("storing item in stash doesn't affect ledgers", async ({
    page: game,
  }) => {
    await enablePlayersCreateInventory(game);

    const playerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("stash-seller"),
    });

    let playerSheetId;
    let playerItemId;

    await test.step("create a gear item on the player character", async () => {
      ({ itemId: playerItemId, sheetId: playerSheetId } =
        await createInventoryItemViaUI(game, {
          actorId: playerActorId,
          sheetId: await expectSheetRendered(game, {
            collection: "actors",
            id: playerActorId,
          }),
          itemType: "gear",
          itemName: "Stash Seller Item",
        }));
    });

    const stashActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("stash-storage"),
    });

    await test.step("set up stash with player having initial wealth", async () => {
      await setContainerTypeViaUI(game, stashActorId, "stash");
      await setActorWealthViaUI(game, playerActorId, 500);
    });

    await test.step("move item into stash and verify no ledger changes", async () => {
      const initialData = await game.evaluate(
        async ({ playerActorId }) => {
          const player = game.actors.get(playerActorId);
          return {
            playerWealth: player.system.wealth.value,
            playerTransactions: player.system.wealth.transactions,
          };
        },
        { playerActorId },
      );

      const stashSheetId = await reopenActorSheetViaUI(game, stashActorId);
      playerSheetId = await reopenActorSheetViaUI(game, playerActorId);

      // The two sheets together are wider than the test viewport, so they
      // cannot sit fully side by side. Park the player sheet at the left
      // edge and the stash sheet at the right edge; the player sheet was
      // reopened last, so it sits in front and leaves a strip of the stash
      // sheet visible to receive the drop.
      const [playerBox, stashBox] = await Promise.all([
        game.locator(`#${playerSheetId}`).boundingBox(),
        game.locator(`#${stashSheetId}`).boundingBox(),
      ]);
      const viewportWidth = await game.evaluate(() => window.innerWidth);
      const playerLeft = 8;
      const stashLeft = Math.min(
        playerLeft + playerBox.width + 8,
        viewportWidth - stashBox.width - 8,
      );
      await positionActorSheet(game, {
        actorId: playerActorId,
        left: playerLeft,
        top: 8,
      });
      await positionActorSheet(game, {
        actorId: stashActorId,
        left: stashLeft,
        top: 8,
      });

      await dragOwnedItemToActorSheet(game, {
        sourceActorId: playerActorId,
        sourceSheetId: playerSheetId,
        itemId: playerItemId,
        targetActorId: stashActorId,
        targetSheetId: stashSheetId,
        requireUiDrag: true,
        // Drop on the part of the stash sheet not covered by the player
        // sheet; its center would be underneath.
        dropPosition: {
          x:
            (Math.max(stashLeft, playerLeft + playerBox.width) +
              (stashLeft + stashBox.width)) /
              2 -
            stashLeft,
          y: stashBox.height / 2,
        },
      });

      const stashAfterItem = await game.evaluate(
        async ({ stashActorId }) => {
          const stash = game.actors.get(stashActorId);
          if (!stash) return false;
          return stash.items.some((i) => i.name === "Stash Seller Item");
        },
        { stashActorId },
      );
      expect(stashAfterItem).toBe(true);

      const playerAfter = await game.evaluate(
        async ({ playerActorId }) => {
          const player = game.actors.get(playerActorId);
          return {
            playerWealth: player.system.wealth.value,
            playerTransactions: player.system.wealth.transactions,
          };
        },
        { playerActorId },
      );

      expect(playerAfter.playerWealth).toBe(initialData.playerWealth);
      expect(playerAfter.playerTransactions).toEqual(
        initialData.playerTransactions,
      );
    });

    await closeDocSheet(game, { collection: "actors", id: playerActorId });
    await closeDocSheet(game, { collection: "actors", id: stashActorId });
  });

  test("removing item from stash doesn't affect ledgers", async ({
    page: game,
  }) => {
    const playerName = uniqueName("stash-taker");
    const playerActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: playerName,
    });

    const stashActorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("stash-with-item"),
    });

    await test.step("set up stash with item and player with initial wealth", async () => {
      await setContainerTypeViaUI(game, stashActorId, "stash");
      await setActorWealthViaUI(game, playerActorId, 300);
      await closeDocSheet(game, { collection: "actors", id: playerActorId });

      let stashSheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: stashActorId,
      });

      ({ sheetId: stashSheetId } = await createInventoryItemViaUI(game, {
        actorId: stashActorId,
        sheetId: stashSheetId,
        itemType: "gear",
        itemName: "Stash Taker Item",
      }));
      await setTradePartnerWithWealth(game, stashSheetId, {
        partnerName: playerName,
        wealth: 300,
      });
    });

    await test.step("take item from stash and verify no ledger changes", async () => {
      const initialData = await game.evaluate(
        async ({ playerActorId }) => {
          const player = game.actors.get(playerActorId);
          return {
            playerWealth: player.system.wealth.value,
            playerTransactions: player.system.wealth.transactions,
          };
        },
        { playerActorId },
      );

      const stashSheetId = await reopenActorSheetViaUI(game, stashActorId);

      await purchaseAllViaUI(game, stashSheetId, "Stash Taker Item");

      await game.waitForFunction(
        ({ playerActorId, stashActorId }) => {
          const player = game.actors.get(playerActorId);
          const stash = game.actors.get(stashActorId);
          return (
            player.items.some((i) => i.name === "Stash Taker Item") &&
            !stash.items.some((i) => i.name === "Stash Taker Item")
          );
        },
        { playerActorId, stashActorId },
        { timeout: 10000 },
      );

      await closeDocSheet(game, { collection: "actors", id: stashActorId });
      const freshStashSheetId = await reopenActorSheetViaUI(game, stashActorId);
      await expect(
        sheet(game, freshStashSheetId)
          .locator(".item.flexrow")
          .filter({ hasText: "Stash Taker Item" }),
      ).toHaveCount(0);

      const playerSheetId = await reopenActorSheetViaUI(game, playerActorId);
      const gear = await activateGearTab(game, playerSheetId);
      await expect(
        gear.locator("li.item").filter({ hasText: "Stash Taker Item" }),
      ).toBeVisible();

      const playerAfter = await game.evaluate(
        async ({ playerActorId }) => {
          const player = game.actors.get(playerActorId);
          return {
            playerWealth: player.system.wealth.value,
            playerTransactions: player.system.wealth.transactions,
          };
        },
        { playerActorId },
      );

      expect(playerAfter.playerWealth).toBe(initialData.playerWealth);
      expect(playerAfter.playerTransactions).toEqual(
        initialData.playerTransactions,
      );
    });

    await closeDocSheet(game, { collection: "actors", id: playerActorId });
    await closeDocSheet(game, { collection: "actors", id: stashActorId });
  });
});
