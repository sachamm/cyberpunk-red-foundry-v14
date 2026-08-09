import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createItemViaUI,
  openSidebarTab,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * UI-driven tests for the document browser's source handling: the world vs.
 * compendium source line shown on each result row, the dedicated top-bar source
 * scope control, and the existing Source Book filter's cited-book semantics.
 *
 * Each test navigates to the ready world as the GM and drives the document
 * browser the way a user would. World items are created through the shared UI
 * helpers; temporary world compendia are created through Foundry's own API so
 * the browser can index both world and compendium sources in one run. Cleanup
 * removes every world item and temporary compendium after each test.
 */

let createdItemIds = [];
let createdPackIds = [];

// Launch the document browser in Item mode and wait for results to start rendering.
async function openItemBrowser(page) {
  await openSidebarTab(page, "items");
  const launch = page.locator('#items .cpr-browser-launch[data-mode="item"]');
  await expect(launch).toBeVisible();
  await launch.click();

  const documentBrowser = page.locator("#cpr-document-browser");
  await expect(documentBrowser).toBeVisible();
  await expect(
    documentBrowser.locator(".cpr-browser-results-list"),
  ).toBeVisible();
  await expect(
    documentBrowser.locator(".cpr-browser-entry, .cpr-browser-empty").first(),
  ).toBeVisible();
  return documentBrowser;
}

// Create a world gear item with a known name and `sources` array; return its id.
async function createGear(page, name, sources) {
  const id = await createItemViaUI(page, { type: "gear", name });
  createdItemIds.push(id);
  await page.evaluate(
    ({ id, sources }) =>
      game.items.get(id).update({ "system.sources": sources }),
    { id, sources },
  );
  await closeDocSheet(page, { collection: "items", id });
  return id;
}

