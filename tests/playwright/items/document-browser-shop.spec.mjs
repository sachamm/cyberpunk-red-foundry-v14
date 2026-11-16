import { test as base, expect } from "@playwright/test";
import { PLAYER_NAME } from "../../../tools/playwright/config/harness-config.mjs";
import {
  gotoReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createActorViaUI,
  createCompendiumItem,
  createItemClosed,
  createItemCompendium,
  deleteItemViaUI,
  openItemBrowser,
  readBrowserDragPayload,
  searchItems,
  uniqueName,
  updateItemFields,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * UI-driven tests for the document browser's PLAYER shop/cart half (add to
 * cart, adjust quantity, checkout, and the insufficient-funds guard).
 *
 * Each test opens an explicit player page via the `playerPage` fixture: the
 * non-GM User with an assigned Character (game.user.character) that
 * globalSetup creates. The document browser only shows buy controls and a cart
 * for a player, and checkout spends that character's wealth. The player page
 * does not reset the world (that would delete the character), so each test sets
 * the wealth it needs and asserts relative (before/after).
 *
 * A few tests also need GM-side fixtures or assertions (a second owned
 * character, priced gear, a hidden compendium, the spare character's state):
 * those drive the default GM page for setup while the player page drives the
 * browser.
 */

const test = base.extend({
  // The harness player's page, closed after each test (see the file header).
  playerPage: async ({ browser, baseURL }, use) => {
    const { context, page } = await openPlayerPage(browser, baseURL);
    await use(page);
    await context.close();
  },
});

function parseDisplayedCurrency(valueText) {
  const numericText = valueText.replace(/[^\d.,-]/g, "").trim();
  const normalizedText =
    numericText.includes(",") && numericText.includes(".")
      ? numericText.lastIndexOf(",") > numericText.lastIndexOf(".")
        ? numericText.replace(/\./g, "").replace(",", ".")
        : numericText.replace(/,/g, "")
      : numericText.includes(",")
        ? /,\d{1,2}$/.test(numericText)
          ? numericText.replace(",", ".")
          : numericText.replace(/,/g, "")
        : numericText;
  const total = Number.parseFloat(normalizedText);
  expect(
    Number.isFinite(total),
    `Expected cart total to be parseable from "${valueText}"`,
  ).toBeTruthy();
  return total;
}

// Add the first priced item to the cart, returning the cart total (so tests can
// set wealth just above/below it). The price-min filter guarantees the bought
// item costs something, so the total is > 0.
async function addPricedItemToCart(documentBrowser) {
  const min = documentBrowser.locator(
    ".cpr-browser-sidebar .cpr-browser-price-min",
  );
  await expect(min).toBeVisible();
  await min.fill("1");
  await min.blur();
  await expect(
    documentBrowser.locator(".cpr-browser-buy").first(),
  ).toBeVisible();
  await documentBrowser.locator(".cpr-browser-buy").first().click();
  await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
    1,
  );
  const totalLabel = documentBrowser.locator(
    ".cpr-browser-cart-total .cpr-browser-cart-eb",
  );
  await expect(totalLabel).toHaveText(/\d/);
  const total = parseDisplayedCurrency(await totalLabel.innerText());
  expect(total).toBeGreaterThan(0);
  return total;
}

const setWealth = (page, value) =>
  page.evaluate(
    (v) => game.user.character.update({ "system.wealth.value": v }),
    value,
  );

const characterState = (page) =>
  page.evaluate(() => ({
    wealth: game.user.character.system.wealth.value,
    items: game.user.character.items.size,
  }));

// Confirms or declines the "Purchase" dialog that checkout raises; returns the
// dialog locator so callers can assert on its dismissal.
async function respondToPurchaseDialog(page, answer) {
  const dialog = page
    .locator(".application.dialog")
    .filter({ hasText: "Purchase" });
  await expect(dialog).toBeVisible();
  await dialog.locator(`button[data-action="${answer}"]`).click();
  return dialog;
}

