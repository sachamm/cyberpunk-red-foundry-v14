/**
 * Build a minimal fake TokenDocument that satisfies CPR's sheet `this.token`
 * checks without needing canvas or a real scene.
 *
 * CPR reads these properties from `this.token` on actor sheets:
 *   - `id`, `_id` — chat speaker / drag data token IDs
 *   - `actor` — container sheet resolves actor via token
 *   - `name` — fallback for display
 *   - `getFlag(ns, key)` — DV table flag reads
 *   - `document` — object with `getFlag` (DV autofire path)
 *   - `flags` — Black ICE program flag reads
 *   - `update()` — no-op (DV table / mook sheet calls update)
 *
 * Pass the returned object to `actor.sheet.render(true, { token: fakeToken })`
 * to make `isTokenSheet` truthy.
 */
export function fakeTokenDocument(actor) {
  const id = `fake-token-${actor.id}`;
  return {
    id,
    _id: id,
    actor,
    actorId: actor.id,
    name: actor.name,
    document: {
      getFlag(_ns, _key) {
        return undefined;
      },
      flags: {},
    },
    getFlag(_ns, _key) {
      return undefined;
    },
    flags: {},
    update() {
      return Promise.resolve();
    },
  };
}

/**
 * Open an actor sheet as a token sheet using a fake token, avoiding the need
 * for canvas / a real scene.
 *
 * Usage inside a test:
 *   const sheetId = await openTokenSheet(page, actorId);
 *
 * Returns the sheet's DOM element ID, or null if the actor is not found.
 */
export async function openTokenSheet(page, actorId) {
  const sheetId = await page.evaluate(
    async ({ actorId }) => {
      const actor = globalThis.game.actors.get(actorId);
      if (!actor) return null;
      const fakeToken = {
        id: `fake-token-${actor.id}`,
        _id: `fake-token-${actor.id}`,
        actor,
        actorId: actor.id,
        name: actor.name,
        document: {
          getFlag(_ns, _key) {
            return undefined;
          },
          flags: {},
        },
        getFlag(_ns, _key) {
          return undefined;
        },
        flags: {},
        update() {
          return Promise.resolve();
        },
      };
      await actor.sheet.render(true, { token: fakeToken });
      return actor.sheet.element?.id ?? null;
    },
    { actorId },
  );
  return sheetId;
}
