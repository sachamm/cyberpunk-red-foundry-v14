import HudInterface from "../../hud/interface.js";

const AddDvTokenHud = () => {
  /**
   * Add DV icon to token HUD to allow easy selection of DV table entries
   *
   * @public
   * @memberof hookEvents
   * @param {Document} hud - Instance of the token HUD provided by Foundry
   * @param {HTMLElement} html - HTML DOM object
   */
  Hooks.on("renderTokenHUD", async (hud, html) => {
    const token = hud.document;
    if (!token) return;
    const dvHudTemplate = `systems/${game.system.id}/templates/hud/dv.hbs`;
    const dvDisplay = await foundry.applications.handlebars.renderTemplate(
      dvHudTemplate,
      { cprDvTable: token.getFlag(game.system.id, "cprDvTable")?.name },
    );
    html.querySelector(".left")?.insertAdjacentHTML("beforeend", dvDisplay);
    html
      .querySelector(".dv-table-selector")
      ?.addEventListener("click", async () => {
        await hud.close();
        await HudInterface.SetDvTable(token);
      });
  });
};

export default AddDvTokenHud;
