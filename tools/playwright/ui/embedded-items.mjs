import { expect } from "@playwright/test";
import { openItemSettings } from "./items.mjs";
import {
  closeOwnedItemSheet,
  expectSheetRendered,
  openOwnedItemSheet,
  sheet,
} from "./sheets.mjs";
import { openSidebarTab } from "./sidebar.mjs";

export const DROP_TAB_BY_TYPE = {
  ammo: "gear",
  armor: "gear",
  clothing: "gear",
  cyberdeck: "gear",
  cyberware: "gear",
  drug: "gear",
  gear: "gear",
  itemUpgrade: "gear",
  netarch: "gear",
  program: "gear",
  vehicle: "gear",
  weapon: "gear",
  skill: "skills",
  role: "role",
  criticalInjury: "fight",
};

async function waitForItemCount(page, actorId, target, timeout) {
  try {
    await page.waitForFunction(
      ({ actorId, target }) => game.actors.get(actorId).items.size >= target,
      { actorId, target },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForItemAmount(page, { actorId, name, target }, timeout) {
  try {
    await page.waitForFunction(
      ({ actorId, name, target }) => {
        const total = Array.from(game.actors.get(actorId).items)
          .filter((i) => i.name === name)
          .reduce((sum, i) => sum + (i.system.amount ?? 1), 0);
        return total >= target;
      },
      { actorId, name, target },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

export async function dragItemToActorSheet(
  page,
  { itemId, sheetId, actorId, expectStack = false },
) {
  await openSidebarTab(page, "items");
  const entry = page.locator(`#items [data-entry-id="${itemId}"]`);
  await expect(entry).toBeVisible();
  const sheetEl = page.locator(`#${sheetId}`);
  await expect(sheetEl).toBeVisible();

  const before = await page.evaluate(
    (id) => game.actors.get(id).items.size,
    actorId,
  );
  const draggedName = await page.evaluate(
    (id) => game.items.get(id).name,
    itemId,
  );
  const amountBefore = expectStack
    ? await page.evaluate(
        ({ id, name }) =>
          Array.from(game.actors.get(id).items)
            .filter((i) => i.name === name)
            .reduce((sum, i) => sum + (i.system.amount ?? 1), 0),
        { id: actorId, name: draggedName },
      )
    : null;

  const landed = (timeout) =>
    expectStack
      ? waitForItemAmount(
          page,
          { actorId, name: draggedName, target: amountBefore + 1 },
          timeout,
        )
      : waitForItemCount(page, actorId, before + 1, timeout);

  await entry.dragTo(sheetEl, { timeout: 5000 }).catch(() => {});
  await page.mouse.up().catch(() => {});

  if (await landed(3000)) return;

  const uuid = await page.evaluate((id) => game.items.get(id).uuid, itemId);
  await page.evaluate(
    ({ uuid, sheetId, actorId, before }) => {
      if (game.actors.get(actorId).items.size > before) return;
      const sheetEl = document.getElementById(sheetId);
      const data = new DataTransfer();
      data.setData("text/plain", JSON.stringify({ type: "Item", uuid }));
      sheetEl.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }),
      );
    },
    { uuid, sheetId, actorId, before },
  );

  if (!(await landed(5000))) {
    throw new Error(`Item ${itemId} was not embedded on actor ${actorId}`);
  }
}

export async function createEmbeddedItemViaUI(
  page,
  { sheetId, actorId, type },
) {
  const beforeIds = await page.evaluate(
    (id) => game.actors.get(id).items.map((item) => item.id),
    actorId,
  );
  const createButton = page.locator(
    `#${sheetId} .item-create[data-item-type="${type}"]`,
  );
  await createButton.scrollIntoViewIfNeeded();
  await createButton.waitFor({ state: "visible" });
  await createButton.click();

  await page.waitForFunction(
    ({ actorId, beforeIds }) =>
      game.actors
        .get(actorId)
        .items.some((item) => !beforeIds.includes(item.id)),
    { actorId, beforeIds },
    { timeout: 10000 },
  );

  return page.evaluate(
    ({ actorId, beforeIds }) =>
      game.actors
        .get(actorId)
        .items.find((item) => !beforeIds.includes(item.id)).id,
    { actorId, beforeIds },
  );
}

/**
 * Get the current value of the world setting that lets players create
 * inventory items. The + buttons on character sheets only render when it is
 * on; container sheets show them to GMs regardless.
 */
export async function getPlayersCreateInventory(page) {
  return page.evaluate(() =>
    game.settings.get(game.system.id, "playersCreateInventory"),
  );
}

/**
 * Set the world setting that lets players create inventory items. The +
 * buttons on character sheets only render when it is on; container sheets
 * show them to GMs regardless. World settings persist for the whole run, so
 * a spec that changes this should restore the previous value afterwards.
 */
export async function setPlayersCreateInventory(page, enabled) {
  await page.evaluate(async (value) => {
    await game.settings.set(game.system.id, "playersCreateInventory", value);
  }, enabled);
}

/**
 * Enable the world setting that lets players create inventory items. See
 * setPlayersCreateInventory for the persistence caveat.
 */
export async function enablePlayersCreateInventory(page) {
  await setPlayersCreateInventory(page, true);
}

/**
 * Create an item in an actor's inventory via the UI by clicking the
 * category header's + button on the actor's sheet (container or
 * character). Optionally renames the item and applies additional item
 * data after creation. Character sheets need the playersCreateInventory
 * world setting enabled first; see enablePlayersCreateInventory.
 *
 * @param {Object} page - the top-level game object from Foundry
 * @param {String} actorId - id of the actor owning the item
 * @param {String} sheetId - rendered element id of the actor's sheet
 * @param {String} itemType - type of the item to create (a key of CPR.inventoryCategories)
 * @param {String} itemName - (optional) name for the item; defaults to "New {Type}"
 * @param {Object} data - (optional) additional item data applied after creation
 * @returns {Object} - an object with the itemId and a refreshed sheetId
 */
export async function createInventoryItemViaUI(
  page,
  { actorId, sheetId, itemType, itemName, data },
) {
  const actorSheet = sheet(page, sheetId);

  // Character sheets keep the gear list behind a tab; activate it so the
  // + button is visible. Container sheets have no such tab.
  if (await actorSheet.locator('.navtabs-right a[data-tab="gear"]').count()) {
    await activateGearTab(page, sheetId);
  }

  const existingIds = await page.evaluate((id) => {
    return Array.from(game.actors.get(id).items.map((item) => item.id));
  }, actorId);

  const createBtn = actorSheet.locator(
    `.item-create[data-item-type="${itemType}"]`,
  );
  await expect(createBtn).toBeVisible();
  await createBtn.click();

  const newItemHandle = await page.waitForFunction(
    ({ id, existingIds }) => {
      const items = Array.from(game.actors.get(id).items.map((i) => i.id));
      return items.find((v) => !existingIds.includes(v)) ?? null;
    },
    { id: actorId, existingIds },
    { timeout: 10000 },
  );
  const itemId = await newItemHandle.jsonValue();
  expect(itemId).toBeTruthy();

  if (itemName) {
    const nameLink = actorSheet
      .locator(`li.item[data-item-id="${itemId}"]`)
      .locator("a.item-edit");
    await nameLink.click();

    const itemSheetId = await openOwnedItemSheet(page, { actorId, itemId });
    const itemSheet = await openItemSettings(page, itemSheetId);
    const nameInput = itemSheet.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(itemName);
    await nameInput.blur();

    await page.waitForFunction(
      ({ actorId, itemId, itemName }) =>
        game.actors.get(actorId)?.items.get(itemId)?.name === itemName,
      { actorId, itemId, itemName },
      { timeout: 5000 },
    );

    await closeOwnedItemSheet(page, { actorId, itemId });
  }

  if (data) {
    await page.evaluate(
      ({ actorId, itemId, data }) =>
        game.actors.get(actorId).items.get(itemId).update(data),
      { actorId, itemId, data },
    );
    await page.waitForFunction(
      ({ actorId, itemId, data }) => {
        const item = game.actors.get(actorId)?.items.get(itemId);
        if (!item) return false;
        const flat = [];
        const walk = (obj, prefix) => {
          for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (
              value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            ) {
              walk(value, path);
            } else {
              flat.push([path, value]);
            }
          }
        };
        walk(foundry.utils.expandObject(data), "");
        return flat.every(
          ([path, value]) =>
            JSON.stringify(foundry.utils.getProperty(item, path)) ===
            JSON.stringify(value),
        );
      },
      { actorId, itemId, data },
      { timeout: 5000 },
    );
  }

  const freshSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  return { itemId, sheetId: freshSheetId };
}

async function waitForOwnedItemTransfer(
  page,
  { sourceActorId, itemId, targetActorId, targetBefore },
  timeout,
) {
  try {
    await page.waitForFunction(
      ({ sourceActorId, itemId, targetActorId, targetBefore }) => {
        const source = game.actors.get(sourceActorId);
        const target = game.actors.get(targetActorId);
        return !source.items.has(itemId) && target.items.size >= targetBefore;
      },
      { sourceActorId, itemId, targetActorId, targetBefore },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

export async function dragOwnedItemToActorSheet(
  page,
  {
    sourceActorId,
    sourceSheetId,
    itemId,
    targetActorId,
    targetSheetId,
    requireUiDrag = false,
    dropPosition = null,
    sourceRowLocator = null,
  },
) {
  let row;
  if (sourceRowLocator) {
    await expect(sourceRowLocator).toBeVisible();
    row = sourceRowLocator;
  } else {
    const gear = await activateGearTab(page, sourceSheetId);
    row = await hoverGearRow(gear, itemId);
  }
  const target = page.locator(`#${targetSheetId}`);
  await expect(target).toBeVisible();

  const targetBefore = await page.evaluate(
    (id) => game.actors.get(id).items.size,
    targetActorId,
  );

  // dropPosition offsets the drop point from the target's top-left corner,
  // for when the sheet center is covered by another window.
  const dragOptions = { timeout: 5000 };
  if (dropPosition) dragOptions.targetPosition = dropPosition;
  await row.dragTo(target, dragOptions).catch(() => {});
  await page.mouse.up().catch(() => {});

  if (
    await waitForOwnedItemTransfer(
      page,
      { sourceActorId, itemId, targetActorId, targetBefore },
      3000,
    )
  )
    return;

  if (requireUiDrag) {
    throw new Error(
      `UI drag did not transfer owned item ${itemId} from actor ${sourceActorId} to actor ${targetActorId}; the target sheet may be covered by another window`,
    );
  }

  const uuid = await page.evaluate(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId)?.uuid ?? null,
    { actorId: sourceActorId, itemId },
  );
  expect(
    uuid,
    `expected owned item ${itemId} on actor ${sourceActorId}`,
  ).toBeTruthy();

  await page.evaluate(
    ({ uuid, sourceActorId, targetSheetId }) => {
      const sheetEl = document.getElementById(targetSheetId);
      const data = new DataTransfer();
      data.setData(
        "text/plain",
        JSON.stringify({
          type: "Item",
          uuid,
          system: { actorId: sourceActorId, tokenId: null },
        }),
      );
      sheetEl.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }),
      );
    },
    { uuid, sourceActorId, targetSheetId },
  );

  if (
    !(await waitForOwnedItemTransfer(
      page,
      { sourceActorId, itemId, targetActorId, targetBefore },
      5000,
    ))
  ) {
    throw new Error(
      `Owned item ${itemId} was not transferred from actor ${sourceActorId} to actor ${targetActorId}`,
    );
  }
}

export async function activateGearTab(page, actorSheetId) {
  const sheet = page.locator(`#${actorSheetId}`);
  await sheet.locator('.navtabs-right a[data-tab="gear"]').click();
  const content = sheet.locator(
    '.right-content-section div.tab.gear-tab[data-tab="gear"]',
  );
  await expect(content).toHaveClass(/active/);
  return content;
}

export async function hoverGearRow(gearContent, itemId) {
  const row = gearContent.locator(`li.item[data-item-id="${itemId}"]`).first();
  await expect(row).toBeVisible();
  await row.hover();
  return row;
}

export async function installUpgrade(
  page,
  { actorSheetId, actorId, upgradeId, targetId },
) {
  const gear = await activateGearTab(page, actorSheetId);
  const row = await hoverGearRow(gear, upgradeId);
  await row.locator('a.item-action[data-action-type="install-item"]').click();

  const dialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedTarget"]') });
  await expect(dialog).toBeVisible();
  await dialog
    .locator(`input[name="selectedTarget"][value="${targetId}"]`)
    .check();
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();

  await page.waitForFunction(
    ({ actorId, upgradeId }) =>
      game.actors.get(actorId).items.get(upgradeId).system.isInstalled === true,
    { actorId, upgradeId },
    { timeout: 10000 },
  );
}
