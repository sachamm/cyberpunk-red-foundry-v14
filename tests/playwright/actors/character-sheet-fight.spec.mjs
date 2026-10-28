import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { gotoReadyWorld as gotoGame } from "../../../tools/playwright/session/world.mjs";
import {
  chatMessageCount,
  closeAndReopenActorSheet,
  closeDocSheet,
  createInventoryItemViaUI,
  enablePlayersCreateInventory,
  getPlayersCreateInventory,
  reopenActorSheetViaUI,
  reopenItemSheetViaUI,
  setPlayersCreateInventory,
  uniqueName,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";
import {
  configureRoleMainAbilityViaUI,
  confirmRollDialog,
  createCharacterViaUI,
  createEquippedItemViaUI,
  createRoleItemViaUI,
  dragRoleItemToCharacter,
  fightArmorRow,
  fightWeaponRow,
  installProgramIntoDeckViaUI,
  openFightTab,
} from "./character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Character sheet Fight tab: the Meatspace view lists critical injuries,
 * equipped armor and equipped weapons (grouped under Ranged/Melee headers);
 * an equipped cyberdeck adds a Meat|Net toggle that switches to the Netspace
 * view (interface abilities, installed programs grouped by class, rezzed
 * programs). Every roll goes through a verify dialog; aimed shots persist
 * their chosen location in an actor flag; net actions require a dragged role.
 *
 * The weapon/armor row markup and plain roll flows are shared partials also
 * covered on the mook sheet (mook-sheet-fight.spec.mjs); this spec covers the
 * character-only paths: the tabbed layout, equip state, aimed-shot location
 * persistence, critical injury rolls, and all cyberdeck/netrunning behaviour.
 */

const NET_ROLE_ABILITY = "Wire Main";

let createInventoryBaseline;

test.beforeEach(async ({ page }) => {
  if (createInventoryBaseline === undefined) {
    createInventoryBaseline = await getPlayersCreateInventory(page);
  }
});

test.afterEach(async ({ page }) => {
  await setPlayersCreateInventory(page, createInventoryBaseline);
});

/**
 * Read a system flag off an actor document (read-only supporting evidence).
 */
const actorFlag = (page, actorId, flag) =>
  page.evaluate(
    ({ actorId, flag }) =>
      game.actors.get(actorId).getFlag(game.system.id, flag) ?? null,
    { actorId, flag },
  );

/**
 * Build a fresh character with an equipped cyberdeck, optionally install the
 * given programs into it and drag net roles (each configured with its main
 * ability at rank 3) onto the sheet. The first dragged role becomes
 * `system.roleInfo.activeNetRole` via the createItem hook. Returns all ids
 * plus a freshly-reopened sheet id.
 */
async function setupCharacterWithDeck(
  page,
  { programs = [], roles = [] } = {},
) {
  await enablePlayersCreateInventory(page);
  let { actorId, sheetId } = await createCharacterViaUI(page);

  const deck = await createEquippedItemViaUI(page, {
    actorId,
    sheetId,
    itemType: "cyberdeck",
    itemName: uniqueName("deck"),
  });
  sheetId = deck.sheetId;

  const programIds = {};
  for (const program of programs) {
    const created = await createInventoryItemViaUI(page, {
      actorId,
      sheetId,
      itemType: "program",
      itemName: program.name,
      data: program.data,
    });
    sheetId = created.sheetId;
    programIds[program.key] = created.itemId;
    await installProgramIntoDeckViaUI(page, {
      sheetId,
      actorId,
      deckId: deck.itemId,
      programId: created.itemId,
    });
  }

  const roleIds = [];
  for (const mainAbility of roles) {
    const { itemId } = await createRoleItemViaUI(page);
    const roleSheetId = await reopenItemSheetViaUI(page, itemId);
    await configureRoleMainAbilityViaUI(page, {
      sheetId: roleSheetId,
      itemId,
      mainAbility,
      rank: 3,
    });
    await closeDocSheet(page, { collection: "items", id: itemId });
    await dragRoleItemToCharacter(page, { actorId, sheetId, itemId });
    roleIds.push(itemId);
  }

  sheetId = await closeAndReopenActorSheet(page, actorId);
  return { actorId, sheetId, deckId: deck.itemId, programIds, roleIds };
}

/**
 * Switch the Fight tab to Netspace (requires an equipped cyberdeck).
 * Idempotent: the toggle link only renders while in Meatspace, so this is a
 * no-op when the sheet already shows Netspace (e.g. after a world reload,
 * where the persisted fightState flag re-opens it there).
 */
async function openNetspace(page, sheetId) {
  const netspaceLink = page.locator(
    `#${sheetId} a.toggle-fight-state[data-state="Netspace"]`,
  );
  if (await netspaceLink.isVisible()) {
    await netspaceLink.click();
  }
}

/**
 * The critical injury table dialog.
 */
const criticalInjuryDialog = (page) =>
  page.locator(".cpr-dialog").filter({
    has: page.locator('select[name="currentTable"]'),
  });

/**
 * The verify dialog for net rolls (interface abilities, program atk/def):
 * the only prompt carrying a roleValue input. One roll dialog is open at a
 * time, so the filter identifies the current one.
 */
const netRollDialog = (page) =>
  page.locator(".application").filter({
    has: page.locator('input[name="roleValue"]'),
  });

/**
 * The verify dialog for a program's damage roll: identified by the
 * all-modifiers footer (only one roll dialog is open at a time).
 */
const programDamageDialog = (page) =>
  page.locator(".application").filter({
    has: page.locator(".total-mods"),
  });

/**
 * The installed-program row for a program id in the netspace software list.
 */
const installedProgramRow = (content, programId) =>
  content.locator(
    `li.item.cyberdeck-installed-software-list[data-item-id="${programId}"]`,
  );

/**
 * The rezzed-program row for a program id in the netspace software list.
 */
const rezzedProgramRow = (content, programId) =>
  content.locator(
    `li.item.cyberdeck-rezzed-software-list[data-item-id="${programId}"]`,
  );

/**
 * Assert a program row is installed and unrezzed: the name link is not
 * italicized and the rez glyph shows the up arrow.
 */
async function expectUnrezzedProgram(row) {
  await expect(row.locator("a.name.item-view")).not.toHaveClass(/text-italic/);
  await expect(
    row
      .locator('a.program-execution[data-execution-type="rez"]')
      .locator("i.fa-circle-up"),
  ).toBeVisible();
}

test("a fresh character's Fight tab shows empty Meatspace sections", async ({
  page,
}) => {
  const { sheetId } = await createCharacterViaUI(page);
  const content = await openFightTab(page, sheetId);

  const labels = await page.evaluate(() => ({
    weapons: game.i18n.localize("CPR.characterSheet.bottomPane.fight.weapons"),
    armor: game.i18n.localize("CPR.global.itemTypes.armor"),
    injuries: game.i18n.localize(
      "CPR.characterSheet.bottomPane.fight.criticalInjuries",
    ),
  }));

  await test.step("the three Meatspace sections render with no rows", async () => {
    await expect(content.locator(".injuries-grid")).toHaveCount(0);
    await expect(content.locator(".armor-grid")).toHaveCount(0);
    await expect(content.locator(".weapon-grid")).toHaveCount(0);
  });

  await test.step("the section headers show, led by the plain Weapons header", async () => {
    await expect(
      content
        .locator(".injuries-section .items-header")
        .filter({ hasText: labels.injuries }),
    ).toBeVisible();
    await expect(
      content
        .locator(".armor-section .items-header")
        .filter({ hasText: labels.armor }),
    ).toBeVisible();
    const weaponHeaders = content.locator(".weapon-section > .items-header");
    await expect(weaponHeaders).toHaveCount(1);
    await expect(weaponHeaders.first()).toHaveText(labels.weapons);
  });

  await test.step("no Meat|Net toggle renders without an equipped cyberdeck", async () => {
    await expect(page.locator(`#${sheetId} .toggle-fight-state`)).toHaveCount(
      0,
    );
    await expect(page.locator(`#${sheetId} .tab-highlight`)).toHaveCount(0);
  });
});

test("equipped weapons and armor render under their Ranged/Melee headers", async ({
  page,
}) => {
  const rangedName = uniqueName("pistol");
  const meleeName = uniqueName("knife");
  const armorName = uniqueName("jacket");

  await enablePlayersCreateInventory(page);
  let { actorId, sheetId } = await createCharacterViaUI(page);

  const ranged = await createEquippedItemViaUI(page, {
    actorId,
    sheetId,
    itemType: "weapon",
    itemName: rangedName,
    data: { system: { weaponType: "medPistol", isRanged: true } },
  });
  sheetId = ranged.sheetId;
  const melee = await createEquippedItemViaUI(page, {
    actorId,
    sheetId,
    itemType: "weapon",
    itemName: meleeName,
    data: { system: { weaponType: "lightMelee" } },
  });
  sheetId = melee.sheetId;
  const armor = await createEquippedItemViaUI(page, {
    actorId,
    sheetId,
    itemType: "armor",
    itemName: armorName,
  });
  sheetId = armor.sheetId;

  const content = await openFightTab(page, sheetId);

  const labels = await page.evaluate(() => ({
    ranged: game.i18n.localize("CPR.characterSheet.bottomPane.fight.ranged"),
    melee: game.i18n.localize("CPR.characterSheet.bottomPane.fight.melee"),
    unloaded: game.i18n.localize("CPR.mookSheet.items.unloaded"),
    meleeWeapon: game.i18n.localize("CPR.global.itemType.skill.meleeWeapon"),
    body: game.i18n.localize("CPR.global.location.body"),
  }));

  await test.step("Ranged and Melee headers replace the plain Weapons header", async () => {
    await expect(
      content.locator(".weapon-section > .items-header"),
    ).toHaveCount(0);
    const headers = content.locator(".weapon-content .items-header");
    await expect(headers).toHaveCount(2);
    await expect(headers.nth(0)).toHaveText(labels.ranged);
    await expect(headers.nth(1)).toHaveText(labels.melee);
  });

  await test.step("the unloaded ranged weapon shows its ammo state and roll glyphs", async () => {
    const row = fightWeaponRow(page, sheetId, ranged.itemId);
    await expect(row.locator(".weapon-ammo")).toHaveText(labels.unloaded);
    await expect(row.locator('[data-roll-type="attack"]')).toBeVisible();
    await expect(row.locator('[data-roll-type="damage"]')).toBeVisible();
    const aimed = row.locator('a.fire-checkbox[data-fire-mode="aimed"]');
    await expect(aimed).toBeVisible();
    await expect(aimed.locator("i.fa-circle")).toBeVisible();
    await expect(
      row.locator('a.fire-checkbox[data-fire-mode="autofire"]'),
    ).toHaveCount(0);
  });

  await test.step("the melee weapon shows its type label and no autofire", async () => {
    const row = fightWeaponRow(page, sheetId, melee.itemId);
    await expect(row.locator(".weapon-ammo")).toHaveText(labels.meleeWeapon);
    await expect(
      row.locator('a.fire-checkbox[data-fire-mode="aimed"]'),
    ).toBeVisible();
    await expect(
      row.locator('a.fire-checkbox[data-fire-mode="autofire"]'),
    ).toHaveCount(0);
  });

  await test.step("the equipped armor shows its body SP", async () => {
    const row = fightArmorRow(page, sheetId, armor.itemId);
    await expect(row.locator(".armor-1-location")).toHaveText(labels.body);
    await expect(row.locator(".armor-1-stats")).toHaveText("7/7");
  });
});

test("an aimed shot's chosen location persists to the weapon's damage roll", async ({
  page,
}) => {
  const weaponName = uniqueName("pistol");

  await enablePlayersCreateInventory(page);
  let { actorId, sheetId } = await createCharacterViaUI(page);
  const weapon = await createEquippedItemViaUI(page, {
    actorId,
    sheetId,
    itemType: "weapon",
    itemName: weaponName,
    data: { system: { weaponType: "medPistol", isRanged: true } },
  });
  sheetId = weapon.sheetId;

  await openFightTab(page, sheetId);
  const row = fightWeaponRow(page, sheetId, weapon.itemId);

  const labels = await page.evaluate(() => ({
    location: game.i18n.localize("CPR.rolls.location"),
    head: game.i18n.localize("CPR.global.location.head"),
    leg: game.i18n.localize("CPR.global.location.leg"),
  }));

  await test.step("selecting the aimed fire mode sets the weapon's flag", async () => {
    await row.locator('a.fire-checkbox[data-fire-mode="aimed"]').click();
    await expect
      .poll(() => actorFlag(page, actorId, `firetype-${weapon.itemId}`))
      .toBe("aimed");
    await expect(
      row.locator('a.fire-checkbox[data-fire-mode="aimed"] i.fa-circle-dot'),
    ).toBeVisible();
  });

  let messagesBefore = await chatMessageCount(page);
  await test.step("the attack dialog defaults to head; choosing leg rolls and persists", async () => {
    await row.locator('[data-roll-type="attack"]').click();
    const dialog = page.locator(".application").filter({
      has: page.locator('select[name="location"]'),
    });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('select[name="location"]')).toHaveValue("head");
    await dialog.locator('select[name="location"]').selectOption("leg");
    await confirmRollDialog(dialog);

    const messageId = await waitForNewChatMessage(page, messagesBefore, {
      requireRoll: true,
    });
    const cardText = await page
      .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
      .textContent();
    expect(cardText).toContain(labels.location);
    expect(cardText).toContain(labels.leg);
    await expect
      .poll(() => actorFlag(page, actorId, "aimedLocation"))
      .toBe("leg");
  });

  await test.step("the damage dialog re-opens aimed, defaulting its location to the persisted choice", async () => {
    messagesBefore = await chatMessageCount(page);
    await row.locator('[data-roll-type="damage"]').click();
    const dialog = page.locator(".application").filter({
      has: page.locator('input[name="isAimed"]'),
    });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('input[name="isAimed"]')).toBeChecked();
    await expect(dialog.locator('select[name="location"]')).toHaveValue("leg");
    await confirmRollDialog(dialog);

    const messageId = await waitForNewChatMessage(page, messagesBefore, {
      requireRoll: true,
    });
    const cardText = await page
      .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
      .textContent();
    expect(cardText).toContain(labels.location);
    expect(cardText).toContain(labels.leg);
  });
});

