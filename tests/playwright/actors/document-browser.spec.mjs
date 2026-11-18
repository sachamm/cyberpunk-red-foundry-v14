import { test as base, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import {
  browserRowByName,
  closeDocSheet,
  createActorViaUI,
  expectSheetRendered,
  openActorBrowser,
  openSidebarTab,
  readBrowserDragPayload,
  searchItems,
  uniqueName,
  waitForBrowserResultsSettled,
} from "../../../tools/playwright/ui/index.mjs";

const test = base.extend({
  playerPage: async ({ browser, baseURL }, use) => {
    const { context, page } = await openPlayerPage(browser, baseURL);
    await use(page);
    await context.close();
  },
});

test.describe("Document browser — actor mode", () => {
  test("launches the actor browser from the Actor directory for the GM, with no launch button for players", async ({
    page: game,
    playerPage: player,
  }) => {
    await gotoReadyWorld(game);
    const actorsTab = await openSidebarTab(game, "actors");
    const launch = actorsTab.locator('.cpr-browser-launch[data-mode="actor"]');
    await expect(launch).toBeVisible();
    await expect(launch).toContainText("Actor Browser");

    const documentBrowser = await openActorBrowser(game);
    await expect(documentBrowser).toBeVisible();

    await openSidebarTab(player, "actors");
    await expect(player.locator("#actors .cpr-browser-launch")).toHaveCount(0);
  });

  test("shows the item browser to all users and the actor browser to GMs only", async ({
    page: game,
    playerPage: player,
  }) => {
    await gotoReadyWorld(game);
    const gmMatrix = [
      ["actors", ["actor"]],
      ["items", ["item"]],
      ["compendium", ["item", "actor"]],
    ];
    for (const [tab, visibleModes] of gmMatrix) {
      const sidebar = await openSidebarTab(game, tab);
      for (const mode of ["item", "actor"]) {
        const button = sidebar.locator(
          `.cpr-browser-launch[data-mode="${mode}"]`,
        );
        if (visibleModes.includes(mode)) {
          await expect(button).toBeVisible();
        } else {
          await expect(button).toHaveCount(0);
        }
      }
    }

    for (const tab of ["items", "compendium"]) {
      const sidebar = await openSidebarTab(player, tab);
      await expect(
        sidebar.locator('.cpr-browser-launch[data-mode="item"]'),
      ).toBeVisible();
      await expect(
        sidebar.locator('.cpr-browser-launch[data-mode="actor"]'),
      ).toHaveCount(0);
    }
  });

  test("renders actor mode with one filter box per actor type and no item-only surfaces", async ({
    page: game,
  }) => {
    await gotoReadyWorld(game);
    const documentBrowser = await openActorBrowser(game);

    // Foundry prefixes the window title with the system name.
    await expect(documentBrowser.locator(".window-title")).toContainText(
      "Document Browser",
    );
    // The name search is shared with item mode.
    await expect(
      documentBrowser.locator(".cpr-browser-name-input"),
    ).toBeVisible();
    // Item-only surfaces stay out of actor mode.
    await expect(
      documentBrowser.locator(".cpr-browser-global-filters"),
    ).toHaveCount(0);
    await expect(
      documentBrowser.locator(".cpr-browser-sidebar-price"),
    ).toHaveCount(0);

    const typeBoxes = documentBrowser.locator(".cpr-browser-typebox");
    await expect(typeBoxes).toHaveCount(5);
    const expected = [
      ["blackIce", "Black ICE"],
      ["character", "Character"],
      ["container", "Container"],
      ["demon", "Demon"],
      ["mook", "Mook (NPC)"],
    ];
    for (const [index, [type, label]] of expected.entries()) {
      const box = typeBoxes.nth(index);
      await expect(box).toHaveAttribute("data-type", type);
      await expect(box.locator(".cpr-browser-tree-type-label")).toHaveText(
        label,
      );
    }
    // Actor boxes carry no per-type sub-filters, so nothing to expand.
    await expect(
      documentBrowser.locator(".cpr-browser-typebox-toggle"),
    ).toHaveCount(0);
  });

  test("groups results by actor type and sorts rows by name within each group", async ({
    page: game,
  }) => {
    await gotoReadyWorld(game);
    const firstChar = uniqueName("sort", "aaa");
    const secondChar = uniqueName("sort", "bbb");
    const mookName = uniqueName("sort", "mmm");
    for (const [type, name] of [
      ["character", firstChar],
      ["character", secondChar],
      ["mook", mookName],
    ]) {
      const id = await createActorViaUI(game, { type, name });
      await closeDocSheet(game, { collection: "actors", id });
    }

    const documentBrowser = await openActorBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);

    // Group headers appear in CONFIG.Actor.dataModels key order.
    const groupOrder = await documentBrowser
      .locator(".cpr-browser-group-header")
      .evaluateAll((els) => els.map((el) => el.dataset.group));
    expect(groupOrder.indexOf("character")).toBeGreaterThanOrEqual(0);
    expect(groupOrder.indexOf("mook")).toBeGreaterThan(
      groupOrder.indexOf("character"),
    );

    const firstRow = browserRowByName(game, documentBrowser, firstChar);
    const secondRow = browserRowByName(game, documentBrowser, secondChar);
    await expect(firstRow).toHaveCount(1);
    await expect(secondRow).toHaveCount(1);
    await expect(firstRow).toHaveAttribute("data-group", "character");
    await expect(secondRow).toHaveAttribute("data-group", "character");
    const mookRow = browserRowByName(game, documentBrowser, mookName);
    await expect(mookRow).toHaveCount(1);
    await expect(mookRow).toHaveAttribute("data-group", "mook");

    // Names sort ascending within a group.
    const nameOrder = await documentBrowser
      .locator(".cpr-browser-results-list > li.cpr-browser-entry")
      .evaluateAll((rows) =>
        rows.map(
          (row) =>
            row.querySelector(".item-header-name-text")?.textContent ?? "",
        ),
      );
    expect(nameOrder.indexOf(firstChar)).toBeGreaterThanOrEqual(0);
    expect(nameOrder.indexOf(firstChar)).toBeLessThan(
      nameOrder.indexOf(secondChar),
    );

    // Every result renders once loading settles.
    const countText = await documentBrowser
      .locator(".cpr-browser-result-count")
      .innerText();
    const match = countText.match(/Showing (\d+) of (\d+)/);
    expect(match).not.toBeNull();
    const shown = Number(match[1]);
    const total = Number(match[2]);
    expect(shown).toBe(total);
    expect(total).toBeGreaterThanOrEqual(3);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(
      total,
    );
  });

  test("a result row opens the actor sheet on click", async ({
    page: game,
  }) => {
    await gotoReadyWorld(game);
    const name = uniqueName("open");
    const id = await createActorViaUI(game, { type: "character", name });
    await closeDocSheet(game, { collection: "actors", id });

    const documentBrowser = await openActorBrowser(game);
    await searchItems(documentBrowser, name);
    const open = documentBrowser.locator(
      ".cpr-browser-entry .cpr-browser-entry-open",
    );
    await expect(open).toHaveCount(1);

    await open.click();
    await expectSheetRendered(game, { collection: "actors", id });
  });

  test("a result row opens its sheet via the keyboard", async ({
    page: game,
  }) => {
    await gotoReadyWorld(game);
    const name = uniqueName("kbopen");
    const id = await createActorViaUI(game, { type: "mook", name });
    await closeDocSheet(game, { collection: "actors", id });

    const documentBrowser = await openActorBrowser(game);
    await searchItems(documentBrowser, name);
    const open = documentBrowser.locator(
      ".cpr-browser-entry .cpr-browser-entry-open",
    );
    await expect(open).toHaveCount(1);

    await expect(open).toHaveAttribute("tabindex", "0");
    await open.focus();
    await open.press("Enter");
    await expectSheetRendered(game, { collection: "actors", id });
  });

  test("rows are draggable for the GM and carry an actor drag payload", async ({
    page: game,
  }) => {
    await gotoReadyWorld(game);
    const name = uniqueName("gmdrag");
    const id = await createActorViaUI(game, { type: "mook", name });
    await closeDocSheet(game, { collection: "actors", id });

    const documentBrowser = await openActorBrowser(game);
    await searchItems(documentBrowser, name);
    const row = documentBrowser.locator(".cpr-browser-entry");
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute("draggable", "true");
    await expect(row).toHaveAttribute("data-doc-class", "Actor");

    const payload = await readBrowserDragPayload(game);
    expect(JSON.parse(payload)).toMatchObject({
      type: "Actor",
      uuid: `Actor.${id}`,
    });
  });

  test("a non-GM requesting actor mode falls back to item mode", async ({
    playerPage: player,
  }) => {
    await player.evaluate(() => {
      new game.cpr.apps.CPRDocumentBrowser({ mode: "actor" }).render(true);
    });

    const documentBrowser = player.locator("#cpr-document-browser");
    await expect(documentBrowser).toBeVisible();
    // The sanitizer coerced the request back to item mode.
    await expect(
      documentBrowser.locator(".cpr-browser-global-filters"),
    ).toBeVisible();
    await expect(
      documentBrowser.locator(".cpr-browser-sidebar-price"),
    ).toBeVisible();
  });

  test("actor mode shows no cart or purchase controls", async ({
    page: game,
  }) => {
    await gotoReadyWorld(game);
    const name = uniqueName("noshop");
    const id = await createActorViaUI(game, { type: "mook", name });
    await closeDocSheet(game, { collection: "actors", id });

    const documentBrowser = await openActorBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    // Rows exist, so the absence of purchase controls below is not vacuous.
    const rowCount = await documentBrowser
      .locator(".cpr-browser-entry")
      .count();
    expect(rowCount).toBeGreaterThan(0);

    await expect(documentBrowser).not.toHaveClass(/cpr-browser-has-cart/);
    await expect(documentBrowser.locator(".cpr-browser-cart")).toBeHidden();
    await expect(documentBrowser.locator(".cpr-browser-buy")).toHaveCount(0);
  });
});
