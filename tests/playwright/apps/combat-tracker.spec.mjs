import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { reloadReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createActorViaUI,
  closeDocSheet,
  uniqueName,
  createCanvasTokenViaUI,
  openCanvasTokenHudViaUI,
  openSidebarTab,
} from "../../../tools/playwright/ui/index.mjs";

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
installConsoleErrorHarness();

test("combat orders meatspace and NET actors, advances turns, and persists", async ({
  page,
}) => {
  test.setTimeout(180000);
  const actors = [];
  const characterId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("combat-character"),
  });
  await closeDocSheet(page, { collection: "actors", id: characterId });
  const tokenId = await createCanvasTokenViaUI(page, {
    actorId: characterId,
    name: uniqueName("combat-scene"),
  });
  actors.push({ actorId: characterId, tokenId });
  for (const type of ["blackIce", "demon"]) {
    const actorId = await createActorViaUI(page, {
      type,
      name: uniqueName(`combat-${type}`),
    });
    await closeDocSheet(page, { collection: "actors", id: actorId });
    await openSidebarTab(page, "actors");
    await page
      .locator(`#actors [data-entry-id="${actorId}"]`)
      .dragTo(page.locator("#board"), {
        targetPosition: { x: 700 + actors.length * 70, y: 400 },
      });
    await page.waitForFunction(
      (id) => canvas.tokens.placeables.some((t) => t.actor?.id === id),
      actorId,
    );
    const netTokenId = await page.evaluate(
      (id) => canvas.tokens.placeables.find((t) => t.actor?.id === id).id,
      actorId,
    );
    actors.push({ actorId, tokenId: netTokenId });
  }
  await test.step("roll initiative from the tracker", async () => {
    for (const actor of actors) {
      await openCanvasTokenHudViaUI(page, actor.tokenId);
      await page.locator('#token-hud [data-action="combat"]').click();
      await page.waitForFunction(
        (id) => game.combat?.combatants.some((c) => c.actorId === id),
        actor.actorId,
      );
      await page.keyboard.press("Escape");
    }
    await openSidebarTab(page, "combat");
    for (const actor of actors) {
      const id = await page.evaluate(
        (actorId) =>
          game.combat.combatants.find((c) => c.actorId === actorId).id,
        actor.actorId,
      );
      await page
        .locator(
          `#combat [data-combatant-id="${id}"] [data-action="rollInitiative"]`,
        )
        .click();
      await page.waitForFunction(
        (id) => Number.isFinite(game.combat.combatants.get(id).initiative),
        id,
      );
    }
    const initiatives = await page.evaluate(
      (ids) =>
        ids.map(
          (id) =>
            game.combat.combatants.find((c) => c.actorId === id).initiative,
        ),
      actors.map((a) => a.actorId),
    );
    expect(initiatives[0]).toBeGreaterThanOrEqual(0);
    expect(initiatives[1]).toBe(initiatives[0] + 1);
    expect(initiatives[2]).toBe(initiatives[1] + 1);
    await expect(page.locator("#combat .combatant").first()).toHaveAttribute(
      "data-combatant-id",
      await page.evaluate(
        (id) => game.combat.combatants.find((c) => c.actorId === id).id,
        actors[2].actorId,
      ),
    );
  });
  await test.step("advance a full round and reload", async () => {
    await page.locator('#combat [data-action="startCombat"]').click();
    await page.waitForFunction(
      () => game.combat.round === 1 && game.combat.turn === 0,
    );
    for (let i = 1; i <= 3; i += 1) {
      await page.locator('#combat [data-action="nextTurn"]').click();
      await page.waitForFunction(
        (i) =>
          game.combat.round === (i === 3 ? 2 : 1) && game.combat.turn === i % 3,
        i,
      );
    }
    await reloadReadyWorld(page);
    await openSidebarTab(page, "combat");
    await expect(page.locator("#combat .encounter-title")).toContainText(
      "Round 2",
    );
    await expect(page.locator("#combat .combatant")).toHaveCount(3);
  });
});