test("rolling a critical injury draws from the table, posts a card and renders in the grid", async ({
  page,
}) => {
  const { actorId, sheetId } = await createCharacterViaUI(page);
  const content = await openFightTab(page, sheetId);
  const rollGlyph = content.locator(".roll-critical-injury");

  await test.step("the table dialog lists both world tables; cancel rolls nothing", async () => {
    const messagesBefore = await chatMessageCount(page);
    await rollGlyph.click();
    const dialog = criticalInjuryDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const options = await dialog
      .locator('select[name="currentTable"] option')
      .allTextContents();
    expect(options).toEqual([
      "Critical Injuries (Body)",
      "Critical Injuries (Head)",
    ]);

    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
    await expect.poll(() => chatMessageCount(page)).toBe(messagesBefore);
    const injuryCount = await page.evaluate(
      (aid) => game.actors.get(aid).itemTypes.criticalInjury.length,
      actorId,
    );
    expect(injuryCount).toBe(0);
  });

  let injuryName;
  await test.step("confirming draws an injury, posts a card and adds the item", async () => {
    const messagesBefore = await chatMessageCount(page);
    await rollGlyph.click();
    const dialog = criticalInjuryDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();

    const handle = await page.waitForFunction(
      (aid) => {
        const injuries = game.actors.get(aid).itemTypes.criticalInjury;
        return injuries.length === 1 ? injuries[0].name : null;
      },
      actorId,
      { timeout: 15000 },
    );
    injuryName = await handle.jsonValue();

    const messageId = await waitForNewChatMessage(page, messagesBefore, {
      requireContent: true,
    });
    const cardText = await page
      .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
      .textContent();
    expect(cardText).toContain(injuryName);
  });

  await test.step("the injury renders in the Meatspace injuries grid on a fresh render", async () => {
    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openFightTab(page, freshSheet);
    const row = freshContent.locator(
      ".injuries-grid .injuries-name a.name.item-edit",
    );
    await expect(row).toHaveCount(1);
    await expect(row.first()).toHaveText(injuryName);
  });
});

