import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  reloadReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import { PLAYER_NAME } from "../../../tools/playwright/config/harness-config.mjs";
import { createCharacterViaUI } from "../actors/character-sheet-helpers.mjs";
import {
  createActorViaUI,
  closeDocSheet,
  uniqueName,
  createCanvasTokenViaUI,
  openCanvasTokenHudViaUI,
  measureCanvasDistanceViaUI,
  openItemBrowser,
  searchItems,
  positionActorSheet,
  equipWeapon,
} from "../../../tools/playwright/ui/index.mjs";

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  actionTimeout: 15000,
});
installConsoleErrorHarness();

test("a player can select a linked token and use the sheet DV ruler opened with C outside combat", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const { actorId, sheetId } = await createCharacterViaUI(page);
  await positionActorSheet(page, { actorId, left: 1000, top: 30 });
  const documentBrowser = await openItemBrowser(page);
  await searchItems(documentBrowser, "Heavy Pistol");
  const header = await documentBrowser.locator(".window-header").boundingBox();
  await page.mouse.move(header.x + 200, header.y + 12);
  await page.mouse.down();
  await page.mouse.move(210, 42, { steps: 4 });
  await page.mouse.up();
  const pistol = documentBrowser.locator(
    '[data-uuid="Compendium.cyberpunk-red-core.core_weapons.Item.Y433cjlB1uVHPysk"]',
  );
  await pistol.dragTo(page.locator(`#${sheetId}`), {
    targetPosition: { x: 550, y: 350 },
  });
  await page.waitForFunction(
    (id) => game.actors.get(id).items.some((i) => i.name === "Heavy Pistol"),
    actorId,
  );
  const weapon = {
    sheetId,
    itemId: await page.evaluate(
      (id) => game.actors.get(id).items.getName("Heavy Pistol").id,
      actorId,
    ),
  };
  await documentBrowser.locator('[data-action="close"]').click();
  await equipWeapon(page, {
    actorSheetId: sheetId,
    actorId,
    itemId: weapon.itemId,
  });
  await page
    .locator(`#${weapon.sheetId} [data-action="toggleControls"]`)
    .click();
  await page
    .locator("#context-menu .context-item", { hasText: "Prototype Token" })
    .click();
  const config = page.locator(".token-config");
  await config.locator('input[name="actorLink"]').check();
  await config.locator('button[type="submit"]').click();
  await expect(config).toHaveCount(0);
  await closeDocSheet(page, { collection: "actors", id: actorId });
  const tokenId = await createCanvasTokenViaUI(page, {
    actorId,
    name: uniqueName("linked-dv-scene"),
  });
  const priorCharacter = await page.evaluate(
    (name) => game.users.getName(name).character?.id ?? null,
    PLAYER_NAME,
  );
  await page.evaluate(
    async ({ actorId, playerName }) => {
      const player = game.users.getName(playerName);
      await game.actors.get(actorId).update({
        [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      });
      await player.update({ character: actorId });
    },
    { actorId, playerName: PLAYER_NAME },
  );
  expect(
    await page.evaluate(
      (id) => canvas.tokens.get(id).document.actorLink,
      tokenId,
    ),
  ).toBe(true);

  const { context, page: player } = await openPlayerPage(browser, baseURL);
  try {
    expect(await player.evaluate(() => game.user.isGM)).toBe(false);
    await player.evaluate(() => game.settings.set("core", "noCanvas", false));
    await reloadReadyWorld(player);
    await player.waitForFunction(
      (id) => canvas.ready && canvas.tokens.get(id),
      tokenId,
    );
    expect(await player.evaluate(() => game.combat?.started ?? false)).toBe(
      false,
    );
    const point = await player.evaluate(
      (id) => canvas.clientCoordinatesFromCanvas(canvas.tokens.get(id).center),
      tokenId,
    );
    await player.mouse.click(point.x, point.y);
    await player.waitForFunction(
      (id) => canvas.tokens.controlled.some((t) => t.id === id),
      tokenId,
    );
    await player.keyboard.press("c");
    // Resolve the actual character sheet ID rather than depending on its subclass name.
    const actualSheetId = await player.evaluate(
      (id) => game.actors.get(id).sheet.id,
      actorId,
    );
    const characterSheet = player.locator(`#${actualSheetId}`);
    await expect(characterSheet).toBeVisible();
    const glyph = () =>
      characterSheet.locator(`.dv-glyph[data-item-id="${weapon.itemId}"]`);
    await test.step("the linked token's weapon ruler is enabled and saves its DV table", async () => {
      await expect(glyph()).not.toHaveClass(/button-disabled/);
      await expect(glyph().locator("i")).toHaveAttribute(
        "data-tooltip",
        /Measure DV/,
      );
      await glyph().click();
      await player.waitForFunction(
        (id) =>
          canvas.tokens.get(id).document.getFlag(game.system.id, "cprDvTable")
            ?.name === "DV Pistol",
        tokenId,
      );
      await closeDocSheet(player, { collection: "actors", id: actorId });
      await player.keyboard.press("c");
      await expect(characterSheet).toBeVisible();
      await expect(glyph()).toHaveClass(/button-active/);
      await closeDocSheet(player, { collection: "actors", id: actorId });
    });
    await test.step("without a selected token the world actor's ruler stays disabled", async () => {
      await player.mouse.move(point.x, point.y);
      await player.waitForFunction(
        (id) => canvas.tokens.get(id).hover,
        tokenId,
      );
      await player.keyboard.down("Shift");
      await player.mouse.click(point.x, point.y);
      await player.keyboard.up("Shift");
      await player.waitForFunction(() => canvas.tokens.controlled.length === 0);
      await player.keyboard.press("c");
      await expect(characterSheet).toBeVisible();
      await expect(glyph()).toHaveClass(/button-disabled/);
      await expect(glyph().locator("i")).toHaveAttribute(
        "data-tooltip",
        /Select a single token/,
      );
    });
  } finally {
    await context.close();
    await page.evaluate(
      ({ playerName, character }) =>
        game.users.getName(playerName).update({ character }),
      { playerName: PLAYER_NAME, character: priorCharacter },
    );
  }
});

