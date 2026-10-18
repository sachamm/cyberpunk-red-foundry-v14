import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  DROP_TAB_BY_TYPE,
  ITEM_TYPES,
  closeDocSheet,
  createItemViaUI,
  dragItemToActorSheet,
  openItemSettings,
  openOwnedItemSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";
import { createCharacterViaUI } from "../actors/character-sheet-helpers.mjs";

/*
 * Composition (rendering-contract) test for the item sheet.
 *
 * The Settings tab renders one partial per data-model mixin: cpr-item-settings.hbs
 * loops over `cprGetTemplates(item.type)` — i.e. `CONFIG.Item.dataModels[type].mixins`
 * minus "common" — and includes `settings/mixin/cpr-<mixin>.hbs` for each entry.
 * This spec pins that contract: for every item type, the sections rendered on a
 * freshly created, owned, editable item sheet must match exactly the mixins its
 * data model declares. If a partial stops rendering its characteristic field, or a
 * template starts including a section its data model does not declare, the matching
 * type fails.
 *
 * Each mixin is recognised by one characteristic element (see MIXIN_MARKERS); the
 * effects mixin renders as a tab button instead of a Settings row. Two documented
 * exceptions to the plain "mixin declared => section rendered" rule:
 *   - attackable: weapon always renders it; cyberware only when system.isWeapon and
 *     itemUpgrade only when modifiers.secondaryWeapon.configured (both false on a
 *     fresh item) — those two types include the partial from their own template.
 *   - equippable: the section renders only for owned items, so every type is tested
 *     through an item dragged onto a character.
 *
 * installable and loadable have no Settings-tab surface (their partials are empty;
 * the magazine fields live in the attackable partial), so they are excluded from
 * this matrix — their behaviour is pinned by the I/L specs instead.
 */

// One characteristic element per mixin, all inside the rendered item sheet.
const MIXIN_MARKERS = {
  attackable: 'input[name="system.rof"]',
  container: '[data-target="system.installedItems.allowed"]',
  electronic: '[data-target="system.isElectronic"]',
  equippable: 'select[name="system.equipped"]',
  physical: 'input[name="system.brand"]',
  quality: 'select[name="system.quality"]',
  stackable: 'input[name="system.amount"]',
  upgradable:
    'a.manage-installed-upgrades[data-item-prop="manage-installed-upgrades"]',
  valuable: 'input[name="system.price.market"]',
};

// The effects mixin renders as a tab button, not a Settings row, so it is covered
// by EFFECTS_TAB_MARKER rather than MIXIN_MARKERS. installable and loadable have an
// intentionally empty settings partial (their behaviour is pinned by the I/L specs).
const COVERED_MIXINS = new Set([
  ...Object.keys(MIXIN_MARKERS),
  "effects",
  "installable",
  "loadable",
]);

const EFFECTS_TAB_MARKER = '.navtabs-item a[data-tab="item-effects"]';

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

/**
 * Open the owned item's sheet by clicking its name link on the character sheet
 * section where the type is listed (skills use the edit pencil instead of a name
 * link). A plain click renders the sheet editable (cpr-actor-sheet.js _renderItemCard).
 */
async function openOwnedSheetFromRow(
  page,
  { actorId, sheetId, embeddedId, type },
) {
  await page
    .locator(`#${sheetId} a[data-tab="${DROP_TAB_BY_TYPE[type]}"]`)
    .click();
  // Critical injuries carry data-item-id on the name link itself; every other
  // section puts it on an ancestor row. Skills open via the edit pencil, since
  // their name link rolls the skill instead of opening the sheet.
  const link =
    type === "criticalInjury"
      ? page.locator(`#${sheetId} a.item-edit[data-item-id="${embeddedId}"]`)
      : page
          .locator(
            `#${sheetId} [data-item-id="${embeddedId}"] a.item-edit${type === "skill" ? ".skill-custom" : ""}`,
          )
          .first();
  await expect(link).toBeVisible();
  await link.click();
  return openOwnedItemSheet(page, { actorId, itemId: embeddedId });
}

test.describe("Item sheet composition", () => {
  for (const type of ITEM_TYPES) {
    test(`renders exactly the sections declared by ${type}'s data model`, async ({
      page: game,
    }) => {
      const { actorId, sheetId } = await createCharacterViaUI(game);

      // Fresh item of this type, owned by the character.
      const name = uniqueName(type);
      const itemId = await createItemViaUI(game, { type, name });
      await closeDocSheet(game, { collection: "items", id: itemId });
      await dragItemToActorSheet(game, { itemId, sheetId, actorId });

      const embeddedId = await game.evaluate(
        ({ actorId, name }) =>
          game.actors.get(actorId).items.find((i) => i.name === name)?.id ??
          null,
        { actorId, name },
      );
      expect(
        embeddedId,
        `${type} item should be embedded on the character`,
      ).toBeTruthy();

      const itemSheetId = await openOwnedSheetFromRow(game, {
        actorId,
        sheetId,
        embeddedId,
        type,
      });
      const settings = await openItemSettings(game, itemSheetId);

      // The contract's two sides: the data model's mixin list (the same source the
      // template loop reads) and the gate values a fresh item must satisfy.
      const { mixins, isWeapon, secondaryConfigured } = await game.evaluate(
        ({ type, actorId, embeddedId }) => {
          const item = game.actors.get(actorId).items.get(embeddedId);
          return {
            mixins: CONFIG.Item.dataModels[type].mixins.filter(
              (m) => m !== "common",
            ),
            isWeapon: item.system.isWeapon ?? null,
            secondaryConfigured:
              item.system.modifiers?.secondaryWeapon?.configured ?? null,
          };
        },
        { type, actorId, embeddedId },
      );

      // The spec must cover every mixin a data model can declare; adding a new one
      // without a marker here would otherwise pass vacuously.
      const uncovered = mixins.filter((m) => !COVERED_MIXINS.has(m));
      expect(
        uncovered,
        `${type}: spec must cover every data-model mixin; uncovered: ${uncovered.join(", ")}`,
      ).toEqual([]);

      const renders = (mixin) => {
        if (!mixins.includes(mixin)) return false;
        if (mixin === "attackable") {
          if (type === "cyberware") return isWeapon === true;
          if (type === "itemUpgrade") return secondaryConfigured === true;
        }
        return true;
      };

      const describeCell = (mixin, count) =>
        `${type}: ${mixin} marker rendered ${count} time(s); data model declares [${mixins.join(", ")}]`;

      for (const [mixin, selector] of Object.entries(MIXIN_MARKERS)) {
        const count = await settings.locator(selector).count();
        if (renders(mixin)) {
          expect(count, describeCell(mixin, count)).toBeGreaterThanOrEqual(1);
        } else {
          expect(count, describeCell(mixin, count)).toBe(0);
        }
      }

      const effectsCount = await game
        .locator(`#${itemSheetId} ${EFFECTS_TAB_MARKER}`)
        .count();
      if (renders("effects")) {
        expect(effectsCount, describeCell("effects", effectsCount)).toBe(1);
      } else {
        expect(effectsCount, describeCell("effects", effectsCount)).toBe(0);
      }
    });
  }
});
