import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

/*
 * Unit test for migration 044 (SourceToSources): it converts each item's legacy
 * system.source (a single { book, page } object) into system.sources (an array),
 * then deletes the old key. A non-empty book wraps into a single-element array; a
 * blank book converts to an empty array. Items with no legacy system.source at all
 * are left untouched (idempotent / no-op).
 *
 * Note on the deletion seam: like every migration in this system, the old key is
 * removed via Foundry's deferred-deletion directive — updateItem() sets
 * system["-=source"] = null, and the field is only actually removed later when the
 * mutated data is applied via document.update(). At the updateItem(plainObject)
 * seam tested here the original `source` key is still present alongside the new
 * `-=source` marker. To assert on the real end state we realize the deletion the
 * same way Foundry would, via mergeObject(..., { applyOperators: true }).
 */

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("044 migration converts system.source into system.sources", async ({
  page: game,
}) => {
  const out = await game.evaluate(async () => {
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/044-source-to-sources.js`
    );
    const migration = new M.default();

    // Non-empty book: wraps into a single-element sources array.
    const withBook = {
      type: "gear",
      system: { source: { book: "Core", page: 357 } },
    };
    await migration.updateItem(withBook);
    // Apply the `-=source` deletion marker the way document.update() would.
    const withBookApplied = foundry.utils.mergeObject(
      { source: { book: "Core", page: 357 } },
      withBook.system,
      { applyOperators: true },
    );

    // Blank book: converts to an empty sources array.
    const blankBook = {
      type: "gear",
      system: { source: { book: "", page: 0 } },
    };
    await migration.updateItem(blankBook);
    const blankBookApplied = foundry.utils.mergeObject(
      { source: { book: "", page: 0 } },
      blankBook.system,
      { applyOperators: true },
    );

    // Whitespace-only book: counts as blank, converts to an empty sources array.
    const whitespaceBook = {
      type: "gear",
      system: { source: { book: "   ", page: 5 } },
    };
    await migration.updateItem(whitespaceBook);
    const whitespaceBookApplied = foundry.utils.mergeObject(
      { source: { book: "   ", page: 5 } },
      whitespaceBook.system,
      { applyOperators: true },
    );

    // No legacy source at all: left untouched (no-op / idempotent).
    const noSource = { type: "gear", system: {} };
    await migration.updateItem(noSource);

    return {
      version: M.default.version,
      withBookSources: withBookApplied.sources,
      withBookHasSourceKey: "source" in withBookApplied,
      blankBookSources: blankBookApplied.sources,
      blankBookHasSourceKey: "source" in blankBookApplied,
      whitespaceBookSources: whitespaceBookApplied.sources,
      whitespaceBookHasSourceKey: "source" in whitespaceBookApplied,
      noSourceSources: noSource.system.sources,
    };
  });

  expect(out.version).toBe(44);

  // Non-empty book wraps into a single-element sources array; old key gone.
  expect(out.withBookSources).toEqual([{ book: "Core", page: 357 }]);
  expect(out.withBookHasSourceKey).toBe(false);

  // Blank book converts to an empty sources array; old key gone.
  expect(out.blankBookSources).toEqual([]);
  expect(out.blankBookHasSourceKey).toBe(false);

  // Whitespace-only book counts as blank: empty sources array; old key gone.
  expect(out.whitespaceBookSources).toEqual([]);
  expect(out.whitespaceBookHasSourceKey).toBe(false);

  // No legacy source at all: left untouched, no-op.
  expect(out.noSourceSources).toBeUndefined();
});

/*
 * Regression for the #1574 review finding: the migration logic above is correct
 * in isolation, but in production it never received the legacy value. Foundry's
 * SchemaField cleaning deletes any `_source` key not declared in the schema on
 * load, so once `source` was removed from CommonSchema, `doc.toObject()` no
 * longer carried `system.source` and the migration read `undefined` — silently
 * discarding the book/page. The fix keeps `source` declared (tagged
 * `deprecate`) so its value survives cleaning and reaches the migration. Unlike
 * the isolated test above, this one persists a real Item and reads it back
 * through the cleaning seam, then migrates the realized document data.
 */
test("044 migration preserves a persisted legacy source through schema cleaning", async ({
  page: game,
}) => {
  const out = await game.evaluate(async () => {
    // A real item carrying only the legacy single `source` (as a pre-migration
    // world item would). Persisting + reading back exercises schema cleaning.
    const item = await Item.create({
      name: "srcMigrationRegression",
      type: "gear",
      system: { source: { book: "Book of secrets", page: 666 } },
    });
    // The deprecated field must survive cleaning — otherwise this is undefined
    // and the migration below has nothing to read (the original data loss).
    const persistedSource = item.toObject().system.source;

    // Migrate the realized document data, then apply the `-=source` deletion the
    // way document.update() would (mirroring the isolated test's seam).
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/044-source-to-sources.js`
    );
    const itemData = item.toObject();
    await new M.default().updateItem(itemData);
    const applied = foundry.utils.mergeObject({}, itemData.system, {
      applyOperators: true,
    });

    await item.delete();
    return {
      persistedSource,
      migratedSources: applied.sources,
      sourceKeyGone: !("source" in applied),
    };
  });

  // The legacy source survives schema cleaning (the crux of the fix)...
  expect(out.persistedSource).toEqual({ book: "Book of secrets", page: 666 });
  // ...and the migration folds it into `sources`, dropping the old key.
  expect(out.migratedSources).toEqual([{ book: "Book of secrets", page: 666 }]);
  expect(out.sourceKeyGone).toBe(true);
});
