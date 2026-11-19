import BaseMigrationScript from "../base-migration-script.js";

export default class SkillTypeMigration extends BaseMigrationScript {
  static version = 27;

  static name = "Item: Skill Type";

  static documentFilters = {
    Item: { types: ["skill"], mixins: [] },
    Actor: { types: [], mixins: [] },
  };

  async updateItem(doc) {
    const itemName = doc.name.toLowerCase();
    const compactName = itemName.replace(/\s+/g, "");

    // Set the skill type based on the name
    if (compactName.startsWith("language")) {
      doc.system.skillType = "language";
    } else if (compactName.startsWith("science")) {
      doc.system.skillType = "science";
    } else if (compactName.startsWith("localexpert")) {
      doc.system.skillType = "localExpert";
    } else if (compactName.startsWith("martialart")) {
      doc.system.skillType = "martialArt";
    } else if (compactName.startsWith("playinstrument")) {
      doc.system.skillType = "playInstrument";
    } else {
      doc.system.skillType = "generic";
    }

    // Make the old "base" skills deleteable
    const oldSkills = [
      "local expert (your home)",
      "science",
      "play instrument",
      "martial arts",
      "local expert",
    ];

    if (oldSkills.includes(itemName)) {
      doc.system.core = false;
    }
  }
}