test.describe("Document browser — player shop", () => {
  test("rows are not draggable for a player (no free drag-out, must buy)", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    const row = documentBrowser
      .locator(".cpr-browser-entry[data-uuid]")
      .first();
    await expect(row).toBeVisible();

    // In shop mode the rows are non-draggable and starting a drag writes no
    // payload, so a player can't copy an item onto a sheet for free.
    await expect(row).toHaveAttribute("draggable", "false");
    const payload = await readBrowserDragPayload(player);
    expect(payload).toBe("");
  });

  test("the sidebar minimum price filter stays active in shop mode", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    await expect(
      documentBrowser.locator(
        ".cpr-browser-global-filters .cpr-browser-price-min",
      ),
    ).toHaveCount(0);

    const min = documentBrowser.locator(
      ".cpr-browser-sidebar .cpr-browser-price-min",
    );
    const buyableRows = documentBrowser.locator(
      ".cpr-browser-entry:has(.cpr-browser-buy)",
    );
    await expect(min).toBeVisible();
    await expect(buyableRows.first()).toBeVisible();

    await min.fill("1000000");
    await min.blur();
    await expect(buyableRows).toHaveCount(0);

    await min.fill("");
    await min.blur();
    await expect(buyableRows.first()).toBeVisible();

    const rowToBuy = buyableRows.first();
    const itemName = (
      await rowToBuy.locator(".item-header-name").textContent()
    )?.trim();
    expect(itemName).toBeTruthy();
    await rowToBuy.locator(".cpr-browser-buy").click();

    const line = documentBrowser.locator(".cpr-browser-cart-item").first();
    await expect(line).toBeVisible();
    await expect(line.locator(".cpr-browser-cart-name")).toHaveText(itemName);
  });

  test("adds an item to the cart and adjusts its quantity", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });

    await documentBrowser.locator(".cpr-browser-buy").first().click();
    const line = documentBrowser.locator(".cpr-browser-cart-item").first();
    await expect(line).toBeVisible();
    await expect(line.locator(".cpr-browser-cart-qty-value")).toHaveText("1");

    await line.locator('.cpr-browser-cart-step[data-delta="1"]').click();
    await expect(line.locator(".cpr-browser-cart-qty-value")).toHaveText("2");

    await line.locator('.cpr-browser-cart-step[data-delta="-1"]').click();
    await expect(line.locator(".cpr-browser-cart-qty-value")).toHaveText("1");
  });

  test("the cart shows a buying-for selector defaulting to the player's character", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    await documentBrowser.locator(".cpr-browser-buy").first().click();
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      1,
    );

    // The cart names the actor the purchase will land on, so a player who owns
    // several actors can catch (or redirect) a buy onto the wrong character.
    const select = documentBrowser.locator(".cpr-browser-cart-actor-select");
    await expect(select).toBeVisible();
    const characterId = await player.evaluate(() => game.user.character.id);
    await expect(select).toHaveValue(characterId);
  });

  test("blocks checkout and keeps the cart when the character can't afford it", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    const total = await addPricedItemToCart(documentBrowser);
    // One eddie short of the total.
    await setWealth(player, total - 1);

    const before = await characterState(player);
    await documentBrowser.locator(".cpr-browser-cart-purchase").click();

    // A warning notification appears; the purchase does not go through.
    await expect(player.locator(".notification.warning")).toContainText(
      "enough eddies",
    );
    // The cart is left intact, wealth is unchanged, and nothing was added.
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      1,
    );
    expect(await characterState(player)).toEqual(before);
  });

  test("checkout spends wealth and adds the item to the character", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    const total = await addPricedItemToCart(documentBrowser);
    // Comfortably affordable.
    await setWealth(player, total + 1000);

    const before = await characterState(player);
    await documentBrowser.locator(".cpr-browser-cart-purchase").click();

    // Confirm the purchase dialog.
    await respondToPurchaseDialog(player, "yes");

    // The cart empties, the item is added, and wealth drops by the total.
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      0,
    );
    await expect
      .poll(() => player.evaluate(() => game.user.character.items.size))
      .toBe(before.items + 1);
    const after = await characterState(player);
    expect(after.wealth).toBe(before.wealth - total);
  });

  test("a player can redirect a purchase to another character they own", async ({
    page: game,
    playerPage: player,
  }) => {
    await gotoReadyWorld(game);
    // A second character owned by the player (setup, not the action under test).
    const spareId = await createActorViaUI(game, {
      type: "character",
      name: uniqueName("spare"),
    });
    await closeDocSheet(game, { collection: "actors", id: spareId });
    await game.evaluate(
      async ({ spareId, playerName }) => {
        const player = game.users.getName(playerName);
        await game.actors.get(spareId).update({
          [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        });
      },
      { spareId, playerName: PLAYER_NAME },
    );

    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    const total = await addPricedItemToCart(documentBrowser);

    // The assigned character is one eddie short; the spare can afford it.
    await setWealth(player, total - 1);
    await game.evaluate(
      ({ spareId, wealth }) =>
        game.actors.get(spareId).update({ "system.wealth.value": wealth }),
      { spareId, wealth: total + 1000 },
    );

    // The buying-for selector offers exactly the player's characters and
    // defaults to the assigned one.
    const select = documentBrowser.locator(".cpr-browser-cart-actor-select");
    await expect(select).toBeVisible();
    const characterId = await player.evaluate(() => game.user.character.id);
    await expect(select.locator("option")).toHaveCount(2);
    await expect(select).toHaveValue(characterId);

    // Redirecting the purchase to the spare charges the spare's wealth.
    await select.selectOption(spareId);
    const assignedBefore = await characterState(player);
    const spareState = (id) => {
      const actor = game.actors.get(id);
      return { wealth: actor.system.wealth.value, items: actor.items.size };
    };
    const spareBefore = await game.evaluate(spareState, spareId);

    await documentBrowser.locator(".cpr-browser-cart-purchase").click();
    await respondToPurchaseDialog(player, "yes");

    // The cart empties; the spare gains the item and loses its price, while
    // the assigned character is not charged.
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      0,
    );
    await expect
      .poll(() => game.evaluate(spareState, spareId))
      .toEqual({
        wealth: spareBefore.wealth - total,
        items: spareBefore.items + 1,
      });
    expect(await characterState(player)).toEqual(assignedBefore);
  });

  test("declining the purchase dialog keeps the cart and leaves the character untouched", async ({
    playerPage: player,
  }) => {
    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    const total = await addPricedItemToCart(documentBrowser);
    // Comfortably affordable, so the decline — not the funds check — is what
    // stops the purchase.
    await setWealth(player, total + 1000);

    const before = await characterState(player);
    await documentBrowser.locator(".cpr-browser-cart-purchase").click();

    // Declining the confirm dialog cancels the purchase.
    const dialog = await respondToPurchaseDialog(player, "no");
    await expect(dialog).toHaveCount(0);

    // The cart line is intact and the character is unchanged.
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      1,
    );
    expect(await characterState(player)).toEqual(before);
  });

  test("checkout skips deleted items and records the purchase in chat", async ({
    page: game,
    playerPage: player,
  }) => {
    await gotoReadyWorld(game);
    const nameTag = uniqueName("purchase-log");
    const keptName = `${nameTag} kept`;
    const doomedName = `${nameTag} doomed`;
    const keptId = await createItemClosed(game, {
      type: "gear",
      name: keptName,
    });
    const doomedId = await createItemClosed(game, {
      type: "gear",
      name: doomedName,
    });

    // Distinct prices (setup, not the action under test), plus visibility for
    // the harness player — world gear is private to its creator by default.
    const { playerId, limited } = await game.evaluate(
      (playerName) => ({
        playerId: game.users.getName(playerName).id,
        limited: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
      }),
      PLAYER_NAME,
    );
    const ownership = { default: 0, [playerId]: limited };
    await updateItemFields(game, [
      { id: keptId, changes: { "system.price.market": 100, ownership } },
      { id: doomedId, changes: { "system.price.market": 250, ownership } },
    ]);

    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    await searchItems(documentBrowser, nameTag);

    // Both tagged items are buyable; add each by its row.
    const entries = documentBrowser.locator(".cpr-browser-entry");
    await expect(entries).toHaveCount(2);
    for (const name of [doomedName, keptName]) {
      await entries
        .filter({ hasText: name })
        .locator(".cpr-browser-buy")
        .click();
    }
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      2,
    );

    // The doomed item is deleted after it was added to the cart.
    await deleteItemViaUI(game, doomedId);

    // Enough for both lines; only the surviving line should be charged.
    await setWealth(player, 1350);
    const before = await characterState(player);
    await documentBrowser.locator(".cpr-browser-cart-purchase").click();
    await respondToPurchaseDialog(player, "yes");

    // The cart empties, only the kept item is added, and only its price is
    // charged.
    await expect(documentBrowser.locator(".cpr-browser-cart-item")).toHaveCount(
      0,
    );
    await expect
      .poll(() => characterState(player))
      .toEqual({
        wealth: before.wealth - 100,
        items: before.items + 1,
      });

    // The purchase log message (new, or appended to an earlier one from this
    // run) records the kept item and not the deleted one.
    const { characterId, userId } = await player.evaluate(() => ({
      characterId: game.user.character.id,
      userId: game.user.id,
    }));
    const logContent = await player.waitForFunction(
      ({ characterId, userId, keptName }) => {
        for (const message of game.messages.contents) {
          const log = message.getFlag(game.system.id, "purchaseLog");
          if (!log || log.actorId !== characterId) continue;
          if (log.userId !== userId) continue;
          if (message.content.includes(keptName)) return message.content;
        }
        return false;
      },
      { characterId, userId, keptName },
      { timeout: 15000 },
    );
    const content = await logContent.jsonValue();
    expect(content).toContain(keptName);
    expect(content).not.toContain(doomedName);
  });

  test("players only see items they can view (world ownership and pack visibility)", async ({
    page: game,
    playerPage: player,
  }) => {
    await gotoReadyWorld(game);
    const nameTag = uniqueName("visibility");
    const openName = `${nameTag} open`;
    const hiddenName = `${nameTag} hidden`;
    const packedName = `${nameTag} packed`;

    // World gear: one shareable (LIMITED), one private (NONE). Unpriced on
    // purpose — this test is about visibility, not buying.
    const openId = await createItemClosed(game, {
      type: "gear",
      name: openName,
    });
    const hiddenId = await createItemClosed(game, {
      type: "gear",
      name: hiddenName,
    });
    const { playerId, limited } = await game.evaluate(
      (playerName) => ({
        playerId: game.users.getName(playerName).id,
        limited: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
      }),
      PLAYER_NAME,
    );
    await updateItemFields(game, [
      // Shareable with the harness player only.
      {
        id: openId,
        changes: { ownership: { default: 0, [playerId]: limited } },
      },
      // Private to everyone but the GM.
      { id: hiddenId, changes: { ownership: { default: 0 } } },
    ]);

    // A compendium entry in a pack the player can't see.
    const { id: packId } = await createItemCompendium(game, "E2E hidden pack");
    await createCompendiumItem(game, { packId, name: packedName });
    // v13 compendium visibility is role-based ownership — a fresh world
    // pack defaults to PLAYER OBSERVER, so deny every non-GM role.
    await game.evaluate(
      (packId) =>
        game.packs.get(packId).configure({
          ownership: {
            GAMEMASTER: "OWNER",
            ASSISTANT: "NONE",
            TRUSTED: "NONE",
            PLAYER: "NONE",
          },
        }),
      packId,
    );

    const documentBrowser = await openItemBrowser(player, {
      readySelector: ".cpr-browser-buy",
    });
    const entries = documentBrowser.locator(".cpr-browser-entry");

    // The shareable world item is the only one of the three visible.
    await searchItems(documentBrowser, nameTag);
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      openName,
    );

    // The private world item and the hidden pack's entry match nothing.
    await searchItems(documentBrowser, hiddenName);
    await expect(entries).toHaveCount(0);
    await expect(documentBrowser.locator(".cpr-browser-empty")).toBeVisible();

    await searchItems(documentBrowser, packedName);
    await expect(entries).toHaveCount(0);
    await expect(documentBrowser.locator(".cpr-browser-empty")).toBeVisible();
  });
});
