import { test, expect } from "@playwright/test";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";

/*
 * UI-driven tests for the document browser's PLAYER shop/cart half (add to cart,
 * adjust quantity, checkout, and the insufficient-funds guard).
 *
 * These open an explicit player page: the non-GM User with an assigned Character
 * (game.user.character) that globalSetup creates. The document browser only shows buy
 * controls and a cart for a player, and checkout spends that character's wealth.
 * The player page does not reset the world (that would delete the character),
 * so each test sets the wealth it needs and asserts relative (before/after).
 */

// Launch the document browser in Item mode from the Item directory's footer button.
// Players have no "create item" control, so activate the Items tab directly
// rather than via openSidebarTab (which waits for that GM-only button).
async function openItemBrowser(page) {
  const launch = page.locator('#items .cpr-browser-launch[data-mode="item"]');
  if (!(await launch.isVisible())) {
    await page.locator('#sidebar-tabs button[data-tab="items"]').click();
  }
  await expect(launch).toBeVisible();
  await launch.click();
  const documentBrowser = page.locator("#cpr-document-browser");
  await expect(documentBrowser).toBeVisible();
  await expect(
    documentBrowser.locator(".cpr-browser-buy").first(),
  ).toBeVisible();
  return documentBrowser;
}

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

test.describe("Document browser — player shop", () => {
  test("rows are not draggable for a player (no free drag-out, must buy)", async ({
    browser,
    baseURL,
  }) => {
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      const documentBrowser = await openItemBrowser(player);
      const row = documentBrowser
        .locator(".cpr-browser-entry[data-uuid]")
        .first();
      await expect(row).toBeVisible();

      // In shop mode the rows are non-draggable and starting a drag writes no
      // payload, so a player can't copy an item onto a sheet for free.
      await expect(row).toHaveAttribute("draggable", "false");
      const payload = await player.evaluate(() => {
        const el = document.querySelector(
          "#cpr-document-browser .cpr-browser-entry[data-uuid]",
        );
        const dt = new DataTransfer();
        el.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        return dt.getData("text/plain");
      });
      expect(payload).toBe("");
    } finally {
      await context.close();
    }
  });

  test("the sidebar minimum price filter stays active in shop mode", async ({
    browser,
    baseURL,
  }) => {
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      const documentBrowser = await openItemBrowser(player);
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
    } finally {
      await context.close();
    }
  });

  test("adds an item to the cart and adjusts its quantity", async ({
    browser,
    baseURL,
  }) => {
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      const documentBrowser = await openItemBrowser(player);

      await documentBrowser.locator(".cpr-browser-buy").first().click();
      const line = documentBrowser.locator(".cpr-browser-cart-item").first();
      await expect(line).toBeVisible();
      await expect(line.locator(".cpr-browser-cart-qty-value")).toHaveText("1");

      await line.locator('.cpr-browser-cart-step[data-delta="1"]').click();
      await expect(line.locator(".cpr-browser-cart-qty-value")).toHaveText("2");

      await line.locator('.cpr-browser-cart-step[data-delta="-1"]').click();
      await expect(line.locator(".cpr-browser-cart-qty-value")).toHaveText("1");
    } finally {
      await context.close();
    }
  });

  test("the cart shows a buying-for selector defaulting to the player's character", async ({
    browser,
    baseURL,
  }) => {
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      const documentBrowser = await openItemBrowser(player);
      await documentBrowser.locator(".cpr-browser-buy").first().click();
      await expect(
        documentBrowser.locator(".cpr-browser-cart-item"),
      ).toHaveCount(1);

      // The cart names the actor the purchase will land on, so a player who owns
      // several actors can catch (or redirect) a buy onto the wrong character.
      const select = documentBrowser.locator(".cpr-browser-cart-actor-select");
      await expect(select).toBeVisible();
      const characterId = await player.evaluate(() => game.user.character.id);
      await expect(select).toHaveValue(characterId);
    } finally {
      await context.close();
    }
  });

  test("blocks checkout and keeps the cart when the character can't afford it", async ({
    browser,
    baseURL,
  }) => {
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      const documentBrowser = await openItemBrowser(player);
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
      await expect(
        documentBrowser.locator(".cpr-browser-cart-item"),
      ).toHaveCount(1);
      expect(await characterState(player)).toEqual(before);
    } finally {
      await context.close();
    }
  });

  test("checkout spends wealth and adds the item to the character", async ({
    browser,
    baseURL,
  }) => {
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    try {
      const documentBrowser = await openItemBrowser(player);
      const total = await addPricedItemToCart(documentBrowser);
      // Comfortably affordable.
      await setWealth(player, total + 1000);

      const before = await characterState(player);
      await documentBrowser.locator(".cpr-browser-cart-purchase").click();

      // Confirm the purchase dialog.
      const dialog = player
        .locator(".application.dialog")
        .filter({ hasText: "Purchase" });
      await expect(dialog).toBeVisible();
      await dialog.locator('button[data-action="yes"]').click();

      // The cart empties, the item is added, and wealth drops by the total.
      await expect(
        documentBrowser.locator(".cpr-browser-cart-item"),
      ).toHaveCount(0);
      await expect
        .poll(() => player.evaluate(() => game.user.character.items.size))
        .toBe(before.items + 1);
      const after = await characterState(player);
      expect(after.wealth).toBe(before.wealth - total);
    } finally {
      await context.close();
    }
  });
});
