import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

/*
 * Unit test for migration 050 (ReconfigureTechMakerAbilities): it reconfigures the four
 * "Expertise" abilities on the Tech role from old-style varying-skill rolls into situational
 * bonuses that grant the seven Maker skills, preserving user-set ranks. Roles that are not
 * named "Tech", and abilities a user has manually reconfigured (skill !== "varying"), are
 * left untouched.
 */

const MAKER_SKILL_NAMES = [
  "Air Vehicle Tech",
  "Basic Tech",
  "Cybertech",
  "Electronics/Security Tech",
  "Land Vehicle Tech",
  "Sea Vehicle Tech",
  "Weaponstech",
];

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("050 migration reconfigures Tech Expertise abilities into situational bonuses", async ({
  page: game,
}) => {
  const out = await game.evaluate(async (makerSkillNames) => {
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/050-reconfigure-tech-maker-abilities.js`
    );
    const migration = new M.default();

    // Old-shape Tech role: four Expertise abilities with the old varying-skill roll signature.
    const expertiseAbility = (name, rank) => ({
      bonusRatio: 1,
      bonuses: [],
      hasRoll: true,
      isSituational: false,
      multiplier: 0.5,
      name,
      onByDefault: false,
      rank,
      skill: "varying",
      stat: "tech",
      universalBonuses: [],
    });

    const techRole = {
      _id: "test-tech-role",
      name: "Tech",
      type: "role",
      system: {
        abilities: [
          expertiseAbility("Fabrication Expertise", 3),
          expertiseAbility("Field Expertise", 2),
          expertiseAbility("Invention Expertise", 1),
          expertiseAbility("Upgrade Expertise", 4),
        ],
        addRoleAbilityRank: true,
        bonusRatio: 1,
        bonuses: [],
        hasRoll: false,
        isSituational: false,
        mainRoleAbility: "Maker",
        onByDefault: false,
        rank: 4,
        skill: "--",
        stat: "--",
        universalBonuses: [],
      },
    };

    await migration.updateItem(techRole);

    // The bonuses must be the full skill documents from the internal skills pack.
    const pack = game.packs.get(`${game.system.id}.internal_skills`);
    const docs = await pack.getDocuments();
    const expectedBonuses = makerSkillNames.map((name) => {
      const doc = docs.find((d) => d.name === name);
      return {
        _id: doc._id,
        type: doc.type,
        name: doc.name,
        img: doc.img,
        core: doc.system.core,
        stat: doc.system.stat,
      };
    });

    return {
      version: M.default.version,
      mainRoleAbility: techRole.system.mainRoleAbility,
      topRank: techRole.system.rank,
      expectedBonuses,
      abilities: techRole.system.abilities.map((a) => ({
        name: a.name,
        rank: a.rank,
        hasRoll: a.hasRoll,
        isSituational: a.isSituational,
        onByDefault: a.onByDefault,
        skill: a.skill,
        stat: a.stat,
        multiplier: a.multiplier,
        bonusRatio: a.bonusRatio,
        bonuses: a.bonuses.map((b) => ({
          _id: b._id,
          type: b.type,
          name: b.name,
          img: b.img,
          core: b.system?.core,
          stat: b.system?.stat,
        })),
      })),
    };
  }, MAKER_SKILL_NAMES);

  expect(out.version).toBe(50);

  // The main role (Maker) is untouched.
  expect(out.mainRoleAbility).toBe("Maker");
  expect(out.topRank).toBe(4);

  // The pack provides all seven Maker skills.
  expect(out.expectedBonuses.map((b) => b.name)).toEqual(MAKER_SKILL_NAMES);

  const expected = [
    { name: "Fabrication Expertise", rank: 3, onByDefault: false },
    { name: "Field Expertise", rank: 2, onByDefault: true },
    { name: "Invention Expertise", rank: 1, onByDefault: false },
    { name: "Upgrade Expertise", rank: 4, onByDefault: false },
  ];

  expect(out.abilities).toHaveLength(4);
  for (const [i, ability] of out.abilities.entries()) {
    expect(ability.name).toBe(expected[i].name);
    // The old roll signature is replaced by the situational shape...
    expect(ability.hasRoll).toBe(false);
    expect(ability.isSituational).toBe(true);
    expect(ability.skill).toBe("--");
    expect(ability.stat).toBe("--");
    // ...while user-set values are preserved.
    expect(ability.rank).toBe(expected[i].rank);
    expect(ability.multiplier).toBe(0.5);
    expect(ability.bonusRatio).toBe(1);
    expect(ability.onByDefault).toBe(expected[i].onByDefault);
    // All seven Maker skills, in order, as full compendium documents.
    expect(ability.bonuses).toEqual(out.expectedBonuses);
  }
});

test("050 migration leaves other roles and manually reconfigured abilities untouched", async ({
  page: game,
}) => {
  const out = await game.evaluate(async () => {
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/050-reconfigure-tech-maker-abilities.js`
    );
    const migration = new M.default();

    const expertiseAbility = (name, rank) => ({
      bonusRatio: 1,
      bonuses: [],
      hasRoll: true,
      isSituational: false,
      multiplier: 0.5,
      name,
      onByDefault: false,
      rank,
      skill: "varying",
      stat: "tech",
      universalBonuses: [],
    });

    // A role that is not named "Tech" keeps its old-style abilities.
    const netrunner = {
      _id: "test-netrunner-role",
      name: "Netrunner",
      type: "role",
      system: {
        abilities: [expertiseAbility("Deck Expertise", 2)],
        mainRoleAbility: "Hacker",
        rank: 3,
      },
    };

    // A Tech role where one ability was manually reconfigured to a fixed skill.
    const customTech = {
      _id: "test-custom-tech-role",
      name: "Tech",
      type: "role",
      system: {
        abilities: [
          expertiseAbility("Fabrication Expertise", 3),
          { ...expertiseAbility("Field Expertise", 2), skill: "cyberware" },
          expertiseAbility("Invention Expertise", 1),
          expertiseAbility("Upgrade Expertise", 4),
        ],
        mainRoleAbility: "Maker",
        rank: 4,
      },
    };

    await migration.updateItem(netrunner);
    await migration.updateItem(customTech);

    return {
      netrunnerAbility: netrunner.system.abilities[0],
      netrunnerRank: netrunner.system.rank,
      fieldExpertise: customTech.system.abilities[1],
      othersConverted: [0, 2, 3].map((i) => {
        const a = customTech.system.abilities[i];
        return (
          a.hasRoll === false &&
          a.isSituational === true &&
          a.skill === "--" &&
          a.bonuses.length === 7
        );
      }),
    };
  });

  // The non-Tech role is completely untouched.
  expect(out.netrunnerAbility).toEqual({
    bonusRatio: 1,
    bonuses: [],
    hasRoll: true,
    isSituational: false,
    multiplier: 0.5,
    name: "Deck Expertise",
    onByDefault: false,
    rank: 2,
    skill: "varying",
    stat: "tech",
    universalBonuses: [],
  });
  expect(out.netrunnerRank).toBe(3);

  // The manually reconfigured ability keeps its fixed skill and old shape.
  expect(out.fieldExpertise.skill).toBe("cyberware");
  expect(out.fieldExpertise.hasRoll).toBe(true);
  expect(out.fieldExpertise.isSituational).toBe(false);
  expect(out.fieldExpertise.rank).toBe(2);
  expect(out.fieldExpertise.bonuses).toEqual([]);

  // The other three Expertise abilities are still converted.
  expect(out.othersConverted).toEqual([true, true, true]);
});