// Create a temporary world item compendium so the browser can surface both
// world and compendium-backed results in one run.
async function createItemCompendium(page, label) {
  const name = `e2e-pack-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const pack = await page.evaluate(
    async ({ label, name }) => {
      const created = await globalThis.CompendiumCollection.createCompendium({
        label,
        name,
        type: "Item",
        package: game.world.id,
      });
      await created.configure({ locked: false });
      return { id: created.metadata.id, label: created.metadata.label };
    },
    { label, name },
  );
  createdPackIds.push(pack.id);
  return pack;
}

// Seed a compendium entry from a UI-created world item, then delete the staging
// world item so the browser only shows the compendium result for that name.
async function createCompendiumGear(page, { packId, name, sources }) {
  const stagingId = await createGear(page, name, sources);
  await page.evaluate(
    async ({ packId, itemId }) => {
      const pack = game.packs.get(packId);
      const item = game.items.get(itemId);
      await pack.importDocument(item);
      await item?.delete();
    },
    { packId, itemId: stagingId },
  );
  createdItemIds = createdItemIds.filter((id) => id !== stagingId);
}

// The result row whose name matches exactly one of our unique item names.
function rowByName(page, documentBrowser, name) {
  return documentBrowser.locator(".cpr-browser-entry").filter({
    has: page.locator(".item-header-name", { hasText: name }),
  });
}

// The "Source Book" filter fieldset and one of its book options (located by the
// book's label text so the test does not depend on how the value is encoded).
function bookFilter(documentBrowser) {
  return documentBrowser.locator(
    '.cpr-browser-filter-tristate[data-filter-id="book"]',
  );
}

function bookOption(documentBrowser, book) {
  return bookFilter(documentBrowser)
    .locator(".cpr-browser-tristate-row")
    .filter({ hasText: book })
    .locator(".cpr-browser-tristate");
}

// The new source-scope control lives in the globals bar as the first field,
// immediately before the existing Quality select.
function globalFilterFields(documentBrowser) {
  return documentBrowser.locator(
    ".cpr-browser-global-filters .cpr-browser-field",
  );
}

function sourceScopeControl(documentBrowser) {
  return globalFilterFields(documentBrowser).first().locator("select");
}

function qualityField(documentBrowser) {
  return globalFilterFields(documentBrowser).nth(1);
}

// A dynamic tristate fieldset may render collapsed; expand it so its options can
// be clicked. Idempotent - only expands when currently collapsed.
async function expandDynamicFilter(filter) {
  await expect(filter).toBeVisible();
  if (
    await filter.evaluate((el) =>
      el.classList.contains("cpr-browser-collapsed"),
    )
  ) {
    await filter.locator("legend").click();
  }
  await expect(
    filter.locator(".cpr-browser-tristate-row").first(),
  ).toBeVisible();
}

// Click a tristate span until it reports the wanted state. The control cycles
// through its states on repeated clicks, so a bounded loop reaches any of them.
async function cycleTo(locator, target) {
  for (let i = 0; i < 4; i += 1) {
    if ((await locator.getAttribute("data-state")) === target) return;
    await locator.click();
  }
  await expect(locator).toHaveAttribute("data-state", target);
}

test.beforeEach(async ({ page }) => {
  createdItemIds = [];
  createdPackIds = [];
  await gotoReadyWorld(page);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(
    async ({ itemIds, packIds }) => {
      for (const itemId of [...itemIds].reverse()) {
        const item = game.items.get(itemId);
        if (item) await item.delete();
      }
      for (const packId of [...packIds].reverse()) {
        const pack = game.packs.get(packId);
        if (pack) await pack.deleteCompendium();
      }
    },
    { itemIds: createdItemIds, packIds: createdPackIds },
  );
});

test.describe("Document browser - sources", () => {
  test("world and compendium rows keep the first source inline while secondary sources stay in the tooltip", async ({
    page: game,
  }) => {
    const token = uniqueName("cite");
    const nameB = `${token} bravo`;
    const nameEmpty = `${token} empty`;
    const packName = `${token} delta pack`;
    const packLabel = uniqueName("cite pack");
    // bravo cites two books (page > 0); the empty item has no sources at all.
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameEmpty, []);
    const pack = await createItemCompendium(game, packLabel);
    await createCompendiumGear(game, {
      packId: pack.id,
      name: packName,
      sources: [
        { book: "CCCBook", page: 17 },
        { book: "DDDBook", page: 42 },
      ],
    });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(3);

    // bravo's row prefixes the world origin and shows only its FIRST source inline.
    const bravoSource = rowByName(game, documentBrowser, nameB).locator(
      ".item-header-sources",
    );
    await expect(bravoSource).toHaveCount(1);
    await expect(bravoSource).toHaveText("World / BBBBook pg. 5");
    await expect(bravoSource).not.toContainText("AAABook");
    // The remaining source is carried in the hover tooltip.
    await expect(bravoSource).toHaveAttribute(
      "data-tooltip-html",
      "AAABook pg. 99",
    );

    const packSource = rowByName(game, documentBrowser, packName).locator(
      ".item-header-sources",
    );
    await expect(packSource).toHaveText("Compendium / CCCBook pg. 17");
    await expect(packSource).not.toContainText("DDDBook");
    await expect(packSource).toHaveAttribute(
      "data-tooltip-html",
      "DDDBook pg. 42",
    );

    // The item with an empty sources array shows only its origin and no tooltip.
    const emptySource = rowByName(game, documentBrowser, nameEmpty).locator(
      ".item-header-sources",
    );
    await expect(emptySource).toHaveText("World");
    await expect(emptySource).not.toHaveAttribute("data-tooltip-html");
  });

  test("origin labels use generic World and Compendium buckets for cited and uncited rows", async ({
    page: game,
  }) => {
    const token = uniqueName("origin-labels");
    const worldCited = `${token} world cited`;
    const worldUncited = `${token} world uncited`;
    const compendiumCited = `${token} pack cited`;
    const compendiumUncited = `${token} pack uncited`;
    const packLabel = uniqueName("origin pack");

    await test.step("create world and compendium items with cited and uncited sources", async () => {
      const pack = await createItemCompendium(game, packLabel);
      await createGear(game, worldCited, [{ book: "WorldBook", page: 12 }]);
      await createGear(game, worldUncited, []);
      await createCompendiumGear(game, {
        packId: pack.id,
        name: compendiumCited,
        sources: [{ book: "PackBook", page: 34 }],
      });
      await createCompendiumGear(game, {
        packId: pack.id,
        name: compendiumUncited,
        sources: [],
      });
    });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(4);

    await test.step("prefix world rows with World and keep book text after the slash", async () => {
      await expect(
        rowByName(game, documentBrowser, worldCited).locator(
          ".item-header-sources",
        ),
      ).toHaveText("World / WorldBook pg. 12");
      await expect(
        rowByName(game, documentBrowser, worldUncited).locator(
          ".item-header-sources",
        ),
      ).toHaveText("World");
    });

    await test.step("prefix compendium rows with generic Compendium text and omit empty book text", async () => {
      await expect(
        rowByName(game, documentBrowser, compendiumCited).locator(
          ".item-header-sources",
        ),
      ).toHaveText("Compendium / PackBook pg. 34");
      await expect(
        rowByName(game, documentBrowser, compendiumUncited).locator(
          ".item-header-sources",
        ),
      ).toHaveText("Compendium");
    });
  });

  test("source scope lives before Quality, offers Any/World/Compendium, hides the old Origin sidebar filter, and scopes rows by source kind", async ({
    page: game,
  }) => {
    const token = uniqueName("source-scope");
    const worldName = `${token} world`;
    const packName = `${token} pack`;
    const packLabel = uniqueName("source scope pack");

    await test.step("create one world result and one compendium result", async () => {
      const pack = await createItemCompendium(game, packLabel);
      await createGear(game, worldName, [{ book: "WorldFilterBook", page: 7 }]);
      await createCompendiumGear(game, {
        packId: pack.id,
        name: packName,
        sources: [{ book: "PackFilterBook", page: 9 }],
      });
    });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(2);

    await test.step("render the new source scope as the first top-bar control before Quality", async () => {
      await expect(qualityField(documentBrowser).locator("label")).toHaveText(
        "Quality",
      );
      await expect(sourceScopeControl(documentBrowser)).toHaveValue("any");
      await expect(
        sourceScopeControl(documentBrowser).locator("option"),
      ).toHaveText(["Any", "World", "Compendium"]);
    });

    await test.step("remove the old Origin sidebar filter", async () => {
      await expect(
        documentBrowser.locator(".cpr-browser-filter-tristate").filter({
          has: game.locator("legend", { hasText: "Origin" }),
        }),
      ).toHaveCount(0);
    });

    await test.step("filtering to World only hides the compendium result", async () => {
      await sourceScopeControl(documentBrowser).selectOption({
        label: "World",
      });
      await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(
        1,
      );
      await expect(rowByName(game, documentBrowser, worldName)).toBeVisible();
      await expect(rowByName(game, documentBrowser, packName)).toHaveCount(0);
    });

    await test.step("filtering to Compendium only hides the world result", async () => {
      await sourceScopeControl(documentBrowser).selectOption({
        label: "Compendium",
      });
      await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(
        1,
      );
      await expect(rowByName(game, documentBrowser, packName)).toBeVisible();
      await expect(rowByName(game, documentBrowser, worldName)).toHaveCount(0);
    });

    await test.step("clearing filters resets source scope to Any without assuming the narrowed search count persists", async () => {
      await documentBrowser
        .locator('button[data-action="clearFilters"]')
        .click();
      await expect(sourceScopeControl(documentBrowser)).toHaveValue("any");
      await expect(
        documentBrowser.locator(".cpr-browser-name-input"),
      ).toHaveValue("");
      await expect(rowByName(game, documentBrowser, worldName)).toBeVisible();
      await expect(rowByName(game, documentBrowser, packName)).toBeVisible();
    });
  });

  test("book filter 'only' still matches cited books across world and compendium results, including secondary sources", async ({
    page: game,
  }) => {
    const token = uniqueName("only");
    const nameA = `${token} alpha`;
    const nameB = `${token} bravo`;
    const nameC = `${token} charlie`;
    const packName = `${token} delta pack`;
    const packLabel = uniqueName("source book pack");
    // AAABook is alpha's sole source, bravo's SECOND source, and the compendium
    // entry's cited book. The filter should match by cited book, not by source kind.
    await createGear(game, nameA, [{ book: "AAABook", page: 10 }]);
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameC, [{ book: "CCCBook", page: 1 }]);
    const pack = await createItemCompendium(game, packLabel);
    await createCompendiumGear(game, {
      packId: pack.id,
      name: packName,
      sources: [{ book: "AAABook", page: 44 }],
    });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(4);

    await expandDynamicFilter(bookFilter(documentBrowser));
    await cycleTo(bookOption(documentBrowser, "AAABook"), "only");

    // alpha (primary), bravo (secondary), and the compendium entry all match;
    // charlie cites no AAABook and does not.
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(3);
    await expect(rowByName(game, documentBrowser, nameA)).toBeVisible();
    await expect(rowByName(game, documentBrowser, nameB)).toBeVisible();
    await expect(rowByName(game, documentBrowser, packName)).toBeVisible();
    await expect(rowByName(game, documentBrowser, nameC)).toHaveCount(0);
  });

  test("source scope composes with the Source Book filter without changing its tristate selection", async ({
    page: game,
  }) => {
    const token = uniqueName("scope-book");
    const worldName = `${token} world alpha`;
    const worldOther = `${token} world bravo`;
    const packName = `${token} pack alpha`;
    const packOther = `${token} pack bravo`;
    const packLabel = uniqueName("scope book pack");

    await createGear(game, worldName, [{ book: "AAABook", page: 10 }]);
    await createGear(game, worldOther, [{ book: "BBBBook", page: 5 }]);
    const pack = await createItemCompendium(game, packLabel);
    await createCompendiumGear(game, {
      packId: pack.id,
      name: packName,
      sources: [
        { book: "PackLeadBook", page: 2 },
        { book: "AAABook", page: 44 },
      ],
    });
    await createCompendiumGear(game, {
      packId: pack.id,
      name: packOther,
      sources: [{ book: "CCCBook", page: 7 }],
    });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(4);

    await expandDynamicFilter(bookFilter(documentBrowser));
    const aaabook = bookOption(documentBrowser, "AAABook");
    await cycleTo(aaabook, "only");
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(2);
    await expect(rowByName(game, documentBrowser, worldName)).toBeVisible();
    await expect(rowByName(game, documentBrowser, packName)).toBeVisible();

    await sourceScopeControl(documentBrowser).selectOption("world");
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(1);
    await expect(rowByName(game, documentBrowser, worldName)).toBeVisible();
    await expect(rowByName(game, documentBrowser, packName)).toHaveCount(0);
    await expect(aaabook).toHaveAttribute("data-state", "only");

    await sourceScopeControl(documentBrowser).selectOption("compendium");
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(1);
    await expect(rowByName(game, documentBrowser, packName)).toBeVisible();
    await expect(rowByName(game, documentBrowser, worldName)).toHaveCount(0);
    await expect(aaabook).toHaveAttribute("data-state", "only");

    await sourceScopeControl(documentBrowser).selectOption("any");
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(2);
    await expect(rowByName(game, documentBrowser, worldName)).toBeVisible();
    await expect(rowByName(game, documentBrowser, packName)).toBeVisible();
  });

  test("book filter 'exclude' hides every item that cites the book anywhere", async ({
    page: game,
  }) => {
    const token = uniqueName("excl");
    const nameA = `${token} alpha`;
    const nameB = `${token} bravo`;
    const nameC = `${token} charlie`;
    await createGear(game, nameA, [{ book: "AAABook", page: 10 }]);
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameC, [{ book: "CCCBook", page: 1 }]);

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(3);

    await expandDynamicFilter(bookFilter(documentBrowser));
    await cycleTo(bookOption(documentBrowser, "AAABook"), "exclude");

    // Both alpha and bravo cite AAABook (even as a secondary) -> both hidden.
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(1);
    await expect(rowByName(game, documentBrowser, nameC)).toBeVisible();
    await expect(rowByName(game, documentBrowser, nameA)).toHaveCount(0);
    await expect(rowByName(game, documentBrowser, nameB)).toHaveCount(0);
  });

  test("two books set to 'only' show items having EITHER (OR semantics)", async ({
    page: game,
  }) => {
    const token = uniqueName("or");
    const nameA = `${token} alpha`;
    const nameB = `${token} bravo`;
    const nameC = `${token} charlie`;
    await createGear(game, nameA, [{ book: "AAABook", page: 10 }]);
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameC, [{ book: "CCCBook", page: 1 }]);

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(token);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(3);

    await expandDynamicFilter(bookFilter(documentBrowser));
    await cycleTo(bookOption(documentBrowser, "AAABook"), "only");
    await cycleTo(bookOption(documentBrowser, "CCCBook"), "only");

    // AAABook OR CCCBook covers all three (alpha+bravo via AAABook, charlie via CCC).
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(3);
    await expect(rowByName(game, documentBrowser, nameA)).toBeVisible();
    await expect(rowByName(game, documentBrowser, nameB)).toBeVisible();
    await expect(rowByName(game, documentBrowser, nameC)).toBeVisible();
  });

  test("Refresh Index re-indexes edited items: a corrected field updates the row and filter without a reopen", async ({
    page: game,
  }) => {
    const name = uniqueName("misconfigured");
    // The user's scenario: an item created with the wrong source book, spotted
    // and corrected while the document browser is open.
    const wrongBook = uniqueName("WrongBook");
    const fixedBook = uniqueName("FixedBook");
    const id = await createGear(game, name, [{ book: wrongBook, page: 1 }]);

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(name);
    const row = rowByName(game, documentBrowser, name);
    await expect(row.locator(".item-header-sources")).toContainText(wrongBook);
    await expandDynamicFilter(bookFilter(documentBrowser));
    await expect(bookOption(documentBrowser, wrongBook)).toBeVisible();

    // Fix the misconfiguration on the item itself. The index tracks the edit in
    // its cache, but nothing re-renders the open document browser - row and filter
    // stay stale until a refresh.
    await game.evaluate(
      ({ id, fixedBook }) =>
        game.items
          .get(id)
          .update({ "system.sources": [{ book: fixedBook, page: 1 }] }),
      { id, fixedBook },
    );
    await expect(row.locator(".item-header-sources")).toContainText(wrongBook);

    // Refresh re-indexes all data and re-renders both results and sidebar: the
    // row now shows the corrected book and the filter list swaps wrong->fixed -
    // no close/reopen.
    await documentBrowser.locator('button[data-action="refreshIndex"]').click();
    await expect(row.locator(".item-header-sources")).toContainText(fixedBook);
    await expect(row.locator(".item-header-sources")).not.toContainText(
      wrongBook,
    );
    await expandDynamicFilter(bookFilter(documentBrowser));
    await expect(bookOption(documentBrowser, fixedBook)).toBeVisible();
    await expect(bookOption(documentBrowser, wrongBook)).toHaveCount(0);
  });
});
