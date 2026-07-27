import CPRActorSheet from "./cpr-actor-sheet.js";
import CPR from "../../system/config.js";
import LOGGER from "../../utils/cpr-logger.js";
import SystemUtils from "../../utils/cpr-systemUtils.js";
import { cprConfirm, cprFormPrompt } from "../../dialog/cpr-dialog.js";

/**
 * Extend the basic CPRActorSheet. A lot of code is common between mooks and characters.
 *
 * The point of a mook sheet is to provide a more "at-a-glance" view of a disposable NPC.
 * If the GM or players need a more indepth view of an actor's skills, inventories, and
 * cyberware, they should use the character sheet instead.
 *
 * @extends {CPRActorSheet}
 */
export default class CPRMookActorSheet extends CPRActorSheet {
  /**
   * getter that controls the sheet sizing
   *
   * @override
   */
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    position: {
      width: 800,
      height: 600,
    },
  };

  /** @inheritDoc */
  static PARTS = {
    // template chosen per-instance in _configureRenderParts (full vs limited view).
    form: { template: "" },
  };

  /**
   * Mooks have a separate template when a user only has "limited" permission, so
   * details are simply not rendered for those players.
   *
   * @override
   * @param {object} options
   * @returns {object}
   */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.form.template =
      !game.user.isGM && this.actor.limited
        ? `systems/${CPR.systemId}/templates/actor/cpr-mook-sheet-limited.hbs`
        : `systems/${CPR.systemId}/templates/actor/cpr-mook-sheet.hbs`;
    return parts;
  }

  /**
   * The Mook sheet goes a little further than actor.getData by tracking whether any armor
   * or weapons (including cyberware weapons) are equipped on the mook.
   *
   * @override
   * @returns {Object} data - a curated structure of actorSheet data
   */
  async _prepareContext(options) {
    const foundryData = await super._prepareContext(options);
    const cprActorData = foundryData.actor.system;
    cprActorData.equippedArmor = this.actor.itemTypes.armor.filter(
      (item) => item.system.equipped === "equipped",
    );
    cprActorData.equippedWeapons = this.actor.itemTypes.weapon.filter(
      (item) => item.system.equipped === "equipped",
    );

    const installedCyberware = this.actor.itemTypes.cyberware.filter(
      (cw) => cw.system.isInstalled,
    );
    const installedWeapons = installedCyberware.filter(
      (c) => c.system.isWeapon === true,
    );
    cprActorData.equippedWeapons =
      cprActorData.equippedWeapons.concat(installedWeapons);
    foundryData.system = cprActorData;
    return foundryData;
  }

  /**
   * Activate listeners for the sheet. This has to call super at the end to get additional
   * listners that are common between mooks and characters.
   *
   * @override
   * @param {Object} html - the DOM object
   */
  _onRender(context, options) {
    super._onRender(context, options);

    this._on(".mod-mook-skill", "click", () => this._modMookSkills());
    this._on(".change-mook-name", "click", () => this._changeMookName());
    this._on(".mook-image-toggle", "click", (event) =>
      this._expandMookImage(event),
    );

    // "changeable" elements focus on hover and handle key presses.
    this._on(".changeable", "mouseenter", (event) =>
      event.currentTarget.focus(),
    );
    this._on(".changeable", "keydown", (event) => this._handleKeyPress(event));

    // "installable" elements process a click.
    this._on(".installable", "click", (event) =>
      this._handleInstallAction(event),
    );
  }

  /**
   * Called when the edit-skills glyph (top right of the skills section on the sheet) is clicked. This
   * pops up the wizard for modifying mook skills quickly. The form data is then parsed for values that
   * are different from what is current on the mook's skill objects. Those are the updates we send
   * along.
   *
   * @async
   * @callback
   * @private
   * @returns null
   */
  async _modMookSkills() {
    const skillObj = {};

    const sortedArray = SystemUtils.SortItemListByName(
      this.actor.itemTypes.skill,
    );
    sortedArray.forEach((s) => {
      const skillRef = {
        id: s.id,
        name: s.name,
        level: s.system.level,
        stat: this.actor.system.stats[s.system.stat].value,
        mod: this.actor.bonuses[SystemUtils.slugify(s.name)],
      };
      skillObj[s.id] = skillRef;
    });

    // Pop up the form with embedded skill details.
    const formData = await cprFormPrompt({
      data: foundry.utils.duplicate(skillObj),
      title: SystemUtils.Localize("CPR.mookSheet.dialog.modSkillTitle"),
      template: `systems/${game.system.id}/templates/dialog/cpr-mod-mook-skill-prompt.hbs`,
    });
    if (!formData) {
      return;
    }

    // go over each skill and see if the value differs from the skill objects on the mook (actor)
    const updatedSkills = [];
    for (const oldSkill of Object.values(skillObj)) {
      const newSkill = formData[oldSkill.id];
      if (oldSkill.level !== newSkill.level) {
        LOGGER.debug(
          `you changed ${oldSkill.name} from ${oldSkill.level} to ${newSkill.level}`,
        );
        const [updatedSkill] = this.actor.itemTypes.skill.filter(
          (s) => oldSkill.name === s.name,
        );
        updatedSkill.setSkillLevel(newSkill.level);
        updatedSkills.push({
          _id: updatedSkill._id,
          system: {
            level: updatedSkill.system.level,
          },
        });
      }
    }
    if (!updatedSkills.length) return;

    // finally, update the skill objects
    this.actor.updateEmbeddedDocuments("Item", updatedSkills);
    SystemUtils.DisplayMessage(
      "notify",
      `${updatedSkills.length} ${SystemUtils.Localize(
        "CPR.mookSheet.skills.updated",
      )}`,
    );
  }

  /**
   * Called when a user clicks on the mook name in the sheet. Pops up a dialog to edit the name.
   *
   * @async
   * @callback
   * @private
   * @returns null
   */
  async _changeMookName() {
    // Show "Mook Name" dialog.
    const dialogData = await cprFormPrompt({
      data: { name: this.actor.name },
      title: SystemUtils.Localize("CPR.mookSheet.dialog.modNameTitle"),
      template: `systems/${game.system.id}/templates/dialog/cpr-mook-name-prompt.hbs`,
    });
    if (!dialogData) {
      return;
    }
    if (!this.isToken) {
      await this.actor.update(dialogData);
    } else {
      await this.token.update(dialogData);
    }
  }

  /**
   * Show or hide the profile icon on the mook sheet when clicked.
   *
   * @callback
   * @private
   * @param {Object} event - event data such as a mouse click or key press
   */
  _expandMookImage(event) {
    const mookImageToggle = event.currentTarget;
    const mookImageArea = mookImageToggle.closest(".mook-image");
    const mookImageImg = mookImageArea?.querySelector(
      ":scope > .mook-image-block",
    );
    let collapsedImage;
    if (
      mookImageToggle.dataset.text ===
      SystemUtils.Localize("CPR.mookSheet.image.collapse")
    ) {
      mookImageToggle.dataset.text = SystemUtils.Localize(
        "CPR.mookSheet.image.expand",
      );
      collapsedImage = true;
    } else {
      mookImageToggle.dataset.text = SystemUtils.Localize(
        "CPR.mookSheet.image.collapse",
      );
      collapsedImage = false;
    }
    mookImageArea?.classList.toggle("mook-image-small-toggle");
    mookImageImg?.classList.toggle("hide");
    const cprActorData = foundry.utils.duplicate(this.actor.system);
    cprActorData.flags.collapsedImage = collapsedImage;
    this.actor.update(cprActorData);
  }

  /**
   * Called when a user presses a key, but only does things if it was DEL. This is used in conjunction
   * with jQuery's focus() call, which is called on hover. That way, an html element is "selected" just
   * by hovering the mouse over. Then when DEL is pressed, we have a thing that can be deleted from the sheet
   * and the actor object underneath.
   *
   * @async
   * @callback
   * @private
   * @param {Object} event - event data such as a mouse click or key press
   */
  async _handleKeyPress(event) {
    LOGGER.debug(event.keyCode);
    if (event.keyCode === 46) {
      LOGGER.debug("DEL key was pressed");
      const itemId = SystemUtils.GetEventDatum(event, "data-item-id");
      const item = this.actor.getOwnedItem(itemId);
      switch (item.type) {
        case "skill": {
          item.setSkillLevel(0);
          this._updateOwnedItem(item);
          break;
        }
        case "cyberware": {
          if (item.system.core === true) {
            SystemUtils.DisplayMessage(
              "error",
              SystemUtils.Localize("CPR.messages.cannotDeleteCoreCyberware"),
            );
          } else {
            const foundationalId = SystemUtils.GetEventDatum(
              event,
              "data-foundational-id",
            );
            const dialogTitle = SystemUtils.Localize(
              "CPR.dialog.removeCyberware.title",
            );
            const dialogMessage = `${SystemUtils.Localize(
              "CPR.dialog.removeCyberware.text",
            )} ${item.name}?`;

            // Show confirmation dialog.
            const confirmRemove = await cprConfirm(dialogMessage, {
              title: dialogTitle,
            });
            if (!confirmRemove) return;

            await this.actor.uninstallCyberware(itemId, foundationalId, true);
            this._deleteOwnedItem(item, true);
          }
          break;
        }
        default: {
          this._deleteOwnedItem(item);
          break;
        }
      }
    } else if (event.keyCode === 18) {
      LOGGER.debug("ALT key was pressed");
      this.element.querySelectorAll(".skill-name").forEach((el) => {
        el.style.display = "none";
      });
    }
  }

  /**
   * Called when a user clicks their mouse on an element with "installable" class.
   *
   * @async
   * @callback
   * @private
   * @param {Object} event - event data such as a mouse click or key press
   */
  async _handleInstallAction(event) {
    const itemId = SystemUtils.GetEventDatum(event, "data-item-id");
    const item = this.actor.getOwnedItem(itemId);
    if (event.shiftKey) {
      if (item.type === "cyberware") {
        if (item.system.core === true) {
          SystemUtils.DisplayMessage(
            "error",
            SystemUtils.Localize("CPR.messages.cannotDeleteCoreCyberware"),
          );
        } else if (item.system.isInstalled === false) {
          await this.actor.installCyberware(itemId);
        } else {
          const foundationalId = SystemUtils.GetEventDatum(
            event,
            "data-foundational-id",
          );
          const dialogTitle = SystemUtils.Localize(
            "CPR.dialog.removeCyberware.title",
          );
          const dialogMessage = `${SystemUtils.Localize(
            "CPR.dialog.removeCyberware.text",
          )} ${item.name}?`;

          // Show confirmation dialog.
          const confirmRemove = await cprConfirm(dialogMessage, {
            title: dialogTitle,
          });
          if (!confirmRemove) return;

          await this.actor.uninstallCyberware(itemId, foundationalId, true);
        }
      }
    }
  }
}