test("the canvas HUD saves a DV table and the ruler uses it after reload", async ({
  page,
}) => {
  test.setTimeout(180000);
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("dv-actor"),
  });
  await closeDocSheet(page, { collection: "actors", id: actorId });
  const tokenId = await createCanvasTokenViaUI(page, {
    actorId,
    name: uniqueName("dv-scene"),
  });
  await test.step("choose a pistol table through the token HUD", async () => {
    await openCanvasTokenHudViaUI(page, tokenId);
    await page.locator("#token-hud .dv-table-selector").click();
    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('select[name="dvTable"]') });
    await dialog
      .locator('select[name="dvTable"]')
      .selectOption({ label: "DV Pistol" });
    await dialog.locator('[data-action="confirm"]').click();
    await expect(dialog).toHaveCount(0);
    await reloadReadyWorld(page);
    await page.waitForFunction(() => canvas.ready);
    await openCanvasTokenHudViaUI(page, tokenId);
    await expect(page.locator("#token-hud .dv-table-selector")).toHaveAttribute(
      "data-tooltip",
      /DV Pistol/,
    );
    await page.locator("#token-hud .dv-table-selector").click();
    await expect(dialog.locator('select[name="dvTable"]')).toHaveValue(
      "DV Pistol",
    );
    await dialog.locator('[data-action="cancel"]').click();
  });
  await test.step("measure a range with the selected token", async () => {
    await measureCanvasDistanceViaUI(page, { tokenId, gridSpaces: 2 });
    try {
      await expect(
        page
          .locator("#measurement .waypoint-label")
          .filter({ hasText: "DV:" })
          .last(),
      ).toContainText("DV: 13 Pistol");
    } finally {
      await page.mouse.up();
    }
  });
  await test.step("clearing the DV table persists and removes the ruler label", async () => {
    await openCanvasTokenHudViaUI(page, tokenId);
    await page.locator("#token-hud .dv-table-selector").click();
    const dialog = page
      .locator(".application")
      .filter({ has: page.locator('select[name="dvTable"]') });
    await dialog.locator('select[name="dvTable"]').selectOption("");
    await dialog.locator('[data-action="confirm"]').click();
    await expect(dialog).toHaveCount(0);
    await openCanvasTokenHudViaUI(page, tokenId);
    await page.locator("#token-hud .dv-table-selector").click();
    await expect(dialog.locator('select[name="dvTable"]')).toHaveValue("");
    await dialog.locator('[data-action="cancel"]').click();
    await measureCanvasDistanceViaUI(page, { tokenId, gridSpaces: 2 });
    try {
      await expect(
        page.locator("#measurement .waypoint-label").last(),
      ).toContainText(/\d+(?:[.,]\d+)? m/);
      await expect(
        page.locator("#measurement .waypoint-label").filter({ hasText: "DV:" }),
      ).toHaveCount(0);
    } finally {
      await page.mouse.up();
    }
  });
});
