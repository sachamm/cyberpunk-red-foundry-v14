import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createDocumentViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  installUpgrade,
  setItemField,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * UI-driven tests for the read-only, chip-based item-sheet HEADER (issue #1286).
 *
 * The header (`.item-top-pane`) is a display-only, three-row layout that
 * surfaces an item's identity and headline stats without any editable controls
 * (all editing lives on the Settings tab). The rows are:
 *   - row 1: a breadcrumb classification (`.item-header-breadcrumb`, left) and
 *     the item's source citation(s) (`.item-header-sources`, right);
 *   - row 2: the item name (`.item-header-name`);
 *   - row 3: the headline stat chips (`.item-header-chips`, whose chip children
 *     are `.cpr-browser-chip`) and, for priced/valuable types, the price
 *     (`.item-header-price`).
 * Alongside this, the description tab (`.item-description-tab`) lost its stat
 * SIDEBAR (`.item-summary-section`) and is now full width.
 *
 * These specs create items programmatically with exactly the fields under test,
 * render the item's own sheet, resolve the rendered sheet's DOM id via
 * `expectSheetRendered`, and read the RENDERED header text through the sheet DOM
 * (`game.locator`) — never via the header-building code. game.evaluate is used
 * only to create/configure items (setup) and, for the upgrade case, to read
 * state, never to perform the assertion under test. Assertions match on
 * `.textContent()` substrings and never assume the breadcrumb/chip internal
 * element structure, per the pinned DOM contract.
 */

// Create a world item of `type` carrying `system`, render its sheet, and return
// its id, the rendered sheet's DOM element id, and the item's name.
async function createItemSheet(game, { type, system = {}, prefix }) {
  const name = uniqueName(prefix ?? type);
  const id = await createItemViaUI(game, { type, name });
  // Document updates can resolve before the open sheet finishes rerendering.
  // Force and await one render so assertions never read the initial defaults.
  await game.evaluate(
    async ({ id, system }) => {
      const item = game.items.get(id);
      await item.update({ system });
      await item.sheet.render({ force: true });
    },
    { id, system },
  );
  const sheetId = await expectSheetRendered(game, { collection: "items", id });
  return { id, sheetId, name };
}

// A locator scoped to a region inside the rendered sheet root.
function region(game, sheetId, selector) {
  return game.locator(`#${sheetId} ${selector}`);
}

// The trimmed text content of a region inside the rendered sheet (empty string
// if the region is absent).
async function regionText(game, sheetId, selector) {
  const loc = region(game, sheetId, selector);
  if ((await loc.count()) === 0) return "";
  return ((await loc.first().textContent()) ?? "").trim();
}

// The trimmed text of the single header chip that carries the ROF stat (the
// chip whose text is "ROF {value}"). Asserts exactly one such chip exists so a
// value assertion can't silently pass against a missing/duplicated chip.
async function rofChipText(game, sheetId) {
  const chip = region(
    game,
    sheetId,
    ".item-header-chips .cpr-browser-chip",
  ).filter({ hasText: "ROF" });
  await expect(chip).toHaveCount(1);
  return ((await chip.textContent()) ?? "").trim();
}

// --- Owned-upgrade wiring helpers (mirroring weapon-upgrades.spec.mjs) --------

// Render an embedded (actor-owned) item's own sheet and return its DOM element
// id. Owned items aren't in game.items, so this can't go through
// expectSheetRendered (which resolves via game.items/game.actors).
async function renderEmbeddedItemSheet(game, { actorId, itemId }) {
  await game.evaluate(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId).sheet.render(true),
    { actorId, itemId },
  );
  await game.waitForFunction(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId).sheet?.rendered === true,
    { actorId, itemId },
    { timeout: 15000 },
  );
  const sheetId = await game.evaluate(
    ({ actorId, itemId }) =>
      game.actors.get(actorId).items.get(itemId).sheet.element?.id ?? null,
    { actorId, itemId },
  );
  expect(sheetId).toBeTruthy();
  await expect(game.locator(`#${sheetId}`)).toBeVisible();
  return sheetId;
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Item sheet header (read-only chip layout)", () => {
  // ---- Breadcrumb ---------------------------------------------------------

  test("weapon breadcrumb shows its weapon type and an Excellent quality segment", async ({
    page: game,
  }) => {
    const { id, sheetId, name } = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-excellent",
      system: { weaponType: "sniperRifle", quality: "excellent" },
    });

    const crumb = await regionText(game, sheetId, ".item-header-breadcrumb");
    // Weapon type (Sniper Rifle -> contains "Rifle") and the quality segment.
    expect(crumb).toContain("Rifle");
    expect(crumb).toContain("Excellent");

    // Row 2 carries the item name.
    expect(await regionText(game, sheetId, ".item-header-name")).toContain(
      name,
    );

    await closeDocSheet(game, { collection: "items", id });
  });

  test("a Standard-quality weapon breadcrumb omits the quality segment", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-standard",
      system: { weaponType: "sniperRifle", quality: "standard" },
    });

    const crumb = await regionText(game, sheetId, ".item-header-breadcrumb");
    // The weapon type still shows...
    expect(crumb).toContain("Rifle");
    // ...but the default "standard" quality is not surfaced as a segment.
    expect(crumb).not.toContain("Standard");
    expect(crumb).not.toContain("Excellent");
    expect(crumb).not.toContain("Poor");

    await closeDocSheet(game, { collection: "items", id });
  });

  test("armor covering Head and Body joins both locations with ' & '", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "armor",
      prefix: "armor-headbody",
      system: { isHeadLocation: true, isBodyLocation: true },
    });

    const crumb = await regionText(game, sheetId, ".item-header-breadcrumb");
    expect(crumb).toContain("Head");
    expect(crumb).toContain("Body");
    expect(crumb).toContain("&");

    await closeDocSheet(game, { collection: "items", id });
  });

  test("a Black ICE program breadcrumb shows the class and Black ICE type", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "program",
      prefix: "prog-blackice",
      system: { class: "blackice", blackIceType: "antipersonnel" },
    });

    const crumb = await regionText(game, sheetId, ".item-header-breadcrumb");
    expect(crumb).toContain("Black ICE");
    expect(crumb).toContain("Anti-Personnel");

    await closeDocSheet(game, { collection: "items", id });
  });

  test("a role breadcrumb shows only its type, with no subtype segment", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "role",
      prefix: "role-plain",
    });

    // A role has no subtype, so the breadcrumb is exactly the type label.
    const crumb = await regionText(game, sheetId, ".item-header-breadcrumb");
    expect(crumb).toBe("Role");

    await closeDocSheet(game, { collection: "items", id });
  });

  // ---- Chips --------------------------------------------------------------

  test("weapon chips show headline stats and exclude a non-headline stat", async ({
    page: game,
  }) => {
    const SENTINEL = "ZZZSENTINELDV";
    const { id, sheetId } = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-chips",
      system: { damage: "3d6", rof: 2, dvTable: SENTINEL },
    });

    const chipsText = await regionText(game, sheetId, ".item-header-chips");
    // Headline stats surface as chips.
    expect(chipsText).toContain("3d6");
    expect(chipsText).toContain("ROF");
    // There is at least one chip element.
    expect(
      await region(
        game,
        sheetId,
        ".item-header-chips .cpr-browser-chip",
      ).count(),
    ).toBeGreaterThan(0);
    // A non-headline stat (the weapon's DV table name) is not promoted to a chip.
    expect(chipsText).not.toContain(SENTINEL);

    await closeDocSheet(game, { collection: "items", id });
  });

  test("the Autofire chip appears only when autofire is set", async ({
    page: game,
  }) => {
    // No autofire -> no Autofire chip.
    const off = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-af-off",
      system: {
        weaponType: "assaultRifle",
        isRanged: true,
        fireModes: { autoFire: 0 },
      },
    });
    expect(
      await regionText(game, off.sheetId, ".item-header-chips"),
    ).not.toContain("Autofire");
    await closeDocSheet(game, { collection: "items", id: off.id });

    // Autofire set -> Autofire chip present.
    const on = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-af-on",
      system: {
        weaponType: "assaultRifle",
        isRanged: true,
        fireModes: { autoFire: 3 },
      },
    });
    expect(await regionText(game, on.sheetId, ".item-header-chips")).toContain(
      "Autofire",
    );
    await closeDocSheet(game, { collection: "items", id: on.id });
  });

  test("the Humanity Loss chip appears only when humanity loss is nonzero", async ({
    page: game,
  }) => {
    // humanityLoss.static 0 -> no HL chip.
    const zero = await createItemSheet(game, {
      type: "cyberware",
      prefix: "cyb-hl-zero",
      system: { humanityLoss: { roll: "0", static: 0 } },
    });
    expect(
      await regionText(game, zero.sheetId, ".item-header-chips"),
    ).not.toContain("HL");
    await closeDocSheet(game, { collection: "items", id: zero.id });

    // humanityLoss.static 5 -> "5 HL" chip.
    const some = await createItemSheet(game, {
      type: "cyberware",
      prefix: "cyb-hl-some",
      system: { humanityLoss: { static: 5 } },
    });
    expect(
      await regionText(game, some.sheetId, ".item-header-chips"),
    ).toContain("HL");
    await closeDocSheet(game, { collection: "items", id: some.id });
  });

  test("a flag chip (Concealable) appears only when the flag is true", async ({
    page: game,
  }) => {
    // Concealable true -> Concealable chip.
    const yes = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-conceal-yes",
      system: { concealable: { concealable: true } },
    });
    expect(await regionText(game, yes.sheetId, ".item-header-chips")).toContain(
      "Concealable",
    );
    await closeDocSheet(game, { collection: "items", id: yes.id });

    // Concealable false -> no Concealable chip.
    const no = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-conceal-no",
      system: { concealable: { concealable: false } },
    });
    expect(
      await regionText(game, no.sheetId, ".item-header-chips"),
    ).not.toContain("Concealable");
    await closeDocSheet(game, { collection: "items", id: no.id });
  });

  // ---- Promotions (brand / price / sources out of the chip row) -----------

  test("brand, price, and sources are promoted out of the chip row", async ({
    page: game,
  }) => {
    const BRAND = "ZZZBrandCo";
    const BOOK = "PromoBook";
    const { id, sheetId } = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-promo",
      system: {
        brand: BRAND,
        // A sub-1000 market price avoids any thousands-separator formatting.
        price: { market: 555 },
        sources: [{ book: BOOK, page: 9 }],
        damage: "2d6",
      },
    });

    // Brand -> breadcrumb (not a chip).
    expect(
      await regionText(game, sheetId, ".item-header-breadcrumb"),
    ).toContain(BRAND);
    // Price -> price region (not a chip).
    expect(await regionText(game, sheetId, ".item-header-price")).toContain(
      "555",
    );
    // Source(s) -> sources region (not a chip).
    expect(await regionText(game, sheetId, ".item-header-sources")).toContain(
      BOOK,
    );

    // None of the promoted values leak into the chip row.
    const chipsText = await regionText(game, sheetId, ".item-header-chips");
    expect(chipsText).not.toContain(BRAND);
    expect(chipsText).not.toContain("555");
    expect(chipsText).not.toContain(BOOK);

    await closeDocSheet(game, { collection: "items", id });
  });

  // ---- Sources ------------------------------------------------------------

  test("multiple sources show only the first, the rest in a hover tooltip", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "gear",
      prefix: "gear-multisrc",
      system: {
        sources: [
          { book: "BookAlpha", page: 11 },
          { book: "BookBravo", page: 22 },
          { book: "BookCharlie", page: 33 },
        ],
      },
    });

    // Only the first source is shown inline; the others are not visible text.
    const sources = await regionText(game, sheetId, ".item-header-sources");
    expect(sources).toBe("BookAlpha pg. 11");
    expect(sources).not.toContain("BookBravo");
    expect(sources).not.toContain("BookCharlie");

    // The remaining sources live in the hover tooltip, one per <br> line.
    const tooltip = await region(
      game,
      sheetId,
      ".item-header-sources",
    ).getAttribute("data-tooltip-html");
    expect(tooltip).toBe("BookBravo pg. 22<br>BookCharlie pg. 33");

    await closeDocSheet(game, { collection: "items", id });
  });

  test("a single source shows inline with no tooltip", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "gear",
      prefix: "gear-onesrc",
      system: { sources: [{ book: "SoloBook", page: 7 }] },
    });

    const sources = await regionText(game, sheetId, ".item-header-sources");
    expect(sources).toBe("SoloBook pg. 7");

    // Nothing hidden -> no hover tooltip is attached.
    const tooltip = await region(
      game,
      sheetId,
      ".item-header-sources",
    ).getAttribute("data-tooltip-html");
    expect(tooltip).toBeNull();

    await closeDocSheet(game, { collection: "items", id });
  });

  // ---- Sidebar removed / header read-only ---------------------------------

  test("the description tab has no stat sidebar and the header has no editable fields", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-readonly",
      system: { damage: "1d6" },
    });

    // The description tab exists and is full width — the stat sidebar is gone.
    await expect(region(game, sheetId, ".item-description-tab")).toBeVisible();
    expect(await region(game, sheetId, ".item-summary-section").count()).toBe(
      0,
    );

    // The header is display-only: no inputs/selects/textareas/contenteditable.
    // (The item image `<img data-edit="img">` is an img, not an input, so it is
    // deliberately excluded from this count.)
    expect(
      await region(
        game,
        sheetId,
        '.item-top-pane input, .item-top-pane select, .item-top-pane textarea, .item-top-pane [contenteditable="true"]',
      ).count(),
    ).toBe(0);

    await closeDocSheet(game, { collection: "items", id });
  });

  // ---- Layout robustness (the misalignment fix) ---------------------------

  test("header renders intact with a long multi-source citation and many chips", async ({
    page: game,
  }) => {
    const { id, sheetId } = await createItemSheet(game, {
      type: "weapon",
      prefix: "wpn-dense-header",
      system: {
        weaponType: "sniperRifle",
        quality: "excellent",
        brand: "LongBrandName Industries",
        isRanged: true,
        damage: "3d6",
        rof: 2,
        fireModes: { autoFire: 3 },
        concealable: { concealable: true },
        sources: [
          { book: "First Long Source Book", page: 101 },
          { book: "Second Long Source Book", page: 202 },
          { book: "Third Long Source Book", page: 303 },
        ],
      },
    });

    // The sheet renders without error and both row-1 regions are present and
    // non-empty (the misalignment fix keeps breadcrumb and sources both shown).
    await expect(game.locator(`#${sheetId}`)).toBeVisible();

    const breadcrumb = region(game, sheetId, ".item-header-breadcrumb");
    await expect(breadcrumb).toBeVisible();
    expect((await breadcrumb.textContent()).trim().length).toBeGreaterThan(0);

    const sources = region(game, sheetId, ".item-header-sources");
    await expect(sources).toBeVisible();
    const sourcesText = (await sources.textContent()).trim();
    // Only the first source shows inline; the rest are carried in the tooltip.
    expect(sourcesText).toContain("First Long Source Book");
    expect(sourcesText).not.toContain("Third Long Source Book");
    const sourcesTooltip = await sources.getAttribute("data-tooltip-html");
    expect(sourcesTooltip).toContain("Third Long Source Book");

    // Many headline stats -> several chips, still rendered.
    expect(
      await region(
        game,
        sheetId,
        ".item-header-chips .cpr-browser-chip",
      ).count(),
    ).toBeGreaterThan(1);

    await closeDocSheet(game, { collection: "items", id });
  });

  // ---- Upgrade adjustment -------------------------------------------------

  test("an owned weapon with an installed upgrade shows the adjusted ROF chip, while a world copy shows the base ROF", async ({
    page: game,
  }) => {
    // The header applies upgrade-adjusted stat values only for ACTOR-OWNED,
    // upgraded items; world/compendium copies show base values. This drives the
    // full owned-upgrade flow (create → embed → install) and reads the ROF chip
    // off both the owned weapon's sheet (adjusted) and the world weapon's sheet
    // (base). ROF is one of the header's upgrade-adjusted fields, and its base
    // value is a stable 1 (attackable-schema default), so a +N modifier gives an
    // unambiguous adjusted value to assert against.

    // 1. Character to own the upgraded weapon.
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    // 2. A world weapon at its default ROF of 1. Its own sheet is the BASE
    //    reference: a world item is never "upgraded", so its chip stays "ROF 1".
    const weaponName = uniqueName("upg-weapon");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: weaponName,
    });
    const worldWeaponSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: weaponId,
    });
    expect(await rofChipText(game, worldWeaponSheetId)).toBe("ROF 1");
    await closeDocSheet(game, { collection: "items", id: weaponId });

    // 3. A weapon itemUpgrade whose ROF modifier adds +4. itemUpgrade.system.type
    //    defaults to "weapon", so it targets weapons; the rof data point is a
    //    "modifier" type, summed onto the host weapon's base ROF.
    const upgradeName = uniqueName("rof-upgrade");
    const upgradeId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "itemUpgrade",
      name: upgradeName,
    });
    const upgradeSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: upgradeId,
    });
    expect(
      await game.evaluate((id) => game.items.get(id).system.type, upgradeId),
    ).toBe("weapon");
    await setItemField(game, {
      sheetId: upgradeSheetId,
      itemId: upgradeId,
      name: "system.modifiers.rof.value",
      path: "system.modifiers.rof.value",
      value: 4,
    });
    await closeDocSheet(game, { collection: "items", id: upgradeId });

    // 4. Put both on the character and resolve their embedded ids.
    await dragItemToActorSheet(game, {
      itemId: weaponId,
      sheetId: actorSheetId,
      actorId,
    });
    await dragItemToActorSheet(game, {
      itemId: upgradeId,
      sheetId: actorSheetId,
      actorId,
    });
    const embeddedWeaponId = await game.evaluate(
      ({ actorId, weaponName }) =>
        game.actors.get(actorId).items.find((i) => i.name === weaponName).id,
      { actorId, weaponName },
    );
    const embeddedUpgradeId = await game.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName).id,
      { actorId, upgradeName },
    );

    // 5. Install the upgrade into the embedded weapon via the Gear-tab flow.
    await installUpgrade(game, {
      actorSheetId,
      actorId,
      upgradeId: embeddedUpgradeId,
      targetId: embeddedWeaponId,
    });
    // Confirm the install landed (state read only, not the assertion under test).
    expect(
      await game.evaluate(
        ({ actorId, weaponId }) =>
          game.actors.get(actorId).items.get(weaponId).system.isUpgraded,
        { actorId, weaponId: embeddedWeaponId },
      ),
    ).toBe(true);

    // 6. The OWNED weapon's own sheet shows the upgrade-ADJUSTED ROF (1 + 4 = 5),
    //    not the base 1 — the acceptance criterion under test.
    const ownedSheetId = await renderEmbeddedItemSheet(game, {
      actorId,
      itemId: embeddedWeaponId,
    });
    expect(await rofChipText(game, ownedSheetId)).toBe("ROF 5");

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
