import CPRItem from "../cpr-item.js";

/**
 * Extend the base CPRItem object with things specific to Programs.
 * @extends {CPRItem}
 */
export default class CPRProgramItem extends CPRItem {
  /**
   * Program Code
   *
   * The methods below apply to the CPRItem.type = "program"
   */

  /**
   * Sets a program to rezzed.
   *
   * @public
   */
  async setRezzed(instanceId = null) {
    if (instanceId) {
      await this.setFlag(game.system.id, "rezInstanceId", instanceId);
    }
    await this.update({ "system.isRezzed": true });
  }

  /**
   * Sets a program to unrezzed.
   *
   * @public
   */
  async unsetRezzed() {
    await this.update({ "system.isRezzed": false });
  }
}
