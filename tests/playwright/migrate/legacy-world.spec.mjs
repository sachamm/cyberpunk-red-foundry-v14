import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  reloadReadyWorld,
} from "../../../tools/playwright/session/world.mjs";
import {
  reopenActorSheetViaUI,
  closeDocSheet,
} from "../../../tools/playwright/ui/index.mjs";

const fixture = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/v0.92.4-items.json", import.meta.url),
    "utf8",
  ),
);

test("a rejected migration batch keeps the old world version and shows an error", async ({
  page,
}) => {
  await gotoReadyWorld(page);
  const itemId = await page.evaluate(async () => {
    const item = await Item.create({
      name: "Rejected migration item",
      type: "gear",
      system: { source: { book: "Core", page: 1 } },
    });
    await game.settings.set(game.system.id, "dataModelVersion", "43");
    return item.id;
  });
  await page.reload();
  const migration = page.locator("#cpr-migration");
  const confirm = migration.locator('[data-action="confirmMigration"]');
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    game.cpr.originalMigrationUpdate = game.items.documentClass.updateDocuments;
    game.items.documentClass.updateDocuments = async () => [];
  });
  try {
    await confirm.hover();
    await page.mouse.down();
    await expect(confirm).toHaveCount(0);
    await page.mouse.up();
    await expect(migration).toContainText("Migration failed");
    const errorMessage = await page.evaluate(
      () => game.cpr.MigrationRunner.error.cause.message,
    );
    expect(errorMessage).toContain("Migration updates were rejected");
    expect(errorMessage).toContain(itemId);
    expect(
      await page.evaluate(() =>
        game.settings.get(game.system.id, "dataModelVersion"),
      ),
    ).toBe("43");
    expect(
      await page.evaluate(() => game.cpr.MigrationRunner.migrationSuccessful),
    ).toBe(false);
  } finally {
    await page.evaluate(async () => {
      game.items.documentClass.updateDocuments =
        game.cpr.originalMigrationUpdate;
      delete game.cpr.originalMigrationUpdate;
      await game.settings.set(
        game.system.id,
        "dataModelVersion",
        String(game.cpr.MigrationRunner.newDataModelVersion),
      );
    });
  }
});

test("v0.92.4 data survives the full world migration and a fresh reload", async ({
  page,
}) => {
  await gotoReadyWorld(page);
  const ids = await page.evaluate(
    async ({ weapon, gear, dataModelVersion }) => {
      const item = await Item.create({
        ...weapon,
        name: "Legacy customized pistol",
      });
      const actor = await Actor.create({
        name: "Legacy world character",
        type: "character",
        flags: {
          [game.system.id]: { _migration: { current: dataModelVersion } },
        },
        system: {
          stats: { body: { value: 6 }, will: { value: 6 } },
          derivedStats: { hp: { value: 27 } },
        },
        items: [weapon, gear],
      });
      const scene = await Scene.create({ name: "Legacy world scene" });
      const tokens = await scene.createEmbeddedDocuments("Token", [
        {
          name: "Linked legacy character",
          actorId: actor.id,
          actorLink: true,
          x: 100,
          y: 100,
        },
        {
          name: "Unlinked legacy character",
          actorId: actor.id,
          actorLink: false,
          x: 300,
          y: 100,
          delta: {
            system: { derivedStats: { hp: { value: 19 } } },
            items: [{ ...weapon, name: "Token customized pistol" }],
          },
        },
      ]);
      const pack = await CompendiumCollection.createCompendium({
        label: "Legacy world gear",
        type: "Item",
        name: "legacy-world-gear",
      });
      const packed = await Item.create(gear, { pack: pack.collection });
      await game.settings.set(
        game.system.id,
        "dataModelVersion",
        String(dataModelVersion),
      );
      return {
        item: item.id,
        actor: actor.id,
        scene: scene.id,
        tokens: tokens.map((t) => t.id),
        pack: pack.collection,
        packed: packed.id,
      };
    },
    fixture,
  );
  await page.reload();
  const migration = page.locator("#cpr-migration");
  const confirm = migration.locator('[data-action="confirmMigration"]');
  await expect(confirm).toBeVisible();
  await confirm.hover();
  await page.mouse.down();
  await expect(confirm).toHaveCount(0);
  await page.mouse.up();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const runner = game.cpr.MigrationRunner;
          return runner.error
            ? String(runner.error.cause?.stack ?? runner.error)
            : runner.migrationSuccessful;
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await reloadReadyWorld(page);
  const result = await page.evaluate(async (ids) => {
    const actor = game.actors.get(ids.actor);
    const item = game.items.get(ids.item);
    const tokens = ids.tokens.map((id) =>
      game.scenes.get(ids.scene).tokens.get(id),
    );
    const packed = await game.packs.get(ids.pack).getDocument(ids.packed);
    const gear = actor.items.getName("Agent");
    return {
      version: game.settings.get(game.system.id, "dataModelVersion"),
      latest: String(game.cpr.MigrationRunner.newDataModelVersion),
      needsMigration: game.cpr.MigrationRunner.needsMigration,
      actorHp: actor.system.derivedStats.hp.value,
      worldWeapon: {
        name: item.name,
        damage: item.system.damage,
        sources: item.system.sources,
        legacySource: item._source.system.source ?? null,
        crit: item.system.damageCrit,
      },
      embeddedSources: actor.items.getName("Heavy Pistol").system.sources,
      effect: {
        type: gear.effects.contents[0].system.changes[0].type,
        value: gear.effects.contents[0].system.changes[0].value,
      },
      linkedActor: tokens[0].actorId,
      unlinkedHp: tokens[1].actor.system.derivedStats.hp.value,
      unlinkedWeapon: tokens[1].actor.items.getName("Token customized pistol")
        ?.system.sources,
      packSources: packed.system.sources,
      packMigration: packed.getFlag(game.system.id, "_migration").current,
    };
  }, ids);
  expect(result.version).toBe(result.latest);
  expect(result.needsMigration).toBe(false);
  expect(result.actorHp).toBe(27);
  expect(result.worldWeapon).toEqual({
    name: "Legacy customized pistol",
    damage: "3d6",
    sources: [{ book: "Core", page: 341 }],
    legacySource: null,
    crit: { threshold: 0, count: 2, bonus: 5 },
  });
  expect(result.embeddedSources).toEqual([{ book: "Core", page: 341 }]);
  expect(result.effect).toEqual({ type: "add", value: 2 });
  expect(result.linkedActor).toBe(ids.actor);
  expect(result.unlinkedHp).toBe(19);
  expect(result.unlinkedWeapon).toEqual([{ book: "Core", page: 341 }]);
  expect(result.packSources).toEqual([{ book: "Core", page: 352 }]);
  expect(String(result.packMigration)).toBe(result.latest);
  const sheetId = await reopenActorSheetViaUI(page, ids.actor);
  await expect(page.locator(`#${sheetId}`)).toBeVisible();
  await expect(page.locator(`#${sheetId} input[name="name"]`)).toHaveValue(
    "Legacy world character",
  );
  await closeDocSheet(page, { collection: "actors", id: ids.actor });
});
