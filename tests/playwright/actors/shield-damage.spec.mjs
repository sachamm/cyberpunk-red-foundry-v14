import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
  openSidebarTab,
  reopenActorSheetViaUI,
  setItemField,
  toggleItemCheckbox,
  uniqueName,
  waitForSheetReplacement,
} from "../../../tools/playwright/ui/index.mjs";

test.beforeEach(async ({ page }) => gotoReadyWorld(page));
test.use({ actionTimeout: 15000 });

for (const type of ["character", "mook"]) {
  test(`${type} shield damage reduces remaining HP and reversal restores it`, async ({
    page,
  }) => {
    const actorId = await createActorViaUI(page, {
      type,
      name: uniqueName("shield-owner"),
    });
    let sheetId = await expectSheetRendered(page, {
      collection: "actors",
      id: actorId,
    });
    const name = uniqueName("shield");
    const worldId = await createItemViaUI(page, { type: "armor", name });
    const itemSheetId = await expectSheetRendered(page, {
      collection: "items",
      id: worldId,
    });
    await toggleItemCheckbox(page, {
      sheetId: itemSheetId,
      itemId: worldId,
      target: "system.isBodyLocation",
      expected: false,
    });
    await toggleItemCheckbox(page, {
      sheetId: itemSheetId,
      itemId: worldId,
      target: "system.isShield",
      expected: true,
    });
    for (const [field, value] of [
      ["max", 2],
      ["value", 1],
    ]) {
      await setItemField(page, {
        sheetId: itemSheetId,
        itemId: worldId,
        name: `system.shieldHitPoints.${field}`,
        path: `system.shieldHitPoints.${field}`,
        value,
      });
    }
    await closeDocSheet(page, { collection: "items", id: worldId });
    await dragItemToActorSheet(page, { itemId: worldId, sheetId, actorId });
    const itemId = await page.evaluate(
      ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
      { actorId, name },
    );
    if (type === "character") {
      for (const state of ["carried", "equipped"]) {
        const gear = await activateGearTab(page, sheetId);
        const row = await hoverGearRow(gear, itemId);
        await row.locator("a.equip").click();
        await page.waitForFunction(
          ({ actorId, itemId, state }) =>
            game.actors.get(actorId).items.get(itemId).system.equipped ===
            state,
          { actorId, itemId, state },
        );
      }
    }
    const reopen = async () => {
      await closeDocSheet(page, { collection: "actors", id: actorId });
      sheetId = await reopenActorSheetViaUI(page, actorId);
      if (type === "character") {
        await page
          .locator(`#${sheetId} .navtabs-bottom a[data-tab="fight"]`)
          .click();
      }
      return page.locator(`#${sheetId} .armor-grid[data-item-id="${itemId}"]`);
    };
    let row = await reopen();
    const expectHp = async (value) => {
      await expect.soft(row.locator(".armor-1-stats")).toHaveText(`${value}/2`);
      expect
        .soft(
          await page.evaluate(
            ({ actorId, itemId }) => ({
              item: game.actors.get(actorId).items.get(itemId).system
                .shieldHitPoints.value,
              tracked:
                game.actors.get(actorId).system.externalData.currentArmorShield
                  .value,
            }),
            { actorId, itemId },
          ),
        )
        .toEqual({ item: value, tracked: value });
    };

    await test.step("the Damage Shield glyph reduces HP and stops at zero", async () => {
      await expect(row.locator(".armor-1-stats")).toHaveText("1/2");
      const track = row.locator(
        'a.armor-current-untrack[data-location="shield"]',
      );
      if (await track.count()) await track.click();
      row = await reopen();
      await expect(
        row.locator('a.armor-current-track[data-location="shield"]'),
      ).toBeVisible();
      for (let click = 0; click < 2; click += 1) {
        await row.locator('.ablate[data-location="shield"]').click();
        row = await reopen();
        await expectHp(0);
      }
    });

    await test.step("reversing recorded shield damage restores HP up to its maximum", async () => {
      // Seed the real damage card so this callback needs no canvas fixture.
      for (const value of [1, 2, 2]) {
        const messageId = await page.evaluate(async (actorId) => {
          const actor = game.actors.get(actorId);
          const content = await foundry.applications.handlebars.renderTemplate(
            `systems/${game.system.id}/templates/chat/cpr-damage-application-card.hbs`,
            {
              actor,
              name: actor.name,
              hpReduction: 0,
              location: "body",
              ablation: 0,
              shieldAblation: 1,
            },
          );
          return (
            await ChatMessage.create({ content, speaker: { actor: actorId } })
          ).id;
        }, actorId);
        await openSidebarTab(page, "chat");
        await page
          .locator(
            `#chat [data-message-id="${messageId}"] [data-action="reverseDamage"]`,
          )
          .click();
        row = await reopen();
        await expectHp(value);
      }
    });

    await test.step("a full shield loses exactly one HP", async () => {
      const prior = await row.elementHandle();
      await row.locator('.ablate[data-location="shield"]').click();
      await waitForSheetReplacement(page, prior);
      row = await reopen();
      await expectHp(1);
    });
  });
}
