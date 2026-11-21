import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import { openSidebarTab } from "../../../tools/playwright/ui/index.mjs";

// Bundled DLC (src/dlc/README.md): every DLC compendium must load all of its
// documents through the v14 data models, and its art must be served.
test("bundled DLC compendia load every document", async ({ page }) => {
  await gotoReadyWorld(page);

  const result = await test.step("load every DLC pack", () =>
    page.evaluate(async () => {
      const packs = game.system.packs.filter((p) =>
        p.path.includes("/dlc/packs/"),
      );
      const out = [];
      for (const meta of packs) {
        const pack = game.packs.get(`${game.system.id}.${meta.name}`);
        if (!pack) {
          out.push({ name: meta.name, missing: true });
          continue;
        }
        const index = await pack.getIndex();
        const docs = await pack.getDocuments();
        out.push({
          name: meta.name,
          indexed: index.size,
          loaded: docs.length,
          invalid: pack.invalidDocumentIds?.size ?? 0,
          img: docs.find((d) => d.img?.includes("/dlc/icons/"))?.img ?? null,
        });
      }
      return out;
    }));

  expect(result).toHaveLength(28);
  for (const pack of result) {
    expect(pack.missing, pack.name).toBeUndefined();
    expect(pack.loaded, pack.name).toBeGreaterThan(0);
    expect(pack.loaded, pack.name).toBe(pack.indexed);
    expect(pack.invalid, pack.name).toBe(0);
  }

  await test.step("serve DLC art", async () => {
    const img = result.find((p) => p.img)?.img;
    expect(img).toBeTruthy();
    const status = await page.evaluate(
      async (src) => (await fetch(src)).status,
      img,
    );
    expect(status).toBe(200);
  });

  await test.step("show the DLC compendium folders", async () => {
    await openSidebarTab(page, "compendium");
    for (const name of [
      "Cyberpunk RED: Black Chrome",
      "Cyberpunk RED: DLC",
      "Cyberpunk RED: Elflines Online",
    ]) {
      await expect(
        page.locator("#compendium .folder-header", { hasText: name }),
      ).toBeVisible();
    }
  });
});
