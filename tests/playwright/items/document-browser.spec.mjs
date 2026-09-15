import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  openSidebarTab,
  createDocumentViaUI,
  closeDocSheet,
  expectSheetRendered,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * UI-driven tests for the document browser (CPRDocumentBrowser) as the GM — the
 * browse-and-filter half of the feature. Each test explicitly navigates to the
 * ready world as the GM, then drives the document browser the way a user would:
 * launching it from the Item directory, typing in the search, toggling a type
 * box, and collapsing a result group. Assertions read game/DOM state but never
 * perform the action under test.
 *
 * The player-facing shop/cart half lives in document-browser-shop.spec.mjs (it needs a
 * non-GM user with an assigned Character, which this GM-only harness lacks).
 *
 * World items are created with unique names so a name search isolates them from
 * the (many) compendium entries the document browser also indexes, keeping the result
 * counts deterministic.
 */

// Launch the document browser in Item mode from the Item directory's footer
// button and wait for its results to start rendering.
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
  // The first batch (or the empty-state) has rendered, so listeners are wired.
  await expect(
    documentBrowser.locator(".cpr-browser-entry, .cpr-browser-empty").first(),
  ).toBeVisible();
  return documentBrowser;
}

// Click a tristate span until it reports the wanted state. Use this for setup
// where the final state matters more than how many clicks it took to reach it.
async function cycleTo(locator, target) {
  for (let i = 0; i < 4; i += 1) {
    if ((await locator.getAttribute("data-state")) === target) return;
    await locator.click();
  }
  await expect(locator).toHaveAttribute("data-state", target);
}