test("the Meat|Net toggle appears with an equipped cyberdeck and persists", async ({
  page,
}) => {
  const deckName = uniqueName("deck");

  await enablePlayersCreateInventory(page);
  let { actorId, sheetId } = await createCharacterViaUI(page);

  await test.step("a fresh character has no toggle", async () => {
    await expect(page.locator(`#${sheetId} .toggle-fight-state`)).toHaveCount(
      0,
    );
    await expect(page.locator(`#${sheetId} .tab-highlight`)).toHaveCount(0);
  });

  const deck = await createEquippedItemViaUI(page, {
    actorId,
    sheetId,
    itemType: "cyberdeck",
    itemName: deckName,
  });
  sheetId = deck.sheetId;
  sheetId = await closeAndReopenActorSheet(page, actorId);

  const content = await openFightTab(page, sheetId);
  const highlight = page.locator(`#${sheetId} .tab-highlight`);
  const labels = await page.evaluate(() => ({
    meat: game.i18n.localize("CPR.characterSheet.bottomPane.fight.meat"),
    net: game.i18n.localize("CPR.characterSheet.bottomPane.fight.net"),
  }));

  await test.step("Meatspace is highlighted until the toggle is clicked", async () => {
    await expect(highlight).toHaveText(labels.meat);
    await expect(content.locator(".weapon-section")).toBeVisible();
    await expect(content.locator(".interface-abilities-section")).toHaveCount(
      0,
    );

    await page
      .locator(`#${sheetId} a.toggle-fight-state[data-state="Netspace"]`)
      .click();
    await expect
      .poll(() => actorFlag(page, actorId, "fightState"))
      .toBe("Netspace");
  });

  await test.step("Netspace shows the deck's interface abilities and hides weapons", async () => {
    await expect(highlight).toHaveText(labels.net);
    await expect(content.locator(".interface-abilities-section")).toBeVisible({
      timeout: 10000,
    });
    await expect(content.locator(".weapon-section")).toHaveCount(0);
    await expect(content.locator(".armor-section")).toHaveCount(0);
  });

  await test.step("the Netspace state persists across a reopen", async () => {
    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openFightTab(page, freshSheet);
    await expect(page.locator(`#${freshSheet} .tab-highlight`)).toHaveText(
      labels.net,
    );
    await expect(
      freshContent.locator(".interface-abilities-section"),
    ).toBeVisible();
  });
});

