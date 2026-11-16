import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  chatMessageCount,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  openItemSettings,
  openOwnedItemSheet,
  openSidebarTab,
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
  verifyRollDialog,
  waitForNewChatMessage,
} from "../../../tools/playwright/ui/index.mjs";
import {
  chatRollCard,
  rollCardTotal,
  rollDiceSum,
} from "../actors/character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Critical injury sheet: the type-specific Settings surface (location,
 * quick-fix type + DV inputs, treatment type + DV inputs, death-save
 * increase) and its header chips. The DV inputs branch on their parent
 * type select — `paramedic`/`surgery` render a single input,
 * `firstAidParamedic`/`paramedicSurgery` render both, and the remaining
 * choices render none. The generic item header/description surface is owned
 * by item-sheet-header.spec.mjs; this spec pins what the type itself shows:
 * the DV branching, persistence of every field, the DV chips + location
 * breadcrumb in the header, the owned sheet opened from a character's Fight
 * tab, and how an owned injury's death-save increase raises the character's
 * death save base penalty (derived stat, sheet display and roll card).
 */

// Hack a roll to make testing predictable
async function queueDeathSaveFaces(page, faces) {
  await page.evaluate((queuedFaces) => {
    window.__cprOrigRandomUniform = CONFIG.Dice.randomUniform;
    const queue = queuedFaces.map((face) => 1 - (face - 0.5) / 10);
    let i = 0;
    CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
  }, faces);
}

async function restoreDice(page) {
  await page.evaluate(() => {
    if (window.__cprOrigRandomUniform) {
      CONFIG.Dice.randomUniform = window.__cprOrigRandomUniform;
      delete window.__cprOrigRandomUniform;
    }
  });
}

test("quick-fix DV inputs follow the selected quickFix type", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "criticalInjury",
    name: uniqueName("criticalInjury"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const settings = await openItemSettings(page, sheetId);

  await test.step("the Effects tab is offered (effects mixin)", async () => {
    await expect(settings.locator('a[data-tab="item-effects"]')).toHaveCount(1);
  });

  await test.step("the default firstAidParamedic type renders both DV inputs", async () => {
    await expect(
      settings.locator('select[name="system.quickFix.type"]'),
    ).toHaveValue("firstAidParamedic");
    await expect(
      settings.locator('input[name="system.quickFix.dvFirstAid"]'),
    ).toBeVisible();
    await expect(
      settings.locator('input[name="system.quickFix.dvParamedic"]'),
    ).toBeVisible();
  });

  await test.step("paramedic renders only the paramedic DV input", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.quickFix.type",
      value: "paramedic",
    });
    await expect(
      settings.locator('input[name="system.quickFix.dvParamedic"]'),
    ).toBeVisible();
    await expect(
      settings.locator('input[name="system.quickFix.dvFirstAid"]'),
    ).toHaveCount(0);
  });

  await test.step("notApplicable renders no DV inputs", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.quickFix.type",
      value: "notApplicable",
    });
    await expect(
      settings.locator('input[name="system.quickFix.dvParamedic"]'),
    ).toHaveCount(0);
    await expect(
      settings.locator('input[name="system.quickFix.dvFirstAid"]'),
    ).toHaveCount(0);
  });
});

test("treatment DV inputs follow the selected treatment type", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "criticalInjury",
    name: uniqueName("criticalInjury"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const settings = await openItemSettings(page, sheetId);

  await test.step("the default paramedicSurgery type renders both DV inputs", async () => {
    await expect(
      settings.locator('select[name="system.treatment.type"]'),
    ).toHaveValue("paramedicSurgery");
    await expect(
      settings.locator('input[name="system.treatment.dvParamedic"]'),
    ).toBeVisible();
    await expect(
      settings.locator('input[name="system.treatment.dvSurgery"]'),
    ).toBeVisible();
  });

  await test.step("surgery renders only the surgery DV input", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.treatment.type",
      value: "surgery",
    });
    await expect(
      settings.locator('input[name="system.treatment.dvSurgery"]'),
    ).toBeVisible();
    await expect(
      settings.locator('input[name="system.treatment.dvParamedic"]'),
    ).toHaveCount(0);
  });

  await test.step("quickFix renders no DV inputs", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.treatment.type",
      value: "quickFix",
    });
    await expect(
      settings.locator('input[name="system.treatment.dvSurgery"]'),
    ).toHaveCount(0);
    await expect(
      settings.locator('input[name="system.treatment.dvParamedic"]'),
    ).toHaveCount(0);
  });
});

