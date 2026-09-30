import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  openItemSettings,
  openSidebarTab,
  reopenItemSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

const MALORIAN_NAME = "Malorian Arms 3516";
const CORE_WEAPONS_PACK = "cyberpunk-red-core.core_weapons";

let createdPackIds = [];
let importedFolderId;

async function createItemCompendium(page, label) {
  const name = `e2e-pack-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const packId = await page.evaluate(
    async ({ label, name }) => {
      const pack = await globalThis.CompendiumCollection.createCompendium({
        label,
        name,
        type: "Item",
        package: game.world.id,
      });
      await pack.configure({ locked: false });
      return pack.collection;
    },
    { label, name },
  );
  createdPackIds.push(packId);
  return packId;
}

async function seedMalorian(page, packId) {
  return page.evaluate(
    async ({ packId, sourcePackId, malorianName }) => {
      const sourcePack = game.packs.get(sourcePackId);
      const index = await sourcePack.getIndex({ fields: ["name"] });
      const sourceId = index.find((entry) => entry.name === malorianName)?._id;
      if (!sourceId) throw new Error(`${malorianName} was not found`);

      const source = await sourcePack.getDocument(sourceId);
      const destination = game.packs.get(packId);
      await destination.documentClass.createDocuments([source.toObject()], {
        pack: destination.collection,
        keepId: false,
      });
      const [installedItem] = source.getFlag(game.system.id, "cprInstallTree");
      return { name: installedItem.name, type: installedItem.type };
    },
    { packId, sourcePackId: CORE_WEAPONS_PACK, malorianName: MALORIAN_NAME },
  );
}

async function openContextMenu(page, locator) {
  await locator.click({ button: "right" });
  const menu = page.locator("#context-menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function expandItemFolder(page, folderId) {
  await openSidebarTab(page, "items");
  const folder = page.locator(`#items [data-folder-id="${folderId}"]`);
  await expect(folder).toBeVisible();
  if (
    !(await folder.evaluate((element) =>
      element.classList.contains("expanded"),
    ))
  ) {
    await folder.locator(":scope > .folder-header").click();
  }
}

async function importAllContent(page, { packId, folderName }) {
  await openSidebarTab(page, "compendium");
  const packEntry = page.locator(`#compendium [data-pack="${packId}"]`);
  await expect(packEntry).toBeVisible();

  const menu = await openContextMenu(page, packEntry);
  await menu
    .locator(".context-item", { hasText: "Import All Content" })
    .click();

  const dialog = page
    .locator(".application.dialog")
    .filter({ has: page.locator('input[name="folderName"]') });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="folderName"]').fill(folderName);
  await dialog.locator('input[name="keepId"]').uncheck();
  await dialog.locator('button[data-action="yes"]').click();
  await expect(dialog).toHaveCount(0);

  importedFolderId = await page.evaluate(
    ({ folderName }) =>
      game.folders.find((folder) => folder.name === folderName)?.id,
    { folderName },
  );
  expect(importedFolderId).toBeTruthy();
}

async function exportFolderToCompendium(page, { folderId, packId }) {
  await openSidebarTab(page, "items");
  const folderHeader = page.locator(
    `#items [data-folder-id="${folderId}"] > .folder-header`,
  );
  await expect(folderHeader).toBeVisible();

  const menu = await openContextMenu(page, folderHeader);
  await menu
    .locator(".context-item", { hasText: "Export to Compendium" })
    .click();

  const dialog = page.locator("#folder-export");
  await expect(dialog).toBeVisible();
  await dialog.locator('select[name="pack"]').selectOption(packId);
  await dialog.locator('input[name="merge"]').check();
  await dialog.locator('input[name="keepId"]').uncheck();
  await dialog.locator('input[name="keepFolders"]').check();
  await dialog.locator('button[data-action="ok"]').click();
  await expect(dialog).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  createdPackIds = [];
  importedFolderId = undefined;
  await gotoReadyWorld(page);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(
    async ({ folderId, packIds }) => {
      const folder = game.folders.get(folderId);
      if (folder) {
        await folder.delete({ deleteSubfolders: true, deleteContents: true });
      }
      for (const packId of [...packIds].reverse()) {
        const pack = game.packs.get(packId);
        if (pack) await pack.deleteCompendium();
      }
    },
    { folderId: importedFolderId, packIds: createdPackIds },
  );
});

