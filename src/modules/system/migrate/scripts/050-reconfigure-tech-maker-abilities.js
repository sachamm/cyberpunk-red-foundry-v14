import BaseMigrationScript from "../base-migration-script.js";

const MAKER_SKILL_NAMES = [
  "Air Vehicle Tech",
  "Basic Tech",
  "Cybertech",
  "Electronics/Security Tech",
  "Land Vehicle Tech",
  "Sea Vehicle Tech",
  "Weaponstech",
];

const EXPERTISE_ABILITY_NAMES = [
  "Fabrication Expertise",
  "Field Expertise",
  "Invention Expertise",
  "Upgrade Expertise",
];

/**
 * Reconfigure the Tech role's Maker abilities: the four Expertise abilities change from
 * old-style varying-skill rolls into situational bonuses that grant the seven Maker skills.
 * User-set ranks are preserved; abilities a user has manually reconfigured (i.e. no longer
 * `skill: "varying"`) and roles that are not named "Tech" are left untouched.
 */
export default class ReconfigureTechMakerAbilities extends BaseMigrationScript {
  static version = 50;

  static name = "Reconfigure: Tech role Maker abilities";

  static documentFilters = {
    Item: { types: ["role"], mixins: [] },
    Actor: { types: [], mixins: [] },
  };

  static #makerSkillsPromise = null;

  static async getMakerSkillDocuments() {
    if (!this.#makerSkillsPromise) {
      this.#makerSkillsPromise = (async () => {
        const pack = game.packs.get(`${game.system.id}.internal_skills`);
        if (!pack) {
          throw new Error(
            `Internal skills pack "${game.system.id}.internal_skills" not found`,
          );
        }
        const documents = await pack.getDocuments();
        const missing = MAKER_SKILL_NAMES.filter(
          (name) => !documents.some((doc) => doc.name === name),
        );
        if (missing.length) {
          throw new Error(
            `Internal skills pack is missing expected skill(s): ${missing.join(", ")}`,
          );
        }
        return MAKER_SKILL_NAMES.map((name) =>
          documents.find((doc) => doc.name === name),
        );
      })();
    }
    return this.#makerSkillsPromise;
  }

  async updateItem(doc) {
    if (doc.type !== "role" || doc.name !== "Tech") return;

    const makerSkills =
      await ReconfigureTechMakerAbilities.getMakerSkillDocuments();

    for (const ability of doc.system.abilities ?? []) {
      // Only convert abilities that still carry the old varying-skill roll signature, so
      // manually reconfigured or homebrew variants are left untouched.
      if (!EXPERTISE_ABILITY_NAMES.includes(ability.name)) continue;
      if (ability.hasRoll !== true || ability.skill !== "varying") continue;

      ability.hasRoll = false;
      ability.isSituational = true;
      ability.skill = "--";
      ability.stat = "--";
      ability.onByDefault = ability.name === "Field Expertise";
      ability.bonuses = makerSkills.map((skill) => skill.toObject());
    }
  }
}
