import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("039 migration relinks roll table result images", async ({
  page: game,
}) => {
  const out = await game.evaluate(async () => {
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/039-split-packs.js`
    );
    const migration = new M.default();
    const result = {
      documentId: "unmapped-result-id",
      img: "systems/cyberpunk-red-core/icons/compendium/the_12_days_of_gearmas/green_light_go_sniffer.svg",
      async update(update) {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        Object.assign(this, update);
      },
    };

    await migration._updateTableResult({ results: [result] });
    return result.img;
  });

  expect(out).toBe(
    "modules/cyberpunk-red-dlc/icons/dlc/gear/green_light_go_sniffer.svg",
  );
});