// Create a world upgrade item and retarget it to a specific upgradable item type.
async function createUpgrade(page, { name, targetType }) {
  const id = await createDocumentViaUI(page, {
    documentTab: "items",
    type: "itemUpgrade",
    name,
  });
  await page.evaluate(
    ({ id, targetType }) =>
      game.items.get(id).update({ "system.type": targetType }),
    { id, targetType },
  );
  await closeDocSheet(page, { collection: "items", id });
  return id;
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Document browser", () => {
  test("launches from the Item directory and renders its relocated price filter UI", async ({
    page: game,
  }) => {
    const documentBrowser = await openItemBrowser(game);
    await expect(
      documentBrowser.locator(".cpr-browser-name-input"),
    ).toBeVisible();

    const globalFilters = documentBrowser.locator(
      ".cpr-browser-global-filters",
    );
    const globalFields = globalFilters.locator(".cpr-browser-field");
    await expect(globalFilters).toBeVisible();
    await expect(globalFields).toHaveCount(3);
    await expect(globalFields.nth(0)).toContainText("Source");
    await expect(globalFields.nth(1)).toContainText("Quality");
    await expect(globalFields.nth(2)).toContainText("Category");
    await expect(globalFilters.locator(".cpr-browser-price-min")).toHaveCount(
      0,
    );
    await expect(globalFilters.locator(".cpr-browser-price-max")).toHaveCount(
      0,
    );

    const sidebarPrice = documentBrowser.locator(
      ".cpr-browser-sidebar .cpr-browser-sidebar-price",
    );
    const priceMin = sidebarPrice.locator(".cpr-browser-price-min");
    const priceMax = sidebarPrice.locator(".cpr-browser-price-max");
    const ammoTypeBox = documentBrowser.locator(
      '.cpr-browser-sidebar-scroll .cpr-browser-typebox[data-type="ammo"]',
    );
    await expect(sidebarPrice).toBeVisible();
    await expect(priceMin).toBeVisible();
    await expect(priceMax).toBeVisible();
    await expect(ammoTypeBox).toBeVisible();

    const sidebarOrder = await documentBrowser.evaluate((browser) => {
      const sidebar = browser.querySelector(".cpr-browser-sidebar");
      const sidebarChildren = sidebar ? [...sidebar.children] : [];
      const priceFieldset = sidebar?.querySelector(
        ".cpr-browser-sidebar-price",
      );
      const ammoFieldset = sidebar?.querySelector(
        '.cpr-browser-typebox[data-type="ammo"]',
      );
      return {
        priceIndex: sidebarChildren.findIndex((child) =>
          child.classList.contains("cpr-browser-sidebar-price"),
        ),
        scrollIndex: sidebarChildren.findIndex((child) =>
          child.classList.contains("cpr-browser-sidebar-scroll"),
        ),
        priceBeforeAmmo:
          Boolean(priceFieldset && ammoFieldset) &&
          Boolean(
            priceFieldset.compareDocumentPosition(ammoFieldset) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
      };
    });
    expect(sidebarOrder.priceIndex).toBeGreaterThanOrEqual(0);
    expect(sidebarOrder.scrollIndex).toBeGreaterThanOrEqual(0);
    expect(sidebarOrder.priceIndex).toBeLessThan(sidebarOrder.scrollIndex);
    expect(sidebarOrder.priceBeforeAmmo).toBe(true);
  });

  test("name search narrows to a matching item and opens it on click", async ({
    page: game,
  }) => {
    const name = uniqueName("gear");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(name);

    const entries = documentBrowser.locator(".cpr-browser-entry");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(name);

    // Clicking the row's open zone resolves and renders the item's sheet.
    await entries.first().locator(".cpr-browser-entry-open").click();
    await expectSheetRendered(game, { collection: "items", id: itemId });
  });

  test("a type box set to 'only' scopes results to that type", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("scope");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: `${nameTag} blade`,
    });
    await closeDocSheet(game, { collection: "items", id: weaponId });
    const gearId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name: `${nameTag} crate`,
    });
    await closeDocSheet(game, { collection: "items", id: gearId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(2);

    // First click now narrows the type box directly to "only".
    const weaponTristate = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="weapon"] .cpr-browser-tristate[data-tree="type"]',
    );
    await weaponTristate.click();
    await expect(weaponTristate).toHaveAttribute("data-state", "only");

    const entries = documentBrowser.locator(".cpr-browser-entry");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      `${nameTag} blade`,
    );
  });

  test("clearing a promoted sub-filter releases the auto-'only' type box", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("promote");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: `${nameTag} blade`,
    });
    // A known weaponType so its sub-filter option exists in the Weapon box.
    await game.evaluate(
      (id) => game.items.get(id).update({ "system.weaponType": "heavyMelee" }),
      weaponId,
    );
    await closeDocSheet(game, { collection: "items", id: weaponId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(1);

    // Expand the Weapon box so its sub-filters are interactable.
    const weaponBox = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="weapon"]',
    );
    await weaponBox.locator(".cpr-browser-collapse-toggle").first().click();

    const subFilter = weaponBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="weaponType"][data-value="heavyMelee"]',
    );
    const typeTristate = weaponBox.locator(
      '.cpr-browser-tristate[data-tree="type"]',
    );

    // First click now sets the sub-filter to "only", which auto-promotes the
    // box to "only" as well.
    await subFilter.click();
    await expect(subFilter).toHaveAttribute("data-state", "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");

    // The next click moves "only" -> "exclude". With no "only" sub-filter left,
    // a box we auto-promoted must fall back to "include", not stay stuck on
    // "only".
    await subFilter.click();
    await expect(subFilter).toHaveAttribute("data-state", "exclude");
    await expect(typeTristate).toHaveAttribute("data-state", "include");
  });

  test("a manually 'only' type box survives toggling one of its sub-filters", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("manual");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: `${nameTag} blade`,
    });
    await game.evaluate(
      (id) => game.items.get(id).update({ "system.weaponType": "heavyMelee" }),
      weaponId,
    );
    await closeDocSheet(game, { collection: "items", id: weaponId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(1);

    const weaponBox = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="weapon"]',
    );
    const typeTristate = weaponBox.locator(
      '.cpr-browser-tristate[data-tree="type"]',
    );

    // Put the box in the manual "only" state before touching any child filter.
    await cycleTo(typeTristate, "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");

    // Toggling a sub-filter must not undo a box the user set to "only" directly —
    // only an auto-promotion is reversible.
    const subFilter = weaponBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="weaponType"][data-value="heavyMelee"]',
    );
    await cycleTo(subFilter, "exclude");
    await expect(subFilter).toHaveAttribute("data-state", "exclude");
    await expect(typeTristate).toHaveAttribute("data-state", "only");
  });

  test("upgrade type filter stays stable, auto-promotes its parent, and orders upgrade rows by target type then name", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("upgrade-type");
    const expectedOrder = [
      `${nameTag} omega armor`,
      `${nameTag} zulu armor`,
      `${nameTag} alpha vehicle`,
      `${nameTag} yankee vehicle`,
      `${nameTag} beta weapon`,
    ];

    await createUpgrade(game, {
      name: expectedOrder[0],
      targetType: "armor",
    });
    await createUpgrade(game, {
      name: expectedOrder[1],
      targetType: "armor",
    });
    await createUpgrade(game, {
      name: expectedOrder[2],
      targetType: "vehicle",
    });
    await createUpgrade(game, {
      name: expectedOrder[3],
      targetType: "vehicle",
    });
    await createUpgrade(game, {
      name: expectedOrder[4],
      targetType: "weapon",
    });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);

    const entries = documentBrowser.locator(".cpr-browser-entry");
    await expect(entries).toHaveCount(expectedOrder.length);
    await expect(entries.locator(".item-header-name")).toHaveText(
      expectedOrder,
    );

    const itemUpgradeBox = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="itemUpgrade"]',
    );
    const typeTristate = itemUpgradeBox.locator(
      '.cpr-browser-tristate[data-tree="type"]',
    );
    await expect(typeTristate).toHaveAttribute("data-state", "include");
    await itemUpgradeBox.locator(".cpr-browser-collapse-toggle").click();

    const upgradeTypeFilter = itemUpgradeBox.locator(".cpr-browser-filter-sub");
    await expect(
      upgradeTypeFilter.locator(".cpr-browser-filter-sublabel"),
    ).toHaveText("Upgrade Type");
    await expect(
      upgradeTypeFilter.locator(".cpr-browser-tristate-label"),
    ).toHaveText([
      "Armor",
      "Clothing",
      "Cyberdeck",
      "Cyberware",
      "Gear",
      "Vehicle",
      "Weapon",
    ]);

    const armorOption = itemUpgradeBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="upgradeType"][data-value="armor"]',
    );
    const vehicleOption = itemUpgradeBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="upgradeType"][data-value="vehicle"]',
    );
    const clothingOption = itemUpgradeBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="upgradeType"][data-value="clothing"]',
    );
    await expect(armorOption).toBeVisible();
    await expect(vehicleOption).toBeVisible();
    await expect(clothingOption).toBeVisible();

    // Choosing a child as "only" must auto-promote the parent type box.
    await cycleTo(armorOption, "only");
    await expect(armorOption).toHaveAttribute("data-state", "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText(
      expectedOrder.slice(0, 2),
    );

    // The static option list must not shrink when one option is selected.
    await expect(armorOption).toBeVisible();
    await expect(vehicleOption).toBeVisible();
    await expect(clothingOption).toBeVisible();

    // Repro: Armor back to include, then Vehicle only, and Armor stays hidden.
    await cycleTo(armorOption, "include");
    await expect(armorOption).toHaveAttribute("data-state", "include");
    await expect(typeTristate).toHaveAttribute("data-state", "include");
    await expect(entries).toHaveCount(expectedOrder.length);

    await cycleTo(vehicleOption, "only");
    await expect(vehicleOption).toHaveAttribute("data-state", "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");
    await expect(armorOption).toBeVisible();
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText(
      expectedOrder.slice(2, 4),
    );
  });

  test("the sidebar price filter still applies both min and max bounds", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("price");
    const cheapName = `${nameTag} 1 cheap`;
    const midName = `${nameTag} 2 mid`;
    const dearName = `${nameTag} 3 dear`;
    const cheapId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name: cheapName,
    });
    await closeDocSheet(game, { collection: "items", id: cheapId });
    const midId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name: midName,
    });
    await closeDocSheet(game, { collection: "items", id: midId });
    const dearId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name: dearName,
    });
    await closeDocSheet(game, { collection: "items", id: dearId });

    // Distinct prices (setup, not the action under test).
    await game.evaluate(
      async ({ cheapId, midId, dearId }) => {
        await game.items.get(cheapId).update({ "system.price.market": 50 });
        await game.items.get(midId).update({ "system.price.market": 200 });
        await game.items.get(dearId).update({ "system.price.market": 500 });
      },
      { cheapId, midId, dearId },
    );

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);

    const entries = documentBrowser.locator(".cpr-browser-entry");
    const entryNames = entries.locator(".item-header-name");
    await expect(entries).toHaveCount(3);
    await expect(entryNames).toHaveText([cheapName, midName, dearName]);

    const minInput = documentBrowser.locator(
      ".cpr-browser-sidebar .cpr-browser-price-min",
    );
    await expect(minInput).toBeVisible();
    await minInput.fill("100");
    await minInput.blur();

    await expect(entries).toHaveCount(2);
    await expect(entryNames).toHaveText([midName, dearName]);

    const maxInput = documentBrowser.locator(
      ".cpr-browser-sidebar .cpr-browser-price-max",
    );
    await expect(maxInput).toBeVisible();
    await maxInput.fill("300");
    await maxInput.blur();

    await expect(entries).toHaveCount(1);
    await expect(entryNames).toHaveText([midName]);
  });

  test("a type box tri-state is keyboard operable (focus + Enter cycles it)", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("keys");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: `${nameTag} blade`,
    });
    await closeDocSheet(game, { collection: "items", id: weaponId });
    const gearId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name: `${nameTag} crate`,
    });
    await closeDocSheet(game, { collection: "items", id: gearId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(2);

    const weaponTristate = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="weapon"] .cpr-browser-tristate[data-tree="type"]',
    );
    // The toggle is reachable by keyboard...
    await expect(weaponTristate).toHaveAttribute("tabindex", "0");
    // ...and Enter cycles it the same way a click does (include -> only).
    await weaponTristate.focus();
    await weaponTristate.press("Enter");
    await expect(weaponTristate).toHaveAttribute("data-state", "only");

    const entries = documentBrowser.locator(".cpr-browser-entry");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      `${nameTag} blade`,
    );
  });

  test("a result row opens its sheet via the keyboard", async ({
    page: game,
  }) => {
    const name = uniqueName("kbopen");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(name);
    const open = documentBrowser.locator(
      ".cpr-browser-entry .cpr-browser-entry-open",
    );
    await expect(open).toHaveCount(1);

    // The row-open control is focusable and activates on Enter (no mouse).
    await expect(open).toHaveAttribute("tabindex", "0");
    await open.focus();
    await open.press("Enter");
    await expectSheetRendered(game, { collection: "items", id: itemId });
  });

  test("rows are draggable for the GM and carry an item drag payload", async ({
    page: game,
  }) => {
    const name = uniqueName("gmdrag");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(name);
    const row = documentBrowser.locator(".cpr-browser-entry[data-uuid]");
    await expect(row).toHaveCount(1);

    // GM rows are draggable and starting a drag writes the Foundry drop payload.
    await expect(row).toHaveAttribute("draggable", "true");
    const payload = await game.evaluate(() => {
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
    expect(JSON.parse(payload)).toMatchObject({ type: "Item" });
  });

  test("collapsing a result group hides its rows", async ({ page: game }) => {
    const name = uniqueName("collapse");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name,
    });
    await closeDocSheet(game, { collection: "items", id: itemId });

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(name);

    const entry = documentBrowser.locator(".cpr-browser-entry");
    await expect(entry).toHaveCount(1);
    await expect(entry.first()).toBeVisible();

    const header = documentBrowser.locator(
      '.cpr-browser-group-header[data-group="weapon"]',
    );
    await header.click();
    await expect(entry.first()).toBeHidden();

    await header.click();
    await expect(entry.first()).toBeVisible();
  });

  test("sizes installed-item type tags to their longest localized label", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("installed-width");
    const ammoHostName = `${nameTag} ammo host`;
    const cyberwareHostName = `${nameTag} cyberware host`;
    const ammoHostId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: ammoHostName,
    });
    await closeDocSheet(game, { collection: "items", id: ammoHostId });
    const ammoId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "ammo",
      name: uniqueName("installed-ammo"),
    });
    await closeDocSheet(game, { collection: "items", id: ammoId });
    const cyberwareHostId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "cyberware",
      name: cyberwareHostName,
    });
    await closeDocSheet(game, {
      collection: "items",
      id: cyberwareHostId,
    });
    const cyberwareId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "cyberware",
      name: uniqueName("installed-cyberware"),
    });
    await closeDocSheet(game, { collection: "items", id: cyberwareId });

    await game.evaluate(
      async ({ ammoHostId, ammoId, cyberwareHostId, cyberwareId }) => {
        await game.items
          .get(ammoHostId)
          .update({ "system.installedItems.list": [ammoId] });
        await game.items
          .get(cyberwareHostId)
          .update({ "system.installedItems.list": [cyberwareId] });
      },
      { ammoHostId, ammoId, cyberwareHostId, cyberwareId },
    );

    const documentBrowser = await openItemBrowser(game);
    await documentBrowser.locator(".cpr-browser-name-input").fill(nameTag);

    const ammoHost = documentBrowser.locator(".cpr-browser-entry").filter({
      has: game.getByText(ammoHostName, { exact: true }),
    });
    const cyberwareHost = documentBrowser.locator(".cpr-browser-entry").filter({
      has: game.getByText(cyberwareHostName, { exact: true }),
    });
    await expect(ammoHost).toHaveCount(1);
    await expect(cyberwareHost).toHaveCount(1);
    await ammoHost.locator(".cpr-browser-expand").click();

    const typeTags = documentBrowser.locator(
      ".cpr-browser-installed .type-tag",
    );
    await expect(typeTags).toHaveCount(1);
    await expect(typeTags).toHaveText(["Ammo"]);
    await expect
      .poll(async () =>
        typeTags.first().evaluate((tag) => ({
          fit: tag.scrollWidth <= tag.clientWidth,
          styleWidth: tag.style.width,
        })),
      )
      .toMatchObject({ fit: true, styleWidth: expect.stringMatching(/rem$/) });
    const ammoWidth = await typeTags
      .first()
      .evaluate((tag) => tag.getBoundingClientRect().width);

    await cyberwareHost.locator(".cpr-browser-expand").click();
    await expect(typeTags).toHaveCount(2);
    await expect(typeTags).toHaveText(["Cyberware", "Ammo"]);
    await expect
      .poll(async () =>
        typeTags.evaluateAll((tags, previousAmmoWidth) => {
          const widths = tags.map((tag) =>
            Number(tag.getBoundingClientRect().width.toFixed(2)),
          );
          const resizedAmmo = tags.find(
            (tag) => tag.textContent.trim() === "Ammo",
          );
          return {
            fit: tags.every((tag) => tag.scrollWidth <= tag.clientWidth),
            resized:
              resizedAmmo &&
              resizedAmmo.getBoundingClientRect().width > previousAmmoWidth,
            sized: tags.every((tag) => tag.style.width !== ""),
            uniform: new Set(widths).size === 1,
          };
        }, ammoWidth),
      )
      .toEqual({ fit: true, resized: true, sized: true, uniform: true });

    const expandedWidth = await typeTags
      .first()
      .evaluate((tag) => tag.getBoundingClientRect().width);
    await cyberwareHost.locator(".cpr-browser-expand").click();
    await expect(typeTags).toHaveCount(1);
    await expect(typeTags).toHaveText(["Ammo"]);
    await expect
      .poll(async () =>
        typeTags.first().evaluate(
          (tag, previousWidths) => ({
            fit: tag.scrollWidth <= tag.clientWidth,
            restored:
              Math.abs(
                tag.getBoundingClientRect().width - previousWidths.ammo,
              ) < 0.1,
            shrunk: tag.getBoundingClientRect().width < previousWidths.expanded,
          }),
          { ammo: ammoWidth, expanded: expandedWidth },
        ),
      )
      .toEqual({ fit: true, restored: true, shrunk: true });
  });
});
