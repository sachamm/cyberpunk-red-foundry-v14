import fs from "node:fs";
import { test, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  reloadReadyWorld,
} from "../../../tools/playwright/session/world.mjs";

const fixture = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/v0.92.4-items.json", import.meta.url),
    "utf8",
  ),
);

test("model 24 migrates legacy installations, ammo, roles and serialized equipment through a reload", async ({
  page,
}) => {
  await gotoReadyWorld(page);
  const ids = await page.evaluate(async ({ weapon, gear }) => {
    await game.settings.set(game.system.id, "dataModelVersion", "24");
    const actorId = "LegacyActor00001";
    const ammoId = "LegacyAmmo000001";
    const pistol = foundry.utils.duplicate(weapon);
    pistol.name = "Excellent legacy pistol";
    pistol.flags = {};
    pistol.system.installedItems.allowedTypes = ["itemUpgrade"];
    pistol.system.installedItems.list = [];
    pistol.system.magazine = {
      value: 5,
      max: 8,
      ammoData: { uuid: `Actor.${actorId}.Item.${ammoId}` },
    };
    const actor = await Actor.create(
      {
        _id: actorId,
        name: "Model 24 character",
        type: "character",
        system: {
          derivedStats: { hp: { value: 23 } },
          installedItems: {
            list: ["Actor.LegacyActor00001.Item.LegacyCyber00001"],
          },
        },
        items: [
          pistol,
          {
            _id: ammoId,
            name: "Legacy ammunition",
            type: "ammo",
            system: { source: { book: "Core", page: 344 } },
          },
          {
            _id: "LegacyCyber00001",
            name: "Legacy cyberware",
            type: "cyberware",
            system: {
              installedItems: {
                allowedTypes: ["programs", "cyberware"],
                list: [],
              },
            },
          },
          { name: "Local Expert (Night City)", type: "skill" },
          {
            name: "Medtech",
            type: "role",
            system: {
              abilities: [
                { name: "Surgery", rank: 2, multiplier: 0.5 },
                { name: "Medical Tech", rank: 4, multiplier: 1 },
                { name: "Custom ability", rank: 3, multiplier: 1 },
              ],
            },
          },
        ],
      },
      { keepId: true },
    );
    const scene = await Scene.create({ name: "Model 24 scene" });
    const [token] = await scene.createEmbeddedDocuments("Token", [
      {
        name: "Independent legacy token",
        actorId: actor.id,
        actorLink: false,
        delta: {
          system: { derivedStats: { hp: { value: 11 } } },
          items: [{ ...pistol, name: "Poor token pistol" }],
        },
      },
    ]);
    const pack = await CompendiumCollection.createCompendium({
      label: "Model 24 nested gear",
      type: "Item",
      name: "model-24-gear",
    });
    const child = foundry.utils.duplicate(pistol);
    child.system.magazine.ammoData = null;
    child.system.installedItems.list = [];
    const nested = foundry.utils.duplicate(gear);
    nested.flags = { cprInstallTree: [child] };
    const parent = await Item.create(
      {
        ...weapon,
        name: "Serialized legacy equipment",
        flags: { [game.system.id]: { cprInstallTree: [nested] } },
      },
      { pack: pack.collection },
    );
    await pack.configure({ locked: true });
    return {
      actor: actor.id,
      scene: scene.id,
      token: token.id,
      pack: pack.collection,
      parent: parent.id,
    };
  }, fixture);
  await page.reload();
  const confirm = page.locator(
    '#cpr-migration [data-action="confirmMigration"]',
  );
  await expect(confirm).toBeVisible();
  await confirm.hover();
  await page.mouse.down();
  await expect(confirm).toHaveCount(0);
  await page.mouse.up();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const mr = game.cpr.MigrationRunner;
          return mr.error ? mr.error.cause?.stack : mr.migrationSuccessful;
        }),
      { timeout: 60000 },
    )
    .toBe(true);
  await reloadReadyWorld(page);
  const result = await page.evaluate(async (ids) => {
    const actor = game.actors.get(ids.actor);
    const pistol = actor.items.getName("Excellent legacy pistol");
    const token = game.scenes.get(ids.scene).tokens.get(ids.token);
    const pack = game.packs.get(ids.pack);
    const parent = await pack.getDocument(ids.parent);
    const nested = parent.flags[game.system.id].cprInstallTree[0];
    const child = nested.flags[game.system.id].cprInstallTree[0];
    return {
      version: game.settings.get(game.system.id, "dataModelVersion"),
      latest: game.cpr.MigrationRunner.newDataModelVersion,
      hp: actor.system.derivedStats.hp.value,
      tokenHp: token.actor.system.derivedStats.hp.value,
      ammo: pistol.system.installedItems.list,
      shots: pistol.system.magazine.value,
      quality: pistol.system.quality,
      tokenQuality:
        token.actor.items.getName("Poor token pistol").system.quality,
      cyberware: actor.system.installedItems.list,
      allowed:
        actor.items.getName("Legacy cyberware").system.installedItems
          .allowedTypes,
      skillType: actor.items.getName("Local Expert (Night City)").system
        .skillType,
      abilities: actor.items
        .getName("Medtech")
        .system.abilities.map((a) => ({ name: a.name, rank: a.rank })),
      legacySource: child.system.source ?? null,
      nestedSource: nested.system.sources,
      childSource: child.system.sources,
      childQuality: child.system.quality,
      oldTree: nested.flags.cprInstallTree ?? null,
      childVersion: child.flags[game.system.id]._migration.current,
      locked: pack.locked,
      invalidActors: [...game.actors.invalidDocumentIds],
      invalidItems: [...game.items.invalidDocumentIds],
    };
  }, ids);
  expect(String(result.version)).toBe(String(result.latest));
  expect(result.hp).toBe(23);
  expect(result.tokenHp).toBe(11);
  expect(result.ammo).toEqual(["LegacyAmmo000001"]);
  expect(result.shots).toBe(5);
  expect(result.quality).toBe("excellent");
  expect(result.tokenQuality).toBe("poor");
  expect(result.cyberware).toEqual(["LegacyCyber00001"]);
  expect(result.allowed).toEqual(["program", "cyberware"]);
  expect(result.skillType).toBe("localExpert");
  expect(result.abilities).toEqual(
    expect.arrayContaining([
      { name: "Surgery Skill", rank: 2 },
      { name: "Surgery", rank: 1 },
      { name: "Custom ability", rank: 3 },
    ]),
  );
  expect(result.nestedSource).toEqual([{ book: "Core", page: 352 }]);
  expect(result.childSource).toEqual([{ book: "Core", page: 341 }]);
  expect(result.childQuality).toBe("excellent");
  expect(result.oldTree).toBeNull();
  expect(result.legacySource).toBeNull();
  expect(result.childVersion).toBe(result.latest);
  expect(result.locked).toBe(true);
  expect(result.invalidActors).toEqual([]);
  expect(result.invalidItems).toEqual([]);
});