test("the net role select lists every dragged role and persists the choice", async ({
  page,
}) => {
  const secondAbility = "Chrome Sub";
  const { actorId, sheetId, roleIds } = await setupCharacterWithDeck(page, {
    roles: [NET_ROLE_ABILITY, secondAbility],
  });

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const select = content.locator(
    'select.select-net-role[name="system.roleInfo.activeNetRole"]',
  );

  await test.step("the select lists both roles and the first dragged is active", async () => {
    await expect(select).toBeVisible({ timeout: 10000 });
    const options = await select.locator("option").allTextContents();
    expect(options).toEqual([NET_ROLE_ABILITY, secondAbility]);
    await expect(select).toHaveValue(roleIds[0]);
  });

  await test.step("choosing the second role updates and persists activeNetRole", async () => {
    await select.selectOption(roleIds[1]);
    await expect
      .poll(() =>
        page.evaluate(
          (aid) => game.actors.get(aid).system.roleInfo.activeNetRole,
          actorId,
        ),
      )
      .toBe(roleIds[1]);

    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openFightTab(page, freshSheet);
    await expect(
      freshContent.locator(
        'select.select-net-role[name="system.roleInfo.activeNetRole"]',
      ),
    ).toHaveValue(roleIds[1]);
  });
});

test("rolling an interface ability posts a card using the active net role", async ({
  page,
}) => {
  const { sheetId } = await setupCharacterWithDeck(page, {
    roles: [NET_ROLE_ABILITY],
  });

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const scannerLabel = await page.evaluate(() =>
    game.i18n.localize("CPR.global.role.netrunner.interfaceAbility.scanner"),
  );

  const messagesBefore = await chatMessageCount(page);
  await content.locator('a.rollable[data-interface-ability="scanner"]').click();
  const dialog = netRollDialog(page);
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog.locator('input[name="roleValue"]')).toHaveValue("3");
  await confirmRollDialog(dialog);

  const messageId = await waitForNewChatMessage(page, messagesBefore, {
    requireRoll: true,
  });
  const cardText = await page
    .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
    .textContent();
  expect(cardText).toContain(scannerLabel);
  expect(cardText).toContain(NET_ROLE_ABILITY);
});

