import BaseMigrationScript from "../base-migration-script.js";
import { ContainerUtils } from "../../../item/mixins/cpr-container.js";

/**
 * Turn Item UUIDs into IDs for Container Items
 */
export default class RemoveUnusedInstallFlag extends BaseMigrationScript {
  static version = 41;

  static name = "Remove Unused Install Flag";

  static documentFilters = {
    Item: { types: [], mixins: ["container"] },
    Actor: { types: [], mixins: ["container"] },
  };

  /** @inheritdoc */
  async updateItem(doc) {
    this.constructor.deleteOldInstallTreeFlag(doc);
  }

  /**
   * Recursively delete the the `flags.cprInstallTree`
   * as it was migrated in Data Model 34.
   *
   * @param {Object} doc - The document data to migrate.
   * @returns {void} - just mutates the document data.
   */
  static deleteOldInstallTreeFlag(doc) {
    // Delete the flag on this document.
    this.safeDelete(doc, "flags.cprInstallTree");

    const cprInstallTree = ContainerUtils.getInstallTreeFlag(doc);

    if (!Array.isArray(cprInstallTree) || cprInstallTree.length === 0) return;

    // Inner helper that does recursive migration.
    function deleteFlag(tree) {
      for (const itemData of tree) {
        // These are serialized objects inside a flag, not live Documents.
        // Capture the old tree before deleting it, then visit either format.
        const oldTree = itemData.flags?.cprInstallTree;
        if (itemData.flags) delete itemData.flags.cprInstallTree;
        const newTree = ContainerUtils.getInstallTreeFlag(itemData);
        if (Array.isArray(oldTree)) deleteFlag(oldTree);
        if (Array.isArray(newTree) && newTree !== oldTree) deleteFlag(newTree);
      }
    }

    deleteFlag(cprInstallTree);
  }
}
