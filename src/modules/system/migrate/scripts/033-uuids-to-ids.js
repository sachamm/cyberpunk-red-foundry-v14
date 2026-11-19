import { normalizeLegacyInstallations } from "../legacy-installations.js";
import BaseMigrationScript from "../base-migration-script.js";

/**
 * Turn Item UUIDs into IDs for Container Items
 */
export default class InstallListUUIDsToIDs extends BaseMigrationScript {
  static version = 33;

  static name = "Install List - UUIDs to IDs";

  static documentFilters = {
    Item: { types: [], mixins: ["container"] },
    Actor: { types: [], mixins: ["container"] },
  };

  async updateItem(doc) {
    this.constructor.migrateUuids(doc);
  }

  async updateActor(doc) {
    // God I know this is confusing. We are migrating Actors with the "container" mixin,
    // i.e., CPRCharacters and CPRMooks, not CPRContainers.
    if (doc.type === "container") return;
    this.constructor.migrateUuids(doc);
  }

  /**
   * Turn Item UUIDs into IDs
   *
   * @param {object} doc - the uuid of an item
   * @returns {void} - just mutates the document
   */
  static migrateUuids(doc) {
    normalizeLegacyInstallations(doc.system);
    for (const reference of doc.system.installedItems?.list ?? []) {
      if (!foundry.data.validators.isValidId(reference)) {
        throw new Error(
          `Invalid installed item reference on ${doc.name}: ${reference}`,
        );
      }
    }
  }
}