test("rolling an interface ability without a net role shows an error and posts nothing", async ({
  page,
}) => {
  const { sheetId } = await setupCharacterWithDeck(page, {});

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const errorText = await page.evaluate(() =>
    game.i18n.localize("CPR.messages.noNetrunningRoleConfigured"),
  );

  page.expectedConsoleErrors.push(/No Netrunning role configured/);

  const messagesBefore = await chatMessageCount(page);
  await content.locator('a.rollable[data-interface-ability="scanner"]').click();

  await test.step("an error toast shows and no roll dialog or chat message appears", async () => {
    const errorNotification = page.locator(".notification.error").filter({
      hasText: errorText,
    });
    await expect(errorNotification).toBeVisible({ timeout: 10000 });
    await expect(netRollDialog(page)).toHaveCount(0);
    await expect.poll(() => chatMessageCount(page)).toBe(messagesBefore);
  });
});

test("installed programs group under their class headers with the right glyphs", async ({
  page,
}) => {
  const names = {
    booster: uniqueName("booster"),
    defender: uniqueName("defender"),
    attacker: uniqueName("attacker"),
    blackice: uniqueName("blackice"),
  };
  const { sheetId, programIds } = await setupCharacterWithDeck(page, {
    programs: [
      {
        key: "booster",
        name: names.booster,
        data: { system: { class: "booster" } },
      },
      {
        key: "defender",
        name: names.defender,
        data: { system: { class: "defender" } },
      },
      {
        key: "attacker",
        name: names.attacker,
        data: { system: { class: "antipersonnelattacker" } },
      },
      {
        key: "blackice",
        name: names.blackice,
        data: { system: { class: "blackice" } },
      },
    ],
  });

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const labels = await page.evaluate(() => ({
    antiPersonnel: game.i18n.localize(
      "CPR.global.programClass.antiPersonnelAttacker",
    ),
    antiProgram: game.i18n.localize(
      "CPR.global.programClass.antiProgramAttacker",
    ),
    booster: game.i18n.localize("CPR.global.programClass.booster"),
    defender: game.i18n.localize("CPR.global.programClass.defender"),
    blackice: game.i18n.localize("CPR.global.programClass.blackice"),
  }));

  await test.step("every class header renders and each program sits under its own", async () => {
    await expect
      .poll(
        () =>
          page.evaluate(
            (sid) =>
              Array.from(
                document
                  .getElementById(sid)
                  .querySelectorAll(".cyberdeck-installed-software > li"),
              ).map((el) =>
                el.classList.contains("items-header")
                  ? { header: el.textContent.trim() }
                  : { row: el.dataset.itemId },
              ),
            sheetId,
          ),
        { timeout: 10000 },
      )
      .toEqual([
        { header: labels.antiPersonnel },
        { row: programIds.attacker },
        { header: labels.antiProgram },
        { header: labels.booster },
        { row: programIds.booster },
        { header: labels.defender },
        { row: programIds.defender },
        { header: labels.blackice },
        { row: programIds.blackice },
      ]);
  });

  await test.step("booster and defender rows show def + rez glyphs, not italic", async () => {
    for (const key of ["booster", "defender"]) {
      const row = installedProgramRow(content, programIds[key]);
      await expect(
        row.locator('a.program-execution[data-execution-type="def"]'),
      ).toBeVisible();
      const rez = row.locator('a.program-execution[data-execution-type="rez"]');
      await expect(rez).toBeVisible();
      await expect(rez.locator("i.fa-circle-up")).toBeVisible();
      await expect(row.locator("a.name.item-view")).not.toHaveClass(
        /text-italic/,
      );
    }
  });

  await test.step("attacker rows show atk + damage glyphs, no def or rez", async () => {
    const row = installedProgramRow(content, programIds.attacker);
    await expect(
      row.locator('a.program-execution[data-execution-type="atk"]'),
    ).toBeVisible();
    await expect(
      row.locator('a.program-execution[data-execution-type="damage"]'),
    ).toBeVisible();
    await expect(
      row.locator('a.program-execution[data-execution-type="def"]'),
    ).toHaveCount(0);
    await expect(
      row.locator('a.program-execution[data-execution-type="rez"]'),
    ).toHaveCount(0);
  });

  await test.step("blackice rows show rez but no def glyph", async () => {
    const row = installedProgramRow(content, programIds.blackice);
    await expect(
      row.locator('a.program-execution[data-execution-type="rez"]'),
    ).toBeVisible();
    await expect(
      row.locator('a.program-execution[data-execution-type="def"]'),
    ).toHaveCount(0);
  });
});

