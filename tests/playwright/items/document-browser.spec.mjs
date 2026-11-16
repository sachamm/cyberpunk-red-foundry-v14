import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  browserRowByName,
  createCompendiumItem,
  createItemClosed,
  createItemCompendium,
  cycleTo,
  dismissNotifications,
  expectSheetRendered,
  openItemBrowser,
  readBrowserDragPayload,
  searchItems,
  uniqueName,
  updateItemFields,
  waitForBrowserResultsSettled,
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

// Create a world upgrade item and retarget it to a specific upgradable item type.
async function createUpgrade(page, { name, targetType }) {
  const id = await createItemClosed(page, { type: "itemUpgrade", name });
  await updateItemFields(page, [
    { id, changes: { "system.type": targetType } },
  ]);
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
    const itemId = await createItemClosed(game, { type: "gear", name });

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, name);

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
    await createItemClosed(game, {
      type: "weapon",
      name: `${nameTag} blade`,
    });
    await createItemClosed(game, {
      type: "gear",
      name: `${nameTag} crate`,
    });

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);
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
    const weaponId = await createItemClosed(game, {
      type: "weapon",
      name: `${nameTag} blade`,
    });
    // A known weaponType so its sub-filter option exists in the Weapon box.
    await updateItemFields(game, [
      { id: weaponId, changes: { "system.weaponType": "heavyMelee" } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);
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
    const weaponId = await createItemClosed(game, {
      type: "weapon",
      name: `${nameTag} blade`,
    });
    await updateItemFields(game, [
      { id: weaponId, changes: { "system.weaponType": "heavyMelee" } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);
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
    await searchItems(documentBrowser, nameTag);

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
    const cheapId = await createItemClosed(game, {
      type: "gear",
      name: cheapName,
    });
    const midId = await createItemClosed(game, {
      type: "gear",
      name: midName,
    });
    const dearId = await createItemClosed(game, {
      type: "gear",
      name: dearName,
    });

    // Distinct prices (setup, not the action under test).
    await updateItemFields(game, [
      { id: cheapId, changes: { "system.price.market": 50 } },
      { id: midId, changes: { "system.price.market": 200 } },
      { id: dearId, changes: { "system.price.market": 500 } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);

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
    await createItemClosed(game, {
      type: "weapon",
      name: `${nameTag} blade`,
    });
    await createItemClosed(game, {
      type: "gear",
      name: `${nameTag} crate`,
    });

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);
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
    const itemId = await createItemClosed(game, { type: "gear", name });

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, name);
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
    await createItemClosed(game, { type: "gear", name });

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, name);
    const row = documentBrowser.locator(".cpr-browser-entry[data-uuid]");
    await expect(row).toHaveCount(1);

    // GM rows are draggable and starting a drag writes the Foundry drop payload.
    await expect(row).toHaveAttribute("draggable", "true");
    const payload = await readBrowserDragPayload(game);
    expect(JSON.parse(payload)).toMatchObject({ type: "Item" });
  });

  test("collapsing a result group hides its rows", async ({ page: game }) => {
    const name = uniqueName("collapse");
    await createItemClosed(game, { type: "weapon", name });

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, name);

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
    const ammoHostId = await createItemClosed(game, {
      type: "weapon",
      name: ammoHostName,
    });
    const ammoId = await createItemClosed(game, {
      type: "ammo",
      name: uniqueName("installed-ammo"),
    });
    const cyberwareHostId = await createItemClosed(game, {
      type: "cyberware",
      name: cyberwareHostName,
    });
    const cyberwareId = await createItemClosed(game, {
      type: "cyberware",
      name: uniqueName("installed-cyberware"),
    });

    await updateItemFields(game, [
      { id: ammoHostId, changes: { "system.installedItems.list": [ammoId] } },
      {
        id: cyberwareHostId,
        changes: { "system.installedItems.list": [cyberwareId] },
      },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);

    const ammoHost = browserRowByName(game, documentBrowser, ammoHostName);
    const cyberwareHost = browserRowByName(
      game,
      documentBrowser,
      cyberwareHostName,
    );
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

  test("clear filters resets a mixed filter state and restores the full result count", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("clear-filters");
    const bladeName = `${nameTag} blade`;
    const gunName = `${nameTag} gun`;
    const rifleName = `${nameTag} rifle`;
    const crateName = `${nameTag} crate`;
    const bladeId = await createItemClosed(game, {
      type: "weapon",
      name: bladeName,
    });
    const gunId = await createItemClosed(game, {
      type: "weapon",
      name: gunName,
    });
    const rifleId = await createItemClosed(game, {
      type: "weapon",
      name: rifleName,
    });
    const crateId = await createItemClosed(game, {
      type: "gear",
      name: crateName,
    });

    // Distinct prices and qualities (setup, not the action under test) so every
    // filter below drops exactly one of the four world items. Only weapon and
    // cyberdeck carry a quality field, so the quality dimension uses weapons.
    await updateItemFields(game, [
      { id: bladeId, changes: { "system.price.market": 100 } },
      {
        id: gunId,
        changes: { "system.price.market": 450, "system.quality": "standard" },
      },
      {
        id: rifleId,
        changes: { "system.price.market": 300, "system.quality": "poor" },
      },
      { id: crateId, changes: { "system.price.market": 500 } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    const fullCount = await entries.count();
    // The world items sit on top of the indexed compendium content.
    expect(fullCount).toBeGreaterThan(4);

    const nameInput = documentBrowser.locator(".cpr-browser-name-input");
    const priceMin = documentBrowser.locator(
      ".cpr-browser-sidebar .cpr-browser-price-min",
    );
    const qualitySelect = documentBrowser.locator(".cpr-browser-quality");
    const weaponTristate = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="weapon"] .cpr-browser-tristate[data-tree="type"]',
    );

    await nameInput.fill(nameTag);
    await expect(entries).toHaveCount(4);

    // Price min drops the cheap blade; gear sorts before weapon by type order.
    await priceMin.fill("200");
    await priceMin.blur();
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      crateName,
      gunName,
      rifleName,
    ]);

    // Weapon-only drops the gear crate.
    await weaponTristate.click();
    await expect(weaponTristate).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      gunName,
      rifleName,
    ]);

    // Quality standard drops the poor rifle.
    await qualitySelect.selectOption("standard");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      gunName,
    );

    await documentBrowser.locator('[data-action="clearFilters"]').click();
    await waitForBrowserResultsSettled(documentBrowser);

    await expect(nameInput).toHaveValue("");
    await expect(priceMin).toHaveValue("");
    await expect(qualitySelect).toHaveValue("");
    await expect(weaponTristate).toHaveAttribute("data-state", "include");
    await expect(entries).toHaveCount(fullCount);
  });

  test("brand filter options are generated from indexed content and 'only' scopes results", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("brand");
    const alphaName = `${nameTag} alpha`;
    const betaName = `${nameTag} beta`;
    const brandAlpha = `${nameTag} Alpha`;
    const brandBeta = `${nameTag} Beta`;
    const alphaId = await createItemClosed(game, {
      type: "weapon",
      name: alphaName,
    });
    const betaId = await createItemClosed(game, {
      type: "weapon",
      name: betaName,
    });

    // Distinct tokenized brands (setup, not the action under test) so each is
    // guaranteed to be its own option in the generated brand list.
    await updateItemFields(game, [
      { id: alphaId, changes: { "system.brand": brandAlpha } },
      { id: betaId, changes: { "system.brand": brandBeta } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);

    // The brand group is a global dynamic filter: collapsed by default, with
    // one option per distinct non-empty brand across the indexed content.
    const brandGroup = documentBrowser.locator(
      'fieldset.cpr-browser-filter-tristate[data-filter-id="brand"]',
    );
    await expect(brandGroup).toHaveCount(1);
    await expect(brandGroup).toHaveClass(/cpr-browser-collapsed/);

    await brandGroup.locator('legend[data-collapse="brand"]').click();
    await expect(brandGroup).not.toHaveClass(/cpr-browser-collapsed/);

    const alphaOption = brandGroup.locator(".cpr-browser-tristate-row", {
      hasText: brandAlpha,
    });
    const betaOption = brandGroup.locator(".cpr-browser-tristate-row", {
      hasText: brandBeta,
    });
    await expect(alphaOption).toHaveCount(1);
    await expect(betaOption).toHaveCount(1);
    // A brand no indexed item carries is never offered as an option.
    await expect(
      brandGroup.locator(".cpr-browser-tristate-row", {
        hasText: `${nameTag} Gamma`,
      }),
    ).toHaveCount(0);

    // One click takes the tri-state to "only": results scope to that brand.
    const alphaTristate = alphaOption.locator(".cpr-browser-tristate");
    await alphaTristate.click();
    await expect(alphaTristate).toHaveAttribute("data-state", "only");

    const entries = documentBrowser.locator(".cpr-browser-entry");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      alphaName,
    );
  });

  test("quality filter narrows to a single quality and restores all on clear", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("quality");
    const stdName = `${nameTag} std`;
    const poorName = `${nameTag} poor`;
    const excellentName = `${nameTag} excel`;
    const stdId = await createItemClosed(game, {
      type: "weapon",
      name: stdName,
    });
    const poorId = await createItemClosed(game, {
      type: "weapon",
      name: poorName,
    });
    const excellentId = await createItemClosed(game, {
      type: "weapon",
      name: excellentName,
    });

    // One weapon per quality (setup, not the action under test). Only weapon
    // and cyberdeck carry a quality field, so the fixtures are weapons.
    await updateItemFields(game, [
      { id: stdId, changes: { "system.quality": "standard" } },
      { id: poorId, changes: { "system.quality": "poor" } },
      { id: excellentId, changes: { "system.quality": "excellent" } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    const qualitySelect = documentBrowser.locator(".cpr-browser-quality");

    await searchItems(documentBrowser, nameTag);
    // Within one type the rows sort by name: excel, poor, std.
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      excellentName,
      poorName,
      stdName,
    ]);

    for (const [value, name] of [
      ["poor", poorName],
      ["excellent", excellentName],
      ["standard", stdName],
    ]) {
      await qualitySelect.selectOption(value);
      await expect(entries).toHaveCount(1);
      await expect(entries.first().locator(".item-header-name")).toHaveText(
        name,
      );
    }

    // Clearing the select restores every quality.
    await qualitySelect.selectOption("");
    await expect(entries).toHaveCount(3);
  });

  test("price-category compare narrows results and stacks with the price range", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("price-category");
    // Market prices that land in three distinct categories (setup): 25 is
    // everyday, 75 is costly, 600 is expensive.
    const everydayName = `${nameTag} everyday`;
    const costlyName = `${nameTag} costly`;
    const expensiveName = `${nameTag} expensive`;
    const everydayId = await createItemClosed(game, {
      type: "gear",
      name: everydayName,
    });
    const costlyId = await createItemClosed(game, {
      type: "gear",
      name: costlyName,
    });
    const expensiveId = await createItemClosed(game, {
      type: "gear",
      name: expensiveName,
    });

    await updateItemFields(game, [
      { id: everydayId, changes: { "system.price.market": 25 } },
      { id: costlyId, changes: { "system.price.market": 75 } },
      { id: expensiveId, changes: { "system.price.market": 600 } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    const opSelect = documentBrowser.locator(".cpr-browser-price-category-op");
    const valueSelect = documentBrowser.locator(
      ".cpr-browser-price-category-value",
    );
    const priceMin = documentBrowser.locator(
      ".cpr-browser-sidebar .cpr-browser-price-min",
    );

    await searchItems(documentBrowser, nameTag);
    // Within one type the rows sort by name: costly, everyday, expensive.
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      costlyName,
      everydayName,
      expensiveName,
    ]);

    // "Equals costly" keeps only the costly-priced gear.
    await opSelect.selectOption("eq");
    await valueSelect.selectOption("costly");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      costlyName,
    );

    // "At least costly" keeps costly and everything pricier.
    await opSelect.selectOption("gte");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      costlyName,
      expensiveName,
    ]);

    // "At most costly" keeps costly and everything cheaper.
    await opSelect.selectOption("lte");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      costlyName,
      everydayName,
    ]);

    // The category compare stacks with the sidebar price range: "at least
    // costly" plus a 500 market floor leaves only the expensive gear.
    await opSelect.selectOption("gte");
    await priceMin.fill("500");
    await priceMin.blur();
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      expensiveName,
    );
  });

  test("cyberweapon toggle narrows to cyberweapons and exposes their weapon stat filters", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("cyberweapon");
    const weaponAName = `${nameTag} weaponA`;
    const weaponBName = `${nameTag} weaponB`;
    const implantName = `${nameTag} implant`;
    const weaponAId = await createItemClosed(game, {
      type: "cyberware",
      name: weaponAName,
    });
    const weaponBId = await createItemClosed(game, {
      type: "cyberware",
      name: weaponBName,
    });
    await createItemClosed(game, {
      type: "cyberware",
      name: implantName,
    });

    // Two cyberweapons with distinct rates of fire and one plain implant
    // (setup, not the action under test).
    await updateItemFields(game, [
      { id: weaponAId, changes: { "system.isWeapon": true, "system.rof": 5 } },
      { id: weaponBId, changes: { "system.isWeapon": true, "system.rof": 2 } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    const cyberwareBox = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="cyberware"]',
    );

    await searchItems(documentBrowser, nameTag);
    // Within one type the rows sort by name: implant, weaponA, weaponB.
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      implantName,
      weaponAName,
      weaponBName,
    ]);

    // The type box starts collapsed; expand it to reach the in-box filters.
    await cyberwareBox.locator(".cpr-browser-collapse-toggle").click();
    const isWeaponToggle = cyberwareBox.locator(
      '.cpr-browser-tristate[data-toggle="1"][data-filter="isWeapon"]',
    );

    // One click takes the toggle to "only": only cyberweapons match, and the
    // nested weapon-stat filters are revealed for them.
    await isWeaponToggle.click();
    await expect(isWeaponToggle).toHaveAttribute("data-state", "only");
    const nested = cyberwareBox.locator(".cpr-browser-toggle-nested");
    await expect(nested).toBeVisible();
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      weaponAName,
      weaponBName,
    ]);

    // The nested rof range narrows the cyberweapons by rate of fire.
    const rofMin = nested.locator('.cpr-browser-range-min[data-filter="rof"]');
    await rofMin.fill("4");
    await rofMin.blur();
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      weaponAName,
    );
  });

  test("armor location and SP filters narrow to the matching armor", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("armor");
    const bodyName = `${nameTag} body`;
    const headName = `${nameTag} head`;
    const bothName = `${nameTag} both`;
    await createItemClosed(game, {
      type: "armor",
      name: bodyName,
    });
    const headId = await createItemClosed(game, {
      type: "armor",
      name: headName,
    });
    const bothId = await createItemClosed(game, {
      type: "armor",
      name: bothName,
    });

    // Distinct location coverage and SPs (setup, not the action under test):
    // body keeps its 7-SP body default; head covers only the head at 9 SP;
    // both covers body (14 SP) and head (3 SP).
    await updateItemFields(game, [
      {
        id: headId,
        changes: {
          "system.isBodyLocation": false,
          "system.isHeadLocation": true,
          "system.headLocation.sp": 9,
        },
      },
      {
        id: bothId,
        changes: {
          "system.isHeadLocation": true,
          "system.bodyLocation.sp": 14,
          "system.headLocation.sp": 3,
        },
      },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    const armorBox = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="armor"]',
    );

    await searchItems(documentBrowser, nameTag);
    // Within one type the rows sort by name: body, both, head.
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      bodyName,
      bothName,
      headName,
    ]);

    // The type box starts collapsed; expand it to reach the in-box filters.
    await armorBox.locator(".cpr-browser-collapse-toggle").click();
    const bodyOption = armorBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="armorLocation"][data-value="body"]',
    );

    // "Only body" keeps the pure body piece — the body-and-head piece derives
    // as "both", not "body".
    await bodyOption.click();
    await expect(bodyOption).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      bodyName,
    );

    // Cycling the option back to include restores every armor.
    await cycleTo(bodyOption, "include");
    await expect(entries).toHaveCount(3);

    // The SP range matches any location the armor actually uses: only the
    // body-and-head piece has a used location at or above 10 SP.
    const spMin = armorBox.locator(
      '.cpr-browser-range-min[data-filter="armorSp"]',
    );
    await spMin.fill("10");
    await spMin.blur();
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      bothName,
    );
  });

  test("weapon hands range and concealable filter narrow to the matching weapon", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("weapon-filter");
    const concealedName = `${nameTag} concealed`;
    const twohandName = `${nameTag} twohand`;
    const concealedId = await createItemClosed(game, {
      type: "weapon",
      name: concealedName,
    });
    const twohandId = await createItemClosed(game, {
      type: "weapon",
      name: twohandName,
    });

    // One concealable one-handed weapon and one two-handed weapon (setup).
    await updateItemFields(game, [
      {
        id: concealedId,
        changes: {
          "system.handsReq": 1,
          "system.concealable.concealable": true,
        },
      },
      { id: twohandId, changes: { "system.handsReq": 2 } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    const weaponBox = documentBrowser.locator(
      '.cpr-browser-typebox[data-type="weapon"]',
    );

    await searchItems(documentBrowser, nameTag);
    // Within one type the rows sort by name: concealed, twohand.
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      concealedName,
      twohandName,
    ]);

    // The type box starts collapsed; expand it to reach the in-box filters.
    await weaponBox.locator(".cpr-browser-collapse-toggle").click();

    // A hands floor of 2 keeps only the two-handed weapon.
    const handsMin = weaponBox.locator(
      '.cpr-browser-range-min[data-filter="hands"]',
    );
    await handsMin.fill("2");
    await handsMin.blur();
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      twohandName,
    );

    // Clearing the range and asking for concealable weapons keeps only the
    // concealed one.
    await handsMin.fill("");
    await handsMin.blur();
    await expect(entries).toHaveCount(2);
    const concealableToggle = weaponBox.locator(
      '.cpr-browser-tristate[data-bool="1"][data-filter="concealable"]',
    );
    await concealableToggle.click();
    await expect(concealableToggle).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      concealedName,
    );
  });

  test("renders every indexed result once loading settles and shows an empty state for no matches", async ({
    page: game,
  }) => {
    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);

    // The browser appends rows in batches of 50; once settled it has rendered
    // the whole indexed set (the core compendia alone hold far more than one
    // batch), so the footer's shown/total agree and every row is present.
    const countText = await documentBrowser
      .locator(".cpr-browser-result-count")
      .innerText();
    const match = countText.match(/Showing (\d+) of (\d+)/);
    expect(match).not.toBeNull();
    const shown = Number(match[1]);
    const total = Number(match[2]);
    expect(shown).toBe(total);
    expect(total).toBeGreaterThan(50);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(
      total,
    );

    // A name nothing carries leaves the empty state and a zeroed footer.
    await searchItems(documentBrowser, uniqueName("no-such-item"));
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(0);
    await expect(documentBrowser.locator(".cpr-browser-empty")).toHaveText(
      "No matching documents.",
    );
    await expect(
      documentBrowser.locator(".cpr-browser-result-count"),
    ).toHaveText("Showing 0 of 0");
  });

  test("expands and collapses the installed-items tree under a result row", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("installed-tree");
    const hostName = `${nameTag} host`;
    const childName = `${nameTag} implant`;
    const hostId = await createItemClosed(game, {
      type: "cyberware",
      name: hostName,
    });
    const childId = await createItemClosed(game, {
      type: "cyberware",
      name: childName,
    });

    // Install the child in the host (setup, not the action under test).
    await updateItemFields(game, [
      { id: hostId, changes: { "system.installedItems.list": [childId] } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    await searchItems(documentBrowser, nameTag);
    // Within one type the rows sort by name: host, implant.
    const hostRow = browserRowByName(game, documentBrowser, hostName);
    const childRow = browserRowByName(game, documentBrowser, childName);
    await expect(hostRow).toHaveCount(1);
    await expect(childRow).toHaveCount(1);

    // Only the host has installed items, so only its row gets an expand
    // control.
    const expand = hostRow.locator(".cpr-browser-expand");
    await expect(expand).toBeVisible();
    await expect(childRow.locator(".cpr-browser-expand")).toHaveCount(0);

    // Expanding reveals the installed tree with the child's type tag and name.
    await expand.click();
    const tree = documentBrowser.locator("li.cpr-browser-installed");
    await expect(tree).toHaveCount(1);
    const childEntry = tree.locator("li.item");
    await expect(childEntry).toHaveCount(1);
    await expect(childEntry.locator(".type-tag")).toHaveText("Cyberware");
    await expect(childEntry.locator(".item-view")).toContainText(childName);

    // Collapsing removes the tree again.
    await expand.click();
    await expect(tree).toHaveCount(0);
  });

  test("opens the sheet of an installed item from its tree entry", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("installed-open");
    const hostName = `${nameTag} weapon`;
    const childName = `${nameTag} upgrade`;
    const hostId = await createItemClosed(game, {
      type: "weapon",
      name: hostName,
    });
    const childId = await createUpgrade(game, {
      name: childName,
      targetType: "weapon",
    });

    // Load the upgrade into the weapon (setup, not the action under test).
    await updateItemFields(game, [
      { id: hostId, changes: { "system.installedItems.list": [childId] } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    await searchItems(documentBrowser, nameTag);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(2);

    const hostRow = browserRowByName(game, documentBrowser, hostName);
    await hostRow.locator(".cpr-browser-expand").click();
    const tree = documentBrowser.locator("li.cpr-browser-installed");
    await expect(tree).toHaveCount(1);
    await expect(tree.locator(".type-tag")).toHaveText("Upgrade");

    // Clicking the installed item's name opens its world sheet.
    await tree.locator(".item-view").click();
    await expectSheetRendered(game, { collection: "items", id: childId });
  });

  test("excludes character-mechanic types and browser-ignored items from world and compendium sources", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("excluded");
    // World documents of every excluded type, plus a visible gear and a gear
    // that opts out of the browser (setup, not the action under test).
    await createItemClosed(game, {
      type: "skill",
      name: `${nameTag} skill`,
    });
    await createItemClosed(game, {
      type: "criticalInjury",
      name: `${nameTag} injury`,
    });
    await createItemClosed(game, {
      type: "role",
      name: `${nameTag} role`,
    });
    const normalName = `${nameTag} normal`;
    await createItemClosed(game, {
      type: "gear",
      name: normalName,
    });
    const ignoredId = await createItemClosed(game, {
      type: "gear",
      name: `${nameTag} ignored`,
    });
    await updateItemFields(game, [
      { id: ignoredId, changes: { "system.ignoredByBrowser": true } },
    ]);

    // A compendium with the same exclusions: an opted-out gear and a skill.
    const { id: packId } = await createItemCompendium(game, "E2E excluded");
    await createCompendiumItem(game, {
      packId,
      name: `${nameTag} packed-ignored`,
      fields: { "system.ignoredByBrowser": true },
    });
    await createCompendiumItem(game, {
      packId,
      name: `${nameTag} packed-skill`,
      type: "skill",
    });

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");

    // Only the plain world gear survives: excluded types and opted-out items
    // are dropped from both the world and compendium sources.
    await searchItems(documentBrowser, nameTag);
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      normalName,
    );
  });

  test("GM can disable and re-enable a compendium in the browser via the settings menu", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("compendia-settings");
    const packedName = `${nameTag} packed`;
    const { id: packId } = await createItemCompendium(
      game,
      "E2E compendia settings",
    );
    // Seed the pack; the helper deletes the staging world item afterwards so
    // only the compendium entry carries the name.
    await createCompendiumItem(game, { packId, name: packedName });

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    await searchItems(documentBrowser, nameTag);
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      packedName,
    );

    // The GM-only gear opens the compendia settings window.
    const settings = game.locator("#cpr-browser-compendia");
    await documentBrowser
      .locator('[data-action="openCompendiaSettings"]')
      .click();
    await expect(settings).toBeVisible();

    // Disabling the pack removes its entries from the browser.
    const packCheckbox = settings.locator(`input[data-pack-id="${packId}"]`);
    await expect(packCheckbox).toBeChecked();
    await packCheckbox.uncheck();
    await settings.locator('button[type="submit"]').click();
    // Saving closes the window.
    await expect(settings).toHaveCount(0);

    await waitForBrowserResultsSettled(documentBrowser);
    await expect(entries).toHaveCount(0);
    await expect(documentBrowser.locator(".cpr-browser-empty")).toBeVisible();

    // Re-enabling the pack brings its entries back.
    await dismissNotifications(game);
    await documentBrowser
      .locator('[data-action="openCompendiaSettings"]')
      .click();
    await expect(settings).toBeVisible();
    const reopenedCheckbox = settings.locator(
      `input[data-pack-id="${packId}"]`,
    );
    await expect(reopenedCheckbox).not.toBeChecked();
    await reopenedCheckbox.check();
    await settings.locator('button[type="submit"]').click();
    await expect(settings).toHaveCount(0);

    await waitForBrowserResultsSettled(documentBrowser);
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      packedName,
    );
  });
});
