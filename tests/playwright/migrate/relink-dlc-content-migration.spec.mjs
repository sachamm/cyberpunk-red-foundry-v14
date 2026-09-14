import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

const OLD_WEAPON_UUID =
  "Compendium.cyberpunk-red-core.core_weapons-branded.Item.fUo0HrfEC83Wb7wj";
const NEW_WEAPON_UUID =
  "Compendium.cyberpunk-red-dlc.dlc_weapons.Item.fUo0HrfEC83Wb7wj";
const OLD_STATUS_IMG =
  "systems/cyberpunk-red-core/icons/compendium/status/sixgun.svg";
const NEW_STATUS_IMG = "modules/cyberpunk-red-dlc/icons/dlc/status/sixgun.svg";
const OLD_READIED_ACTION_IMG =
  "systems/cyberpunk-red-core/icons/compendium/status/readied_action.svg";
const NEW_TIMEWARP_IMG =
  "modules/cyberpunk-red-dlc/icons/dlc/status/timewarp.svg";
const OLD_UPGRADE_IMG =
  "systems/cyberpunk-red-core/icons/compendium/spinning_your_wheels/bulletproof_glass.svg";
const NEW_UPGRADE_IMG =
  "systems/cyberpunk-red-core/icons/compendium/upgrades/bulletproof_glass.svg";

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("046 migration relinks moved content recursively and idempotently", async ({
  page: game,
}) => {
  const out = await game.evaluate(
    async ({
      oldWeaponUuid,
      oldStatusImg,
      oldReadiedActionImg,
      oldUpgradeImg,
    }) => {
      const M = await import(
        `/systems/${game.system.id}/modules/system/migrate/scripts/046-relink-dlc-content.js`
      );
      const migration = new M.default();
      const data = {
        img: oldUpgradeImg,
        system: {
          description: {
            value: `<p>@UUID[${oldWeaponUuid}]{Snipe-Star}</p><img src="${oldStatusImg}">`,
          },
        },
        effects: [
          { name: "Moved status", img: oldStatusImg },
          { name: "Timewarp Primary", img: oldReadiedActionImg },
          { name: "Readied Action", img: oldReadiedActionImg },
        ],
        untouched:
          "systems/cyberpunk-red-core/icons/compendium/status/acid.svg",
      };

      await migration.updateActor(data);
      const firstPassChanged = data.img !== oldUpgradeImg;
      const secondPassChanged = M.relinkDlcContent(data);

      return {
        version: M.default.version,
        firstPassChanged,
        secondPassChanged,
        data,
      };
    },
    {
      oldWeaponUuid: OLD_WEAPON_UUID,
      oldStatusImg: OLD_STATUS_IMG,
      oldReadiedActionImg: OLD_READIED_ACTION_IMG,
      oldUpgradeImg: OLD_UPGRADE_IMG,
    },
  );

  expect(out.version).toBe(46);
  expect(out.firstPassChanged).toBe(true);
  expect(out.secondPassChanged).toBe(false);
  expect(out.data.img).toBe(NEW_UPGRADE_IMG);
  expect(out.data.system.description.value).toContain(NEW_WEAPON_UUID);
  expect(out.data.system.description.value).toContain(NEW_STATUS_IMG);
  expect(out.data.effects[0].img).toBe(NEW_STATUS_IMG);
  expect(out.data.effects[1].img).toBe(NEW_TIMEWARP_IMG);
  expect(out.data.effects[2].img).toBe(OLD_READIED_ACTION_IMG);
  expect(out.data.untouched).toBe(
    "systems/cyberpunk-red-core/icons/compendium/status/acid.svg",
  );
});