test("rezzing a program moves it to the rezzed list and derezzing reverses it", async ({
  page,
}) => {
  const boosterName = uniqueName("booster");
  const { actorId, sheetId, programIds } = await setupCharacterWithDeck(page, {
    programs: [
      {
        key: "booster",
        name: boosterName,
        data: { system: { class: "booster" } },
      },
    ],
  });

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const installedRow = installedProgramRow(content, programIds.booster);
  const nameLink = installedRow.locator("a.name.item-view");
  const rezGlyph = installedRow.locator(
    'a.program-execution[data-execution-type="rez"]',
  );
  const derezGlyph = installedRow.locator(
    'a.program-execution[data-execution-type="derez"]',
  );
  const rezzedRow = rezzedProgramRow(content, programIds.booster);

  await test.step("an unrezzed program renders in the installed list without italics", async () => {
    await expect(nameLink).toBeVisible({ timeout: 10000 });
    await expect(nameLink).not.toHaveClass(/text-italic/);
    await expect(rezGlyph.locator("i.fa-circle-up")).toBeVisible();
    await expect(derezGlyph).toHaveCount(0);
    await expect(rezzedRow).toHaveCount(0);
  });

  await test.step("rezzing moves it to the rezzed list with its stats", async () => {
    await rezGlyph.click();
    await expect(rezzedRow).toBeVisible({ timeout: 10000 });
    await expect(rezzedRow.locator(".rezzed-program-atk")).toHaveText("0");
    await expect(rezzedRow.locator(".rezzed-program-def")).toHaveText("0");
    await expect(rezzedRow.locator(".rezzed-program-rez")).toHaveText("10");
    await expect(nameLink).toHaveClass(/text-italic/);
    await expect(derezGlyph.locator("i.fa-circle-down")).toBeVisible();
    await expect(rezGlyph).toHaveCount(0);
  });

  await test.step("derezzing reverts the program on the client", async () => {
    await derezGlyph.click();
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ aid, pid }) =>
              game.actors.get(aid).items.get(pid).system.isRezzed,
            { aid: actorId, pid: programIds.booster },
          ),
        { timeout: 10000 },
      )
      .toBe(false);

    const freshSheet = await closeAndReopenActorSheet(page, actorId);
    const freshContent = await openFightTab(page, freshSheet);
    await expect(
      rezzedProgramRow(freshContent, programIds.booster),
    ).toHaveCount(0, { timeout: 10000 });
    const freshRow = installedProgramRow(freshContent, programIds.booster);
    await expectUnrezzedProgram(freshRow);
  });

  await test.step("derezzing persists across a world reload", async () => {
    await gotoGame(page);
    const sheet = await reopenActorSheetViaUI(page, actorId);
    const contentAfterReload = await openFightTab(page, sheet);
    await openNetspace(page, sheet);
    await expect(
      rezzedProgramRow(contentAfterReload, programIds.booster),
    ).toHaveCount(0, { timeout: 10000 });
    const row = installedProgramRow(contentAfterReload, programIds.booster);
    await expectUnrezzedProgram(row);
  });
});

