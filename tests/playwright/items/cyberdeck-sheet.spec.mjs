import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeDocSheet,
  createItemViaUI,
  expectSheetRendered,
  openItemSettings,
  reopenItemSheetViaUI,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Cyberdeck sheet: the type-specific Settings surface — the "Configure
 * Installed Programs" wrench and the installed-programs list with a per-row
 * erase link. Two copy-semantics behaviours are pinned here as intended:
 *
 * - Installing through the wrench on a world deck is copy-based (cpr-container.js
 *   `installWorldItems` -> `Item.createDocuments`): the deck's `installedItems.list`
 *   holds ids of new copies, so the original program stays uninstalled and the
 *   dialog lists both the original (unchecked) and its same-named copy
 *   (pre-checked). Row assertions therefore anchor on checkbox value /
 *   data-item-id, never on name uniqueness.
 * - Erasing removes the id from the list and frees the slot but does NOT delete
 *   the copy document; it remains a world item, now uninstalled.
 * - Each installed program also renders in the generic container section's nested
 *   list (cpr-container.hbs -> cprNestedInstalledGearTab) with its own uninstall
 *   link; that section is owned by the container mixin specs, so type-partial row
 *   lookups require the erase link to sit inside `.setting-name` (see installedRows).
 *
 * The common/container/electronic/equippable/installable/physical/quality/
 * upgradable/valuable sections are owned by the composition and mixin specs; the
 * actor-side deck flows (drag/auto-equip, netspace program lists) live in the
 * mook/character gear specs. Other specs share this world run, so nothing below
 * counts world programs globally — every assertion is scoped to this test's own
 * deck and items (the only rows that can be pre-checked are this deck's copies).
 */

/** Create a world program through the UI, optionally setting its class. */
async function createProgram(page, { name, klass = null }) {
  const itemId = await createItemViaUI(page, { type: "program", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  if (klass) {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: klass,
    });
  }
  await closeDocSheet(page, { collection: "items", id: itemId });
  return itemId;
}

/**
 * The select-install-items dialog and the uninstall confirmation dialog both
 * render `input[name="selectedItems"]` checkboxes and are never open at the
 * same time, so one locator serves both.
 */
const itemsDialog = (page) =>
  page.locator(".application").filter({
    has: page.locator('input[name="selectedItems"]'),
  });

/** Click the programs wrench on an open settings tab and wait for the dialog. */
async function openInstallDialog(page, settings) {
  await settings.locator(".manage-installed-programs").click();
  const dialog = itemsDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The installed-program rows rendered by the cyberdeck type partial. The generic
 * container section renders a second, nested list of the same programs with its
 * own `.uninstall-single-item` links (see cpr-installed-tree.js); those rows have
 * no `.setting-name`, so requiring the erase link to sit inside one excludes them.
 */
const installedRows = (page, root) =>
  root.locator("li.item", {
    has: page.locator(".setting-name .uninstall-single-item"),
  });

const deckState = (page, deckId) =>
  page.evaluate((id) => {
    const deck = game.items.get(id);
    return {
      list: [...deck.system.installedItems.list],
      usedSlots: deck.system.installedItems.usedSlots,
    };
  }, deckId);

test("installing programs through Configure Installed Programs copies them into the deck", async ({
  page,
}) => {
  const deckName = uniqueName("cyberdeck");
  const deckId = await createItemViaUI(page, {
    type: "cyberdeck",
    name: deckName,
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: deckId,
  });

  const p1Name = uniqueName("program");
  const p2Name = uniqueName("program");
  const p1 = await createProgram(page, { name: p1Name, klass: "booster" });
  const p2 = await createProgram(page, { name: p2Name, klass: "blackice" });
  const rows = [
    { id: p1, name: p1Name, klass: "Booster" },
    { id: p2, name: p2Name, klass: "Black ICE" },
  ];

  let settings;
  await test.step("a fresh deck shows the wrench and no installed rows", async () => {
    settings = await openItemSettings(page, sheetId);
    const list = settings.locator(".item-settings-tab ol.items-list");
    const wrenchRow = list.locator("li.item", {
      has: page.locator(".manage-installed-programs"),
    });
    await expect(wrenchRow).toHaveCount(1);
    await expect(wrenchRow.locator(".manage-installed-programs")).toHaveText(
      /Configure Installed Programs/,
    );
    await expect(settings.locator(".uninstall-single-item")).toHaveCount(0);
  });

  let dialog;
  await test.step("the dialog lists the world programs unchecked with all seven slots free", async () => {
    dialog = await openInstallDialog(page, settings);
    await expect(dialog.locator(".dialog-header .text-normal")).toHaveText(
      `Select Program(s) to install in '${deckName}', Choomba`,
    );
    await expect(dialog.locator(".dialog-header .text-semi")).toHaveText(
      /Available Slots:\s*7\s*\/\s*7/,
    );
    const groupHeader = dialog.locator("li.dialog-item-header");
    await expect(groupHeader).toHaveCount(1);
    await expect(groupHeader).toContainText("Program");
    for (const { id, name, klass } of rows) {
      const row = dialog.locator("li.dialog-item", {
        has: page.locator(`input[name="selectedItems"][value="${id}"]`),
      });
      await expect(row).toHaveCount(1);
      await expect(row.locator(".dialog-item-name")).toContainText(
        `${name} (${klass})`,
      );
      await expect(
        row.locator('input[name="selectedItems"]'),
      ).not.toBeChecked();
    }
  });

  let copies;
  await test.step("checking both programs installs same-named copies and uses two slots", async () => {
    for (const { id } of rows) {
      await dialog
        .locator(`input[name="selectedItems"][value="${id}"]`)
        .check();
    }
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await page.waitForFunction((id) => {
      const deck = game.items.get(id);
      return (
        deck.system.installedItems.list.length === 2 &&
        deck.system.installedItems.usedSlots === 2
      );
    }, deckId);

    copies = await page.evaluate(
      ({ deckId, p1, p2 }) => {
        const list = game.items.get(deckId).system.installedItems.list;
        return {
          ids: [...list],
          originalsInstalled: [p1, p2].map(
            (programId) => game.items.get(programId).system.isInstalled,
          ),
          copies: list.map((id) => {
            const item = game.items.get(id);
            return {
              id,
              name: item.name,
              klass: item.system.class,
              size: item.system.size,
              installedIn: [...item.system.installedIn],
            };
          }),
        };
      },
      { deckId, p1, p2 },
    );

    // The deck holds copies, not the originals (installWorldItems -> Item.createDocuments).
    expect(copies.ids).toHaveLength(2);
    expect(copies.ids).not.toContain(p1);
    expect(copies.ids).not.toContain(p2);
    expect(copies.originalsInstalled).toEqual([false, false]);
    for (const copy of copies.copies) {
      expect(copy.size).toBe(1);
      expect(copy.installedIn).toEqual([deckId]);
    }
  });

  await test.step("the installed rows render name (class) with an erase link to the copy", async () => {
    await closeDocSheet(page, { collection: "items", id: deckId });
    settings = await openItemSettings(
      page,
      await reopenItemSheetViaUI(page, deckId),
    );
    const list = settings.locator(".item-settings-tab ol.items-list");
    const typeRows = installedRows(page, list);
    await expect(typeRows).toHaveCount(2);
    for (const { name, klass } of rows) {
      const copy = copies.copies.find((c) => c.name === name);
      const row = typeRows.filter({ hasText: `${name} (${klass})` });
      await expect(row).toHaveCount(1);
      await expect(row.locator(".uninstall-single-item")).toHaveAttribute(
        "data-item-id",
        copy.id,
      );
    }
  });

  await test.step("reopening the dialog lists originals and copies, with only the copies pre-checked", async () => {
    dialog = await openInstallDialog(page, settings);
    await expect(dialog.locator(".dialog-header .text-semi")).toHaveText(
      /Available Slots:\s*5\s*\/\s*7/,
    );
    for (const { id } of rows) {
      // The originals were never installed: still listed, still unchecked.
      const originalRow = dialog.locator("li.dialog-item", {
        has: page.locator(`input[name="selectedItems"][value="${id}"]`),
      });
      await expect(originalRow).toHaveCount(1);
      await expect(
        originalRow.locator('input[name="selectedItems"]'),
      ).not.toBeChecked();
    }
    for (const copy of copies.copies) {
      const row = dialog.locator("li.dialog-item", {
        has: page.locator(`input[name="selectedItems"][value="${copy.id}"]`),
      });
      await expect(row).toHaveCount(1);
      await expect(row.locator(".dialog-item-name")).toContainText(copy.name);
      await expect(row.locator('input[name="selectedItems"]')).toBeChecked();
    }
    // Only this deck's copies are pre-checked; nothing else in the world is installed here.
    const checkboxes = dialog.locator('input[name="selectedItems"]');
    const checkedCount = await checkboxes.evaluateAll(
      (inputs) => inputs.filter((input) => input.checked).length,
    );
    expect(checkedCount).toBe(2);
    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(dialog).toBeHidden();
  });
});

test("erasing an installed program frees its slot and leaves the copy in the world", async ({
  page,
}) => {
  const deckName = uniqueName("cyberdeck");
  const deckId = await createItemViaUI(page, {
    type: "cyberdeck",
    name: deckName,
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: deckId,
  });

  const programName = uniqueName("program");
  const programId = await createProgram(page, { name: programName });

  let settings;
  let copyId;
  await test.step("install the program through the wrench dialog", async () => {
    settings = await openItemSettings(page, sheetId);
    const dialog = await openInstallDialog(page, settings);
    await dialog
      .locator(`input[name="selectedItems"][value="${programId}"]`)
      .check();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await page.waitForFunction(
      (id) => game.items.get(id).system.installedItems.list.length === 1,
      deckId,
    );
    copyId = await page.evaluate(
      (id) => game.items.get(id).system.installedItems.list[0],
      deckId,
    );
    expect(copyId).not.toBe(programId);
  });

  await test.step("the installed row shows name (class) with an erase link", async () => {
    await closeDocSheet(page, { collection: "items", id: deckId });
    settings = await openItemSettings(
      page,
      await reopenItemSheetViaUI(page, deckId),
    );
    const list = settings.locator(".item-settings-tab ol.items-list");
    const row = installedRows(page, list);
    await expect(row).toHaveCount(1);
    await expect(row.locator(".setting-name")).toContainText(
      `${programName} (Defender)`,
    );
    await expect(row.locator(".uninstall-single-item")).toHaveAttribute(
      "data-item-id",
      copyId,
    );
  });

  let dialog;
  await test.step("the erase link opens the confirmation dialog with the deck pre-selected", async () => {
    const list = settings.locator(".item-settings-tab ol.items-list");
    await installedRows(page, list).locator(".uninstall-single-item").click();
    dialog = itemsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".dialog-header .text-normal")).toContainText(
      `uninstall ${programName} from`,
    );
    const deckRow = dialog.locator("li.dialog-item", {
      has: page.locator(`input[name="selectedItems"][value="${deckId}"]`),
    });
    await expect(deckRow).toHaveCount(1);
    await expect(deckRow.locator(".dialog-item-name")).toContainText(deckName);
    await expect(deckRow.locator(".dialog-item-detail")).toHaveText(
      /1\s*\/\s*7/,
    );
    await expect(deckRow.locator('input[name="selectedItems"]')).toBeChecked();
  });

  await test.step("cancelling leaves the program installed", async () => {
    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(dialog).toBeHidden();
    const state = await deckState(page, deckId);
    expect(state.list).toEqual([copyId]);
    expect(state.usedSlots).toBe(1);
    const list = settings.locator(".item-settings-tab ol.items-list");
    await expect(installedRows(page, list)).toHaveCount(1);
  });

  await test.step("confirming uninstalls and frees the slot", async () => {
    const list = settings.locator(".item-settings-tab ol.items-list");
    await installedRows(page, list).locator(".uninstall-single-item").click();
    dialog = itemsDialog(page);
    await expect(dialog).toBeVisible();
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    await page.waitForFunction((id) => {
      const deck = game.items.get(id);
      return (
        deck.system.installedItems.list.length === 0 &&
        deck.system.installedItems.usedSlots === 0
      );
    }, deckId);
  });

  await test.step("the sheet shows no installed rows and the copy is an uninstalled world item", async () => {
    await closeDocSheet(page, { collection: "items", id: deckId });
    settings = await openItemSettings(
      page,
      await reopenItemSheetViaUI(page, deckId),
    );
    await expect(settings.locator(".uninstall-single-item")).toHaveCount(0);
    const copy = await page.evaluate((id) => {
      const item = game.items.get(id);
      return item
        ? {
            name: item.name,
            type: item.type,
            isInstalled: item.system.isInstalled,
          }
        : null;
    }, copyId);
    expect(copy).toEqual({
      name: programName,
      type: "program",
      isInstalled: false,
    });
  });
});