test("046 migration persists item, journal, table, and macro links", async ({
  page: game,
}) => {
  const out = await game.evaluate(
    async ({
      oldWeaponUuid,
      oldStatusImg,
      oldReadiedActionImg,
      oldUpgradeImg,
    }) => {
      const M = await import(
        `/systems/${game.system.id}/modules/system/migrate/scripts/046-relink-dlc-content.js`
      );
      const migration = new M.default();
      const marker = foundry.utils.randomID();
      let item;
      let journal;
      let table;
      let macro;
      let scene;
      let tablePack;
      let packedTableId;

      try {
        item = await Item.create({
          name: `DLC migration item ${marker}`,
          type: "gear",
          img: oldUpgradeImg,
          system: {
            description: { value: `@UUID[${oldWeaponUuid}]{Old weapon}` },
          },
          effects: [
            {
              name: "Moved status",
              img: oldStatusImg,
              changes: [],
              disabled: false,
              duration: {},
              statuses: [],
              transfer: false,
            },
            {
              name: "Timewarp Primary",
              img: oldReadiedActionImg,
              changes: [],
              disabled: false,
              duration: {},
              statuses: [],
              transfer: false,
            },
            {
              name: "Readied Action",
              img: oldReadiedActionImg,
              changes: [],
              disabled: false,
              duration: {},
              statuses: [],
              transfer: false,
            },
          ],
        });
        journal = await JournalEntry.create({
          name: `DLC migration journal ${marker}`,
          pages: [
            {
              name: "Moved link",
              type: "text",
              text: { content: `@UUID[${oldWeaponUuid}]{Old weapon}` },
            },
          ],
        });
        table = await RollTable.create({
          name: `DLC migration table ${marker}`,
          formula: "1d1",
          results: [
            {
              type: CONST.TABLE_RESULT_TYPES.COMPENDIUM,
              name: "Old weapon",
              description: "",
              documentUuid: oldWeaponUuid.replace(".Item.", "."),
              img: oldStatusImg,
              weight: 1,
              range: [1, 1],
              drawn: false,
            },
          ],
        });
        tablePack = await CompendiumCollection.createCompendium({
          label: `DLC migration tables ${marker}`,
          name: `dlc-migration-${marker.toLowerCase()}`,
          type: "RollTable",
          package: game.world.id,
        });
        await tablePack.configure({ locked: false });
        packedTableId = (await tablePack.importDocument(table)).id;
        await tablePack.configure({ locked: true });
        macro = await Macro.create({
          name: `DLC migration macro ${marker}`,
          type: "script",
          scope: "global",
          command: `await fromUuid("${oldWeaponUuid}");`,
        });
        scene = await Scene.create({
          name: `DLC migration scene ${marker}`,
          width: 1000,
          height: 1000,
          grid: { size: 100, type: CONST.GRID_TYPES.SQUARE },
          tiles: [
            {
              texture: { src: oldUpgradeImg },
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
          ],
        });

        const itemData = item.toObject();
        await migration.updateItem(itemData);
        await item.update(itemData, { noHook: true, diff: false });
        await migration.migrateMisc();

        const persistedItem = game.items.get(item.id);
        const persistedPage = game.journal.get(journal.id).pages.contents[0];
        const persistedResult = game.tables.get(table.id).results.contents[0];
        const persistedPackedTable = await tablePack.getDocument(packedTableId);
        const persistedPackedResult = persistedPackedTable.results.contents[0];
        const persistedMacro = game.macros.get(macro.id);
        const persistedTile = game.scenes.get(scene.id).tiles.contents[0];

        return {
          itemImg: persistedItem.img,
          itemDescription: persistedItem.system.description.value,
          effectImg: persistedItem.effects.contents[0].img,
          timewarpImg: persistedItem.effects.contents[1].img,
          readiedActionImg: persistedItem.effects.contents[2].img,
          journalContent: persistedPage.text.content,
          resultUuid: persistedResult.documentUuid,
          resultImg: persistedResult.img,
          packedResultUuid: persistedPackedResult.documentUuid,
          packedResultImg: persistedPackedResult.img,
          tablePackRelocked: tablePack.locked,
          macroCommand: persistedMacro.command,
          tileImg: persistedTile.texture.src,
        };
      } finally {
        if (tablePack) {
          await tablePack.configure({ locked: false });
          await tablePack.deleteCompendium();
        }
        await Promise.allSettled([
          item?.delete(),
          journal?.delete(),
          table?.delete(),
          macro?.delete(),
          scene?.delete(),
        ]);
      }
    },
    {
      oldWeaponUuid: OLD_WEAPON_UUID,
      oldStatusImg: OLD_STATUS_IMG,
      oldReadiedActionImg: OLD_READIED_ACTION_IMG,
      oldUpgradeImg: OLD_UPGRADE_IMG,
    },
  );

  expect(out.itemImg).toBe(NEW_UPGRADE_IMG);
  expect(out.itemDescription).toContain(NEW_WEAPON_UUID);
  expect(out.effectImg).toBe(NEW_STATUS_IMG);
  expect(out.timewarpImg).toBe(NEW_TIMEWARP_IMG);
  expect(out.readiedActionImg).toBe(OLD_READIED_ACTION_IMG);
  expect(out.journalContent).toContain(NEW_WEAPON_UUID);
  expect(out.resultUuid).toBe(NEW_WEAPON_UUID.replace(".Item.", "."));
  expect(out.resultImg).toBe(NEW_STATUS_IMG);
  expect(out.packedResultUuid).toBe(NEW_WEAPON_UUID.replace(".Item.", "."));
  expect(out.packedResultImg).toBe(NEW_STATUS_IMG);
  expect(out.tablePackRelocked).toBe(true);
  expect(out.macroCommand).toContain(NEW_WEAPON_UUID);
  expect(out.tileImg).toBe(NEW_UPGRADE_IMG);
});
