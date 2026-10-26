import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import { rollType } from "../../../tools/playwright/ui/index.mjs";

/*
 * The native-first roll engine hands the WHOLE formula to Foundry (dice, keep/drop and other pool
 * modifiers, flat terms, resolved @-refs) and treats `this.total` as authoritative; the CPR `mods` list
 * holds only external mods, so a typed flat lives in the native formula and is counted exactly once.
 * These specs guard the load-bearing invariants of that refactor:
 *   - a typed flat in a damage formula is added once, not doubled (regression guard for _computeBase);
 *   - keep-highest and friends actually apply to damage (the whole reason for going native);
 *   - `red` crit reads aggregate across every die term, not just the first;
 *   - a formula carrying both `red` and `dmg` is hard-rejected at assembly.
 *
 * Faces are forced through CONFIG.Dice.randomUniform (see red-dmg-modifiers.spec.mjs); every die in a
 * given formula shares `faces`, so one mapping covers the whole roll including any red-added dice.
 */

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("native-first engine — arbitrary formulas", () => {
  test("a typed flat in a damage formula is counted exactly once", async ({
    page: game,
  }) => {
    // 2d6 forced to 6,6 = 12; the typed +3 must be added once → 15 (not 18 from a double-count).
    const r = await rollType(
      game,
      "CPRDamageRoll",
      ["W", "2d6+3", "melee"],
      6,
      [6, 6],
    );
    expect(r.resultTotal).toBe(15);
    expect(r.critSuccess).toBe(true); // two 6s on the first term
  });

  test("keep-highest applies to a multi-die damage formula", async ({
    page: game,
  }) => {
    // 3d6kh2 forced to 6,6,1 → keeps the two 6s = 12, and both 6s make it a crit.
    const r = await rollType(
      game,
      "CPRDamageRoll",
      ["W", "3d6kh2", "melee"],
      6,
      [6, 6, 1],
    );
    expect(r.resultTotal).toBe(12);
    expect(r.critSuccess).toBe(true);
  });

  test("keep-highest drops the low die (no crit when only one max survives)", async ({
    page: game,
  }) => {
    // 3d6kh2 forced to 6,4,1 → keeps 6,4 = 10; only one 6 → not a crit.
    const r = await rollType(
      game,
      "CPRDamageRoll",
      ["W", "3d6kh2", "melee"],
      6,
      [6, 4, 1],
    );
    expect(r.resultTotal).toBe(10);
    expect(r.critSuccess).toBe(false);
  });

  test("red crit reads aggregate across all die terms, not just the first", async ({
    page: game,
  }) => {
    // First term has no red; the SECOND term explodes. Aggregated reads must still see the crit.
    // 1d10=3, then 1d10red=10 (explodes) + bonus 7 → total 20.
    const r = await rollType(
      game,
      "CPRRoll",
      ["Multi", "1d10 + 1d10red"],
      10,
      [3, 10, 7],
    );
    expect(r.critSuccess).toBe(true);
    expect(r.resultTotal).toBe(20);
  });

  test("red implode on a non-first term is also aggregated", async ({
    page: game,
  }) => {
    // 1d10=5, then 1d10red=1 (implodes) + penalty 6 (counted -6) → total 5 + 1 - 6 = 0.
    const r = await rollType(
      game,
      "CPRRoll",
      ["Multi", "1d10 + 1d10red"],
      10,
      [5, 1, 6],
    );
    expect(r.critFail).toBe(true);
    expect(r.resultTotal).toBe(0);
  });
});

test.describe("native-first engine — grouped pool damage is refused", () => {
  test("CPRDamageRoll.create throws on a `{…}kh` pool damage formula", async ({
    page: game,
  }) => {
    // A grouped pool has no single damage die for the item's crit/ablation/bonus markers to attach to,
    // so a Damage field must refuse it (warn + throw) rather than injecting the marker onto an arbitrary
    // die. Full support is tracked as a future enhancement (the "Advanced Rolls" item mode).
    const threw = await game.evaluate(async () => {
      const R = await import(
        `/systems/${game.system.id}/modules/rolls/cpr-rolls.js`
      );
      try {
        R.CPRDamageRoll.create("W", "{3d6,12}kh", "melee");
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(true);
  });

  test("a plain (non-pool) damage formula is still accepted", async ({
    page: game,
  }) => {
    // Guard the reject is scoped to pools only: an ordinary formula rolls as before.
    const r = await rollType(
      game,
      "CPRDamageRoll",
      ["W", "2d6+3", "melee"],
      6,
      [6, 6],
    );
    expect(r.resultTotal).toBe(15);
  });
});

test.describe("native-first engine — red/dmg hard-reject", () => {
  test("CPRDamageRoll.create throws when the damage formula carries red", async ({
    page: game,
  }) => {
    const threw = await game.evaluate(async () => {
      const R = await import(
        `/systems/${game.system.id}/modules/rolls/cpr-rolls.js`
      );
      try {
        // dmg is auto-appended → "2d6reddmg", which pairs red with dmg and must be refused.
        R.CPRDamageRoll.create("W", "2d6red", "melee");
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(true);
  });

  test("assertRedDmgExclusive throws for a combined formula and passes otherwise", async ({
    page: game,
  }) => {
    const out = await game.evaluate(async () => {
      const R = await import(
        `/systems/${game.system.id}/modules/rolls/cpr-rolls.js`
      );
      const throwsOn = (formula) => {
        try {
          R.CPRRoll.assertRedDmgExclusive(formula);
          return false;
        } catch {
          return true;
        }
      };
      return {
        combined: throwsOn("2d6reddmg"),
        separateTerms: throwsOn("1d10red + 2d6dmg"),
        redOnly: throwsOn("1d10red"),
        dmgOnly: throwsOn("2d6dmg"),
      };
    });
    expect(out.combined).toBe(true);
    expect(out.separateTerms).toBe(true);
    expect(out.redOnly).toBe(false);
    expect(out.dmgOnly).toBe(false);
  });
});