test("location, DVs in their branch states and deathSaveIncrease persist across a hard reopen", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "criticalInjury",
    name: uniqueName("criticalInjury"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await test.step("set location, single-DV branch states and deathSaveIncrease", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.location",
      value: "head",
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.quickFix.type",
      value: "paramedic",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.quickFix.dvParamedic",
      path: "system.quickFix.dvParamedic",
      value: 4,
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.treatment.type",
      value: "surgery",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.treatment.dvSurgery",
      path: "system.treatment.dvSurgery",
      value: 6,
    });
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.deathSaveIncrease",
      expected: true,
    });
  });

  await test.step("every value persists across a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    const settings = await openItemSettings(page, sheetId);
    await expect(
      settings.locator('select[name="system.location"]'),
    ).toHaveValue("head");
    await expect(
      settings.locator('select[name="system.quickFix.type"]'),
    ).toHaveValue("paramedic");
    await expect(
      settings.locator('input[name="system.quickFix.dvParamedic"]'),
    ).toHaveValue("4");
    await expect(
      settings.locator('input[name="system.quickFix.dvFirstAid"]'),
    ).toHaveCount(0);
    await expect(
      settings.locator('select[name="system.treatment.type"]'),
    ).toHaveValue("surgery");
    await expect(
      settings.locator('input[name="system.treatment.dvSurgery"]'),
    ).toHaveValue("6");
    await expect(
      settings.locator('input[name="system.treatment.dvParamedic"]'),
    ).toHaveCount(0);
    await expect(
      settings.locator('[data-target="system.deathSaveIncrease"] i'),
    ).toHaveClass(/check/);
  });
});

test("the header shows the injury's DV chips and location breadcrumb", async ({
  page,
}) => {
  const name = uniqueName("criticalInjury");
  const itemId = await createItemViaUI(page, { type: "criticalInjury", name });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await test.step("a new injury shows no chips and the Body breadcrumb", async () => {
    const sheet = page.locator(`#${sheetId}`);
    await expect(
      sheet.locator(".item-header-chips .cpr-browser-chip"),
    ).toHaveCount(0);
    await expect(sheet.locator(".item-header-breadcrumb")).toContainText(
      "Body",
    );
  });

  // The chip shows the first positive DV in each set: dvFirstAid (1) beats
  // dvParamedic (5), and treatment dvParamedic (2) beats dvSurgery (3).
  await test.step("setting DVs, deathSaveIncrease and location updates the chips", async () => {
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.quickFix.dvFirstAid",
      path: "system.quickFix.dvFirstAid",
      value: 1,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.quickFix.dvParamedic",
      path: "system.quickFix.dvParamedic",
      value: 5,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.treatment.dvParamedic",
      path: "system.treatment.dvParamedic",
      value: 2,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.treatment.dvSurgery",
      path: "system.treatment.dvSurgery",
      value: 3,
    });
    await toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: "system.deathSaveIncrease",
      expected: true,
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.location",
      value: "head",
    });

    const chips = page.locator(`#${sheetId} .item-header-chips`);
    await expect(chips).toContainText("Quick Fix DV 1");
    await expect(chips).toContainText("Treatment DV 2");
    await expect(chips).toContainText("Death Save Increase");
    await expect(
      page.locator(`#${sheetId} .item-header-breadcrumb`),
    ).toContainText("Head");
  });

  await test.step("the chips and breadcrumb persist across a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    const chips = page.locator(`#${sheetId} .item-header-chips`);
    await expect(chips).toContainText("Quick Fix DV 1");
    await expect(chips).toContainText("Treatment DV 2");
    await expect(chips).toContainText("Death Save Increase");
    await expect(
      page.locator(`#${sheetId} .item-header-breadcrumb`),
    ).toContainText("Head");
  });
});

test("an owned criticalInjury opens an editable sheet from the character's Fight tab", async ({
  page,
}) => {
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("character"),
  });
  const actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  const injuryName = uniqueName("criticalInjury");
  const itemId = await createItemViaUI(page, {
    type: "criticalInjury",
    name: injuryName,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragItemToActorSheet(page, { itemId, sheetId: actorSheetId, actorId });

  const embeddedId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: injuryName },
  );

  let ownedSheetId;
  // Injuries list on the character's Fight tab; the row's name link opens
  // the owned sheet (cpr-actor-sheet.js _renderItemCard).
  const openOwnedInjurySettings = async () => {
    if (ownedSheetId)
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="fight"]`)
      .click();
    const row = page.locator(
      `#${actorSheetId} .injuries-section a.item-edit[data-item-id="${embeddedId}"]`,
    );
    await expect(row).toBeVisible();
    await row.click();
    ownedSheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: embeddedId,
    });
    return openItemSettings(page, ownedSheetId);
  };

  await test.step("the dropped injury lists on the Fight tab and opens its owned sheet", async () => {
    const settings = await openOwnedInjurySettings();
    await expect(
      settings.locator('select[name="system.location"]'),
    ).toHaveValue("body");
    await expect(
      settings.locator('[data-target="system.deathSaveIncrease"] i'),
    ).toHaveClass(/fa-circle$/);
  });

  await test.step("editing location and deathSaveIncrease on the owned sheet persists across a hard reopen", async () => {
    // The owned sheet is still open from the previous step.
    await setItemSelected(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      name: "system.location",
      value: "head",
    });
    await toggleItemCheckbox(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      target: "system.deathSaveIncrease",
      expected: true,
    });

    const reopened = await openOwnedInjurySettings();
    await expect(
      reopened.locator('select[name="system.location"]'),
    ).toHaveValue("head");
    await expect(
      reopened.locator('[data-target="system.deathSaveIncrease"] i'),
    ).toHaveClass(/check/);
  });
});

