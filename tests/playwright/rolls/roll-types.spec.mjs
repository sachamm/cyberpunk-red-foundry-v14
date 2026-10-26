import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import { rollType } from "../../../tools/playwright/ui/index.mjs";

/*
 * Smoke coverage for every CPRRoll subclass after the migration onto foundry.dice.Roll: each is built
 * through its static factory, evaluated, and checked for a finite resultTotal with no exception. Faces
 * are forced so the check-die rolls exercise the `red` crit path deterministically. This guards against
 * a factory/_computeBase/term-reading regression in any roll type (the UI suite only drives stat rolls).
 */

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("roll types — factory + evaluate smoke", () => {
  test("stat roll computes STAT + die (+ red crit)", async ({ page: game }) => {
    // d10 rolls 10 (crit) → +bonus 7; total = 17 + INT 8 = 25.
    const r = await rollType(game, "CPRStatRoll", ["INT", 8], 10, [10, 7]);
    expect(r).toMatchObject({ cls: "CPRStatRoll", isRoll: true, finite: true });
    expect(r.critSuccess).toBe(true);
    expect(r.resultTotal).toBe(25);
  });

  test("skill roll adds STAT + Skill", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRSkillRoll",
      ["REF", 5, "Handgun", 4],
      10,
      [3],
    );
    expect(r).toMatchObject({ cls: "CPRSkillRoll", finite: true });
    expect(r.resultTotal).toBe(12); // 3 + 5 + 4
  });

  test("attack roll evaluates", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRAttackRoll",
      ["Pistol", "REF", 5, "Handgun", 4, "pistol"],
      10,
      [4],
    );
    expect(r).toMatchObject({ cls: "CPRAttackRoll", finite: true });
    expect(r.resultTotal).toBe(13); // 4 + 5 + 4
  });

  test("aimed attack includes the -8 penalty", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRAimedAttackRoll",
      ["Pistol", "REF", 5, "Handgun", 4, "pistol"],
      10,
      [4],
    );
    expect(r).toMatchObject({ cls: "CPRAimedAttackRoll", finite: true });
    expect(r.resultTotal).toBe(5); // 4 + 5 + 4 - 8
  });

  test("role roll adds Role + Skill + STAT", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRRoleRoll",
      ["Solo", 4, "Handgun", 4, "REF", 5, []],
      10,
      [2],
    );
    expect(r).toMatchObject({ cls: "CPRRoleRoll", finite: true });
    expect(r.resultTotal).toBe(15); // 2 + 4 + 4 + 5
  });

  test("interface roll adds Role + STAT", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRInterfaceRoll",
      ["attack", "Netrunner", 4, "ATK", 6],
      10,
      [2],
    );
    expect(r).toMatchObject({ cls: "CPRInterfaceRoll", finite: true });
    expect(r.resultTotal).toBe(12); // 2 + 4 + 6
  });

  test("facedown roll adds COOL + Rep", async ({ page: game }) => {
    const r = await rollType(game, "CPRFacedownRoll", ["COOL", 5, 3], 10, [2]);
    expect(r).toMatchObject({ cls: "CPRFacedownRoll", finite: true });
    expect(r.resultTotal).toBe(10); // 2 + 5 + 3
  });

  test("death save: no crit, no luck, penalties applied", async ({
    page: game,
  }) => {
    // A natural 10 must NOT explode for death saves (no red).
    const r = await rollType(game, "CPRDeathSaveRoll", [2, 1, 6], 10, [10]);
    expect(r).toMatchObject({ cls: "CPRDeathSaveRoll", finite: true });
    expect(r.critSuccess).toBe(false);
    expect(r.resultTotal).toBe(13); // 10 + base 1 + penalty 2
  });

  test("damage roll: Nd6, dmg marker, crit on 2+ sixes", async ({
    page: game,
  }) => {
    const r = await rollType(
      game,
      "CPRDamageRoll",
      ["Pistol", "2d6", "pistol"],
      6,
      [6, 6],
    );
    expect(r).toMatchObject({ cls: "CPRDamageRoll", finite: true });
    expect(r.critSuccess).toBe(true); // two 6s
    expect(r.resultTotal).toBe(12);
  });

  test("humanity loss: Nd6, no crit", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRHumanityLossRoll",
      ["Cyberarm", "2d6"],
      6,
      [3, 4],
    );
    expect(r).toMatchObject({ cls: "CPRHumanityLossRoll", finite: true });
    expect(r.resultTotal).toBe(7);
  });

  test("initiative roll adds the stat", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRInitiative",
      [null, "1d10", "REF", 5],
      10,
      [4],
    );
    expect(r).toMatchObject({ cls: "CPRInitiative", finite: true });
    expect(r.resultTotal).toBe(9); // 4 + 5
  });

  test("program stat roll (net combat) evaluates", async ({ page: game }) => {
    const r = await rollType(game, "CPRProgramStatRoll", ["INT", 6], 10, [3]);
    expect(r).toMatchObject({ cls: "CPRProgramStatRoll", finite: true });
    expect(r.resultTotal).toBe(9); // 3 + 6
  });

  test("autofire roll evaluates", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRAutofireRoll",
      ["SMG", "REF", 5, "Handgun", 4, "smg"],
      10,
      [4],
    );
    expect(r).toMatchObject({ cls: "CPRAutofireRoll", finite: true });
    expect(r.resultTotal).toBe(13); // 4 + 5 + 4
  });

  test("suppressive fire roll evaluates", async ({ page: game }) => {
    const r = await rollType(
      game,
      "CPRSuppressiveFireRoll",
      ["SMG", "REF", 5, "Handgun", 4, "smg"],
      10,
      [4],
    );
    expect(r).toMatchObject({ cls: "CPRSuppressiveFireRoll", finite: true });
    expect(r.resultTotal).toBe(13);
  });

  test("base roll (NET-arch generation): plain dice, no crit", async ({
    page: game,
  }) => {
    const r = await rollType(game, "CPRRoll", ["Floors", "3d6"], 6, [2, 3, 4]);
    expect(r).toMatchObject({ cls: "CPRRoll", finite: true });
    expect(r.critSuccess).toBe(false); // no red modifier on a plain generation roll
    expect(r.resultTotal).toBe(9);
  });

  test("table roll wraps a pre-rolled RollTable result", async ({
    page: game,
  }) => {
    const out = await game.evaluate(async () => {
      const R = await import(
        `/systems/${game.system.id}/modules/rolls/cpr-rolls.js`
      );
      const tableRoll = await new Roll("2d6").evaluate();
      const roll = R.CPRTableRoll.create(
        "Critical Injury",
        tableRoll,
        `systems/${game.system.id}/templates/chat/cpr-critical-injury-rollcard.hbs`,
      );
      return {
        cls: roll.constructor.name,
        isRoll: roll instanceof foundry.dice.Roll,
        resultTotalDefined:
          roll.resultTotal !== undefined && roll.resultTotal !== null,
        faces: roll.faces.length,
      };
    });
    expect(out.cls).toBe("CPRTableRoll");
    expect(out.isRoll).toBe(true);
    expect(out.resultTotalDefined).toBe(true);
    expect(out.faces).toBe(2);
  });
});
