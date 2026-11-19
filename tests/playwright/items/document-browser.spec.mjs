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
    await updateItemFields(game, [
      { id: weaponId, changes: { "system.weaponType": "heavyMelee" } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await searchItems(documentBrowser, nameTag);
    await expect(documentBrowser.locator(".cpr-browser-entry")).toHaveCount(1);

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

    await subFilter.click();
    await expect(subFilter).toHaveAttribute("data-state", "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");

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

    await cycleTo(typeTristate, "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");

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

    await cycleTo(armorOption, "only");
    await expect(armorOption).toHaveAttribute("data-state", "only");
    await expect(typeTristate).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText(
      expectedOrder.slice(0, 2),
    );

    await expect(armorOption).toBeVisible();
    await expect(vehicleOption).toBeVisible();
    await expect(clothingOption).toBeVisible();

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
    await expect(weaponTristate).toHaveAttribute("tabindex", "0");
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

    await priceMin.fill("200");
    await priceMin.blur();
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      crateName,
      gunName,
      rifleName,
    ]);

    await weaponTristate.click();
    await expect(weaponTristate).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      gunName,
      rifleName,
    ]);

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

    await updateItemFields(game, [
      { id: alphaId, changes: { "system.brand": brandAlpha } },
      { id: betaId, changes: { "system.brand": brandBeta } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);

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
    await expect(
      brandGroup.locator(".cpr-browser-tristate-row", {
        hasText: `${nameTag} Gamma`,
      }),
    ).toHaveCount(0);

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

    await qualitySelect.selectOption("");
    await expect(entries).toHaveCount(3);
  });

  test("price-category compare narrows results and stacks with the price range", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("price-category");
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
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      costlyName,
      everydayName,
      expensiveName,
    ]);

    await opSelect.selectOption("eq");
    await valueSelect.selectOption("costly");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      costlyName,
    );

    await opSelect.selectOption("gte");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      costlyName,
      expensiveName,
    ]);

    await opSelect.selectOption("lte");
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      costlyName,
      everydayName,
    ]);

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
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      implantName,
      weaponAName,
      weaponBName,
    ]);

    await cyberwareBox.locator(".cpr-browser-collapse-toggle").click();
    const isWeaponToggle = cyberwareBox.locator(
      '.cpr-browser-tristate[data-toggle="1"][data-filter="isWeapon"]',
    );

    await isWeaponToggle.click();
    await expect(isWeaponToggle).toHaveAttribute("data-state", "only");
    const nested = cyberwareBox.locator(".cpr-browser-toggle-nested");
    await expect(nested).toBeVisible();
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      weaponAName,
      weaponBName,
    ]);

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
    await expect(entries).toHaveCount(3);
    await expect(entries.locator(".item-header-name")).toHaveText([
      bodyName,
      bothName,
      headName,
    ]);

    await armorBox.locator(".cpr-browser-collapse-toggle").click();
    const bodyOption = armorBox.locator(
      '.cpr-browser-tristate[data-set="1"][data-filter="armorLocation"][data-value="body"]',
    );

    await bodyOption.click();
    await expect(bodyOption).toHaveAttribute("data-state", "only");
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      bodyName,
    );

    await cycleTo(bodyOption, "include");
    await expect(entries).toHaveCount(3);

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
    await expect(entries).toHaveCount(2);
    await expect(entries.locator(".item-header-name")).toHaveText([
      concealedName,
      twohandName,
    ]);

    await weaponBox.locator(".cpr-browser-collapse-toggle").click();

    const handsMin = weaponBox.locator(
      '.cpr-browser-range-min[data-filter="hands"]',
    );
    await handsMin.fill("2");
    await handsMin.blur();
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      twohandName,
    );

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

    await updateItemFields(game, [
      { id: hostId, changes: { "system.installedItems.list": [childId] } },
    ]);

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    await searchItems(documentBrowser, nameTag);
    const hostRow = browserRowByName(game, documentBrowser, hostName);
    const childRow = browserRowByName(game, documentBrowser, childName);
    await expect(hostRow).toHaveCount(1);
    await expect(childRow).toHaveCount(1);

    const expand = hostRow.locator(".cpr-browser-expand");
    await expect(expand).toBeVisible();
    await expect(childRow.locator(".cpr-browser-expand")).toHaveCount(0);

    await expand.click();
    const tree = documentBrowser.locator("li.cpr-browser-installed");
    await expect(tree).toHaveCount(1);
    const childEntry = tree.locator("li.item");
    await expect(childEntry).toHaveCount(1);
    await expect(childEntry.locator(".type-tag")).toHaveText("Cyberware");
    await expect(childEntry.locator(".item-view")).toContainText(childName);

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

    await tree.locator(".item-view").click();
    await expectSheetRendered(game, { collection: "items", id: childId });
  });

  test("excludes character-mechanic types and browser-ignored items from world and compendium sources", async ({
    page: game,
  }) => {
    const nameTag = uniqueName("excluded");
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
    await createCompendiumItem(game, { packId, name: packedName });

    const documentBrowser = await openItemBrowser(game);
    await waitForBrowserResultsSettled(documentBrowser);
    const entries = documentBrowser.locator(".cpr-browser-entry");
    await searchItems(documentBrowser, nameTag);
    await expect(entries).toHaveCount(1);
    await expect(entries.first().locator(".item-header-name")).toHaveText(
      packedName,
    );

    const settings = game.locator("#cpr-browser-compendia");
    await documentBrowser
      .locator('[data-action="openCompendiaSettings"]')
      .click();
    await expect(settings).toBeVisible();

    const packCheckbox = settings.locator(`input[data-pack-id="${packId}"]`);
    await expect(packCheckbox).toBeChecked();
    await packCheckbox.uncheck();
    await settings.locator('button[type="submit"]').click();
    await expect(settings).toHaveCount(0);

    await waitForBrowserResultsSettled(documentBrowser);
    await expect(entries).toHaveCount(0);
    await expect(documentBrowser.locator(".cpr-browser-empty")).toBeVisible();

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