test("an owned injury's Increase Base Death Save raises the character's death save", async ({
  page,
}) => {
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("character"),
  });
  const actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  const injuryName = uniqueName("criticalInjury");
  const itemId = await createItemViaUI(page, {
    type: "criticalInjury",
    name: injuryName,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await dragItemToActorSheet(page, { itemId, sheetId: actorSheetId, actorId });

  const embeddedId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: injuryName },
  );

  // Read-only access to the derived stat the flag feeds into: every owned
  // injury with deathSaveIncrease adds +1 to basePenalty (cpr-actor.js
  // _calculateDerivedStats), and the death save roll totals die + basePenalty
  // + penalty + mods.
  const expectBasePenalty = async (value) => {
    await page.waitForFunction(
      ({ actorId, expected }) =>
        game.actors.get(actorId).system.derivedStats.deathSave.basePenalty ===
        expected,
      { actorId, expected: value },
      { timeout: 10000 },
    );
  };

  let ownedSheetId;
  // Same Fight-tab row flow as the owned-sheet test above.
  const openOwnedInjurySettings = async () => {
    if (ownedSheetId)
      await closeOwnedItemSheet(page, { actorId, itemId: embeddedId });
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="fight"]`)
      .click();
    const row = page.locator(
      `#${actorSheetId} .injuries-section a.item-edit[data-item-id="${embeddedId}"]`,
    );
    await expect(row).toBeVisible();
    await row.click();
    ownedSheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: embeddedId,
    });
    return openItemSettings(page, ownedSheetId);
  };

  // Roll the death save from the left pane and return the posted message id.
  const rollDeathSave = async () => {
    const messagesBefore = await chatMessageCount(page);
    await page
      .locator(
        `#${actorSheetId} .actor-details-death-save a.rollable[data-roll-type="deathsave"]`,
      )
      .click();
    const dialog = await verifyRollDialog(page);
    await dialog
      .locator('button.cpr-dialog-button[data-action="confirm"]')
      .click();
    return waitForNewChatMessage(page, messagesBefore, { requireRoll: true });
  };

  await test.step("a new owned injury leaves the death save base penalty at zero", async () => {
    await expectBasePenalty(0);
  });

  await test.step("flagging the owned injury raises the base penalty by one", async () => {
    await openOwnedInjurySettings();
    await toggleItemCheckbox(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      target: "system.deathSaveIncrease",
      expected: true,
    });
    await expectBasePenalty(1);
    // The left pane shows the derived value (penalty + basePenalty) and the
    // Fight-tab injury row labels the flag.
    await expect(
      page.locator(`#${actorSheetId} .actor-details-death-save-value`),
    ).toHaveText("1");
    await expect(
      page.locator(`#${actorSheetId} .injuries-section .injuries-desc`),
    ).toContainText("Death Save +1");
  });

  await test.step("a death save roll totals the die plus the base penalty", async () => {
    // Queue a failing face (total 7 vs BODY 6): a passed death save would
    // persist a +1 death-save penalty and confound the unflag step below.
    await queueDeathSaveFaces(page, [6]);
    const messageId = await rollDeathSave();
    await openSidebarTab(page, "chat");
    const card = chatRollCard(page, messageId);
    await expect(card).toBeVisible();
    // New character: no failed-save penalty and no mods, so the only thing
    // added to the die is the injury's base penalty.
    expect(
      (await rollCardTotal(card)) - (await rollDiceSum(page, messageId)),
      "card total minus the rolled die",
    ).toBe(1);

    // The card details show where the +1 came from.
    await card.locator(".d10-number-div span.clickable").click();
    await expect(card.locator(".d10-data-details")).toBeVisible();
    await expect(card.locator(".d10-data-details")).toContainText(
      "Base Death Penalty: 1",
    );
    await restoreDice(page);
  });

  await test.step("unflagging the injury removes the base penalty", async () => {
    // Rolling from the actor sheet brought it to the front, covering the
    // owned sheet's tabs — reopen it (which also brings it forward again).
    await openOwnedInjurySettings();
    await toggleItemCheckbox(page, {
      sheetId: ownedSheetId,
      itemId: embeddedId,
      actorId,
      target: "system.deathSaveIncrease",
      expected: false,
    });
    await expectBasePenalty(0);
    await expect(
      page.locator(`#${actorSheetId} .actor-details-death-save-value`),
    ).toHaveText("0");

    const messageId = await rollDeathSave();
    await openSidebarTab(page, "chat");
    const card = chatRollCard(page, messageId);
    await expect(card).toBeVisible();
    expect(
      (await rollCardTotal(card)) - (await rollDiceSum(page, messageId)),
      "card total minus the rolled die",
    ).toBe(0);
    await card.locator(".d10-number-div span.clickable").click();
    await expect(card.locator(".d10-data-details")).not.toContainText(
      "Base Death Penalty",
    );
  });
});