test("reduce-rez decrements a rezzed program's rez and reset-rez restores max", async ({
  page,
}) => {
  const boosterName = uniqueName("booster");
  const { actorId, sheetId, programIds } = await setupCharacterWithDeck(page, {
    programs: [
      {
        key: "booster",
        name: boosterName,
        data: {
          system: {
            class: "booster",
            atk: 2,
            def: 3,
            rez: { value: 7, max: 10 },
          },
        },
      },
    ],
  });

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const installedRow = installedProgramRow(content, programIds.booster);
  await installedRow
    .locator('a.program-execution[data-execution-type="rez"]')
    .click();

  const rezzedRow = rezzedProgramRow(content, programIds.booster);
  await expect(rezzedRow).toBeVisible({ timeout: 10000 });

  const rezValue = () =>
    page.evaluate(
      ({ aid, pid }) => game.actors.get(aid).items.get(pid).system.rez.value,
      { aid: actorId, pid: programIds.booster },
    );

  await test.step("the rezzed row shows the configured atk/def/rez", async () => {
    await expect(rezzedRow.locator(".rezzed-program-atk")).toHaveText("2");
    await expect(rezzedRow.locator(".rezzed-program-def")).toHaveText("3");
    await expect(rezzedRow.locator(".rezzed-program-rez")).toHaveText("7");
  });

  await test.step("reduce-rez decrements the rez value by one", async () => {
    const reduce = rezzedRow.locator(
      'a.program-execution[data-execution-type="reduce-rez"]',
    );
    await expect(reduce).toBeVisible();
    await reduce.click();
    await expect.poll(rezValue).toBe(6);
    await expect(rezzedRow.locator(".rezzed-program-rez")).toHaveText("6");
  });

  await test.step("reset-rez restores the max rez", async () => {
    await rezzedRow
      .locator('a.program-execution[data-execution-type="reset-rez"]')
      .click();
    await expect.poll(rezValue).toBe(10);
    await expect(rezzedRow.locator(".rezzed-program-rez")).toHaveText("10");
  });
});