test("Import All Content rebuilds installed items and preserves them on folder export", async ({
  page,
}) => {
  const inputPackId = await createItemCompendium(
    page,
    uniqueName("Malorian Import Pack"),
  );
  const outputPackId = await createItemCompendium(
    page,
    uniqueName("Malorian Export Pack"),
  );
  const expectedInstalledItem = await seedMalorian(page, inputPackId);
  let importedWeaponId;
  let importedInstalledItemId;

  await test.step("import the compendium through Import All Content", async () => {
    await importAllContent(page, {
      packId: inputPackId,
      folderName: uniqueName("Malorian Import Folder"),
    });
  });

  await test.step("verify the installed item was rebuilt once", async () => {
    const imported = await page.evaluate(
      ({ folderId, malorianName, installedItemName }) => {
        const weapon = game.items.find(
          (item) => item.folder?.id === folderId && item.name === malorianName,
        );
        const installedIds = weapon?.system.installedItems.list ?? [];
        return {
          weaponId: weapon?.id,
          installedIds,
          installedItems: installedIds.map((id) => {
            const item = game.items.get(id);
            return item
              ? { id: item.id, name: item.name, type: item.type }
              : undefined;
          }),
          installedItemCount: game.items.filter(
            (item) => item.name === installedItemName,
          ).length,
          installTree: weapon?.getFlag(game.system.id, "cprInstallTree"),
        };
      },
      {
        folderId: importedFolderId,
        malorianName: MALORIAN_NAME,
        installedItemName: expectedInstalledItem.name,
      },
    );

    expect(imported.weaponId).toBeTruthy();
    importedWeaponId = imported.weaponId;
    expect(imported.installedIds).toHaveLength(1);
    [importedInstalledItemId] = imported.installedIds;
    expect(imported.installedItems).toEqual([
      {
        id: imported.installedIds[0],
        name: expectedInstalledItem.name,
        type: expectedInstalledItem.type,
      },
    ]);
    expect(imported.installedItemCount).toBe(1);
    expect(imported.installTree).toBeUndefined();
  });

  await test.step("verify the installed item is visible after reopening the weapon sheet", async () => {
    await expandItemFolder(page, importedFolderId);
    const sheetId = await reopenItemSheetViaUI(page, importedWeaponId);
    const sheet = await openItemSettings(page, sheetId);
    await expect(
      sheet.locator(
        `li[data-item-id="${importedInstalledItemId}"][draggable="false"]`,
      ),
    ).toContainText(expectedInstalledItem.name);
    await closeDocSheet(page, {
      collection: "items",
      id: importedWeaponId,
    });
  });

  await test.step("export the imported folder through Export to Compendium", async () => {
    await exportFolderToCompendium(page, {
      folderId: importedFolderId,
      packId: outputPackId,
    });
  });

  await test.step("verify the exported weapon retains reconstructable installed data", async () => {
    const exported = await page.evaluate(
      async ({ packId, malorianName, installedItemName }) => {
        const pack = game.packs.get(packId);
        await pack.getIndex({ fields: ["name"] });
        const weaponId = pack.index.find(
          (entry) => entry.name === malorianName,
        )?._id;
        const weapon = weaponId ? await pack.getDocument(weaponId) : undefined;
        const installTree = weapon?.getFlag(game.system.id, "cprInstallTree");
        return {
          weaponId,
          installedIds: weapon?.system.installedItems.list ?? [],
          installTree: installTree?.map((item) => ({
            id: item._id,
            name: item.name,
            type: item.type,
          })),
          worldInstalledItemCount: game.items.filter(
            (item) => item.name === installedItemName,
          ).length,
        };
      },
      {
        packId: outputPackId,
        malorianName: MALORIAN_NAME,
        installedItemName: expectedInstalledItem.name,
      },
    );

    expect(exported.weaponId).toBeTruthy();
    expect(exported.installedIds).toHaveLength(1);
    expect(exported.installTree).toEqual([
      {
        id: exported.installedIds[0],
        name: expectedInstalledItem.name,
        type: expectedInstalledItem.type,
      },
    ]);
    expect(exported.worldInstalledItemCount).toBe(1);
  });

  await test.step("verify duplicating the world weapon makes one unique installed-item tree", async () => {
    await expandItemFolder(page, importedFolderId);
    const weaponEntry = page.locator(
      `#items [data-entry-id="${importedWeaponId}"]`,
    );
    await expect(weaponEntry).toBeVisible();
    const menu = await openContextMenu(page, weaponEntry);
    await menu.locator(".context-item", { hasText: "Duplicate" }).click();

    await expect
      .poll(() =>
        page.evaluate(
          ({ originalId, malorianName }) => {
            const copies = game.items.filter(
              (item) =>
                item.id !== originalId && item.name.includes(malorianName),
            );
            const installedIds = copies[0]?.system.installedItems.list ?? [];
            return {
              copyCount: copies.length,
              installedItemCount: installedIds.length,
              installedReferencesResolved: installedIds.every((id) =>
                game.items.has(id),
              ),
            };
          },
          { originalId: importedWeaponId, malorianName: MALORIAN_NAME },
        ),
      )
      .toEqual({
        copyCount: 1,
        installedItemCount: 1,
        installedReferencesResolved: true,
      });

    const duplicated = await page.evaluate(
      ({ originalId, malorianName }) => {
        const original = game.items.get(originalId);
        const copies = game.items.filter(
          (item) => item.id !== originalId && item.name.includes(malorianName),
        );
        const copy = copies[0];
        const installedIds = copy?.system.installedItems.list ?? [];
        return {
          copyCount: copies.length,
          installedIds,
          installedItems: installedIds.map((id) => {
            const item = game.items.get(id);
            return item
              ? { id: item.id, name: item.name, type: item.type }
              : undefined;
          }),
          originalInstalledIds: original.system.installedItems.list,
        };
      },
      { originalId: importedWeaponId, malorianName: MALORIAN_NAME },
    );

    expect(duplicated.copyCount).toBe(1);
    expect(duplicated.installedIds).toHaveLength(1);
    expect(duplicated.installedItems).toEqual([
      {
        id: duplicated.installedIds[0],
        name: expectedInstalledItem.name,
        type: expectedInstalledItem.type,
      },
    ]);
    expect(duplicated.installedIds).not.toEqual(
      duplicated.originalInstalledIds,
    );
  });
});