test("program attack, defense and damage rolls post cards titled with the program", async ({
  page,
}) => {
  const attackerName = uniqueName("attacker");
  const defenderName = uniqueName("defender");
  const { sheetId, programIds } = await setupCharacterWithDeck(page, {
    programs: [
      {
        key: "attacker",
        name: attackerName,
        data: { system: { class: "antipersonnelattacker" } },
      },
      {
        key: "defender",
        name: defenderName,
        data: { system: { class: "defender" } },
      },
    ],
    roles: [NET_ROLE_ABILITY],
  });

  const content = await openFightTab(page, sheetId);
  await openNetspace(page, sheetId);

  const attackerRow = installedProgramRow(content, programIds.attacker);
  const defenderRow = installedProgramRow(content, programIds.defender);

  async function rollProgram(row, executionType, name) {
    const messagesBefore = await chatMessageCount(page);
    const glyph = row.locator(
      `a.program-execution[data-execution-type="${executionType}"]`,
    );
    await glyph.click();
    const dialog =
      executionType === "damage"
        ? programDamageDialog(page)
        : netRollDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await confirmRollDialog(dialog);

    const messageId = await waitForNewChatMessage(page, messagesBefore, {
      requireRoll: true,
    });
    const cardText = await page
      .locator(`#chat .chat-message[data-message-id="${messageId}"]`)
      .textContent();
    expect(cardText).toContain(name);
  }

  await test.step("the attacker's atk glyph rolls an interface attack", async () => {
    await rollProgram(attackerRow, "atk", attackerName);
  });

  await test.step("the defender's def glyph is not overlapped by the uninstall link", async () => {
    const shield = await defenderRow
      .locator(".installed-program-defense")
      .boundingBox();
    const uninstall = await defenderRow
      .locator("a.uninstall-single-item")
      .boundingBox();
    expect(shield).not.toBeNull();
    expect(uninstall).not.toBeNull();
    const overlaps =
      shield.x < uninstall.x + uninstall.width &&
      uninstall.x < shield.x + shield.width &&
      shield.y < uninstall.y + uninstall.height &&
      uninstall.y < shield.y + shield.height;
    expect(overlaps).toBe(false);
  });

  await test.step("the defender's def glyph rolls an interface defense", async () => {
    await rollProgram(defenderRow, "def", defenderName);
  });

  await test.step("the attacker's damage glyph rolls program damage", async () => {
    await rollProgram(attackerRow, "damage", attackerName);
  });
});
