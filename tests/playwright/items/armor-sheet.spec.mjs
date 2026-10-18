import { test, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import {
  activateGearTab,
  closeDocSheet,
  closeOwnedItemSheet,
  createActorViaUI,
  createItemViaUI,
  dragItemToActorSheet,
  expectSheetRendered,
  hoverGearRow,
  installUpgrade,
  openItemSettings,
  openOwnedItemSheet,
  reopenActorSheetViaUI,
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  toggleItemCheckbox,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

test.beforeEach(async ({ page }) => gotoReadyWorld(page));

test("Armor sheet location, ablation, penalty and shield settings persist", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "armor",
    name: uniqueName("armor"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const reopen = async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    return openItemSettings(page, sheetId);
  };
  const toggle = (field, expected) =>
    toggleItemCheckbox(page, {
      sheetId,
      itemId,
      target: `system.${field}`,
      expected,
    });
  const field = (name, value) =>
    setItemField(page, {
      sheetId,
      itemId,
      name: `system.${name}`,
      path: `system.${name}`,
      value,
    });

  await test.step("new body armor shows its tabs, fields and derived SP", async () => {
    const sheet = await openItemSettings(page, sheetId);
    for (const tab of ["description", "settings", "effects"]) {
      await expect
        .soft(sheet.locator(`.navtabs-item [data-tab="item-${tab}"]`))
        .toBeVisible();
    }
    await expect
      .soft(sheet.locator('input[name="system.bodyLocation.sp"]'))
      .toHaveValue("7");
    await expect
      .soft(sheet.locator('input[name="system.headLocation.sp"]'))
      .toHaveCount(0);
    await expect
      .soft(sheet.locator('[data-target="system.isShield"]'))
      .toHaveCount(0);
    await expect
      .soft(sheet.locator('select[name="system.equipped"]'))
      .toHaveCount(0);
    await expect.soft(sheet.locator(".item-header-chips")).toContainText("7/7");
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .toContainText("Body");
  });

  await test.step("body SP, ablation and penalty update the header and persist", async () => {
    for (const [name, value] of [
      ["bodyLocation.sp", 11],
      ["bodyLocation.ablation", 3],
      ["penalty", -2],
    ])
      await field(name, value);
    const sheet = await reopen();
    for (const [name, value] of [
      ["bodyLocation.sp", 11],
      ["bodyLocation.ablation", 3],
      ["penalty", -2],
    ]) {
      await expect
        .soft(sheet.locator(`input[name="system.${name}"]`))
        .toHaveValue(String(value));
    }
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("8/11");
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("Penalty -2");
  });

  await test.step("head-only armor swaps the fields and uses head SP", async () => {
    await toggle("isBodyLocation", false);
    await toggle("isHeadLocation", true);
    await field("headLocation.sp", 13);
    await field("headLocation.ablation", 4);
    const sheet = await reopen();
    await expect
      .soft(sheet.locator('input[name="system.bodyLocation.sp"]'))
      .toHaveCount(0);
    await expect
      .soft(sheet.locator('input[name="system.headLocation.sp"]'))
      .toHaveValue("13");
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("9/13");
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .toContainText("Head");
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .not.toContainText("Body");
  });

  await test.step("dual-location armor displays both SP values and hides shield mode", async () => {
    await toggle("isBodyLocation", true);
    const sheet = await reopen();
    await expect
      .soft(sheet.locator('input[name="system.headLocation.sp"]'))
      .toHaveValue("13");
    await expect
      .soft(sheet.locator('input[name="system.bodyLocation.sp"]'))
      .toHaveValue("11");
    await expect
      .soft(sheet.locator('[data-target="system.isShield"]'))
      .toHaveCount(0);
    for (const value of ["8/11", "9/13"])
      await expect
        .soft(sheet.locator(".item-header-chips"))
        .toContainText(value);
  });

  await test.step("shield mode replaces SP with current and maximum HP", async () => {
    await toggle("isBodyLocation", false);
    await toggle("isHeadLocation", false);
    await toggle("isShield", true);
    await field("shieldHitPoints.max", 20);
    await field("shieldHitPoints.value", 7);
    const sheet = await reopen();
    await expect
      .soft(sheet.locator('input[name="system.shieldHitPoints.max"]'))
      .toHaveValue("20");
    await expect
      .soft(sheet.locator('input[name="system.shieldHitPoints.value"]'))
      .toHaveValue("7");
    await expect
      .soft(sheet.locator('input[name$="Location.sp"]'))
      .toHaveCount(0);
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("7/20");
    await expect
      .soft(sheet.locator(".item-header-breadcrumb"))
      .toContainText("Shield");
  });

  await test.step("switching back preserves body values, including fully ablated armor", async () => {
    await toggle("isShield", false);
    await toggle("isBodyLocation", true);
    await field("bodyLocation.ablation", 11);
    const sheet = await reopen();
    await expect
      .soft(sheet.locator('input[name="system.bodyLocation.ablation"]'))
      .toHaveValue("11");
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("0/11");
    await expect
      .soft(sheet.locator('input[name="system.shieldHitPoints.max"]'))
      .toHaveCount(0);
  });
  await closeDocSheet(page, { collection: "items", id: itemId });
});

test("owned Armor sheet edits update tracked body armor and retain equipment and concealment", async ({
  page,
}) => {
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("armor-owner"),
  });
  let actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });
  const name = uniqueName("tracked-armor");
  const worldId = await createItemViaUI(page, { type: "armor", name });
  await expectSheetRendered(page, { collection: "items", id: worldId });
  await closeDocSheet(page, { collection: "items", id: worldId });
  await dragItemToActorSheet(page, {
    itemId: worldId,
    sheetId: actorSheetId,
    actorId,
  });
  const itemId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name },
  );
  let sheetId;
  const reopen = async () => {
    if (sheetId) await closeOwnedItemSheet(page, { actorId, itemId });
    const gear = await activateGearTab(page, actorSheetId);
    const row = await hoverGearRow(gear, itemId);
    await row.locator(".item-edit").click();
    sheetId = await openOwnedItemSheet(page, { actorId, itemId });
    return openItemSettings(page, sheetId);
  };

  await test.step("track the equipped armor through the Fight block", async () => {
    const sheet = await reopen();
    await sheet
      .locator('select[name="system.equipped"]')
      .selectOption("equipped");
    await page.waitForFunction(
      ({ actorId, itemId }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped ===
        "equipped",
      { actorId, itemId },
    );
    await closeOwnedItemSheet(page, { actorId, itemId });
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="fight"]`)
      .click();
    await page
      .locator(
        `#${actorSheetId} a.armor-current-untrack[data-item-id="${itemId}"][data-location="body"]`,
      )
      .click();
    await page.waitForFunction(
      ({ actorId, itemId }) =>
        game.actors.get(actorId).system.externalData.currentArmorBody.id ===
        itemId,
      { actorId, itemId },
    );
    await closeDocSheet(page, { collection: "actors", id: actorId });
    actorSheetId = await reopenActorSheetViaUI(page, actorId);
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="fight"]`)
      .click();
    await expect
      .soft(
        page.locator(
          `#${actorSheetId} a.armor-current-track[data-item-id="${itemId}"][data-location="body"]`,
        ),
      )
      .toBeVisible();
  });

  await test.step("item-sheet SP and ablation changes update the tracked resource", async () => {
    await reopen();
    await toggleItemCheckbox(page, {
      sheetId,
      actorId,
      itemId,
      target: "system.isHeadLocation",
      expected: true,
    });
    await expect
      .soft((await reopen()).locator('input[name="system.headLocation.sp"]'))
      .toBeVisible();
    for (const [name, value] of [
      ["bodyLocation.sp", 12],
      ["bodyLocation.ablation", 5],
    ]) {
      await setItemField(page, {
        sheetId,
        actorId,
        itemId,
        name: `system.${name}`,
        path: `system.${name}`,
        value,
      });
    }
    const sheet = await reopen();
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("7/12");
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const armor =
            game.actors.get(id).system.externalData.currentArmorBody;
          return { value: armor.value, max: armor.max };
        }, actorId),
      )
      .toEqual({ value: 7, max: 12 });
    await closeOwnedItemSheet(page, { actorId, itemId });
    await closeDocSheet(page, { collection: "actors", id: actorId });
    actorSheetId = await reopenActorSheetViaUI(page, actorId);
    await page
      .locator(`#${actorSheetId} .navtabs-bottom a[data-tab="fight"]`)
      .click();
    await expect
      .soft(
        page.locator(
          `#${actorSheetId} .armor-grid[data-item-id="${itemId}"] .armor-2-stats`,
        ),
      )
      .toHaveText("7/12");
  });

  await test.step("an installed armor upgrade adjusts the owned header without changing the world copy", async () => {
    await closeOwnedItemSheet(page, { actorId, itemId });
    const upgradeName = uniqueName("body-sp-upgrade");
    const upgradeId = await createItemViaUI(page, {
      type: "itemUpgrade",
      name: upgradeName,
    });
    const upgradeSheetId = await expectSheetRendered(page, {
      collection: "items",
      id: upgradeId,
    });
    await setItemSelected(page, {
      sheetId: upgradeSheetId,
      itemId: upgradeId,
      name: "system.type",
      value: "armor",
    });
    await setItemField(page, {
      sheetId: upgradeSheetId,
      itemId: upgradeId,
      name: "system.modifiers.bodySp.value",
      path: "system.modifiers.bodySp.value",
      value: 2,
    });
    await closeDocSheet(page, { collection: "items", id: upgradeId });
    await dragItemToActorSheet(page, {
      itemId: upgradeId,
      sheetId: actorSheetId,
      actorId,
    });
    const ownedUpgradeId = await page.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.getName(upgradeName).id,
      { actorId, upgradeName },
    );
    await installUpgrade(page, {
      actorSheetId,
      actorId,
      upgradeId: ownedUpgradeId,
      targetId: itemId,
    });
    const sheet = await reopen();
    await expect
      .soft(sheet.locator(".item-header-chips"))
      .toContainText("9/14");
    await expect
      .soft(sheet.locator('input[name="system.bodyLocation.sp"]'))
      .toHaveValue("12");
    await expect
      .soft(sheet.locator(".item-settings-tab"))
      .toContainText(upgradeName);
    const worldSheetId = await reopenItemSheetViaUI(page, worldId);
    await expect
      .soft(page.locator(`#${worldSheetId} .item-header-chips`))
      .toContainText("7/7");
    await closeDocSheet(page, { collection: "items", id: worldId });
  });

  await test.step("owned equipment selection persists", async () => {
    const sheet = await reopen();
    await sheet
      .locator('select[name="system.equipped"]')
      .selectOption("carried");
    await page.waitForFunction(
      ({ actorId, itemId }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped ===
        "carried",
      { actorId, itemId },
    );
    await expect
      .soft((await reopen()).locator('select[name="system.equipped"]'))
      .toHaveValue("carried");
  });

  for (const [target, expected] of [
    ["system.concealable.concealable", true],
    ["system.concealable.isConcealed", true],
    ["system.concealable.concealable", false],
    ["system.concealable.concealable", true],
  ]) {
    await test.step(`${target} becomes ${expected} after reopening`, async () => {
      await toggleItemCheckbox(page, {
        sheetId,
        actorId,
        itemId,
        target,
        expected,
      });
      const sheet = await reopen();
      await expect
        .soft(sheet.locator(`[data-target="${target}"] i`))
        .toHaveClass(expected ? /check/ : /fa-circle$/);
      if (target === "system.concealable.concealable") {
        const concealed = sheet.locator(
          '[data-target="system.concealable.isConcealed"]',
        );
        if (expected)
          await expect.soft(concealed.locator("i")).toHaveClass(/fa-circle$/);
        else await expect.soft(concealed).toHaveCount(0);
      }
    });
  }
  await closeOwnedItemSheet(page, { actorId, itemId });
  await closeDocSheet(page, { collection: "actors", id: actorId });
});

test("an Observer can read Armor without editing SP, description or effects", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = uniqueName("observed-armor");
  const itemId = await createItemViaUI(page, { type: "armor", name });
  await closeDocSheet(page, { collection: "items", id: itemId });
  await page.evaluate(async (id) => {
    const item = game.items.get(id);
    await item.update({
      "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    });
  }, itemId);
  const player = await openPlayerPage(browser, baseURL);
  try {
    const sheetId = await reopenItemSheetViaUI(player.page, itemId);
    const sheet = await openItemSettings(player.page, sheetId);
    await expect.soft(sheet.locator(".item-header-name-text")).toHaveText(name);
    await expect
      .soft(sheet.locator('input[name="system.bodyLocation.sp"]'))
      .toBeDisabled();
    await expect
      .soft(
        sheet.locator(
          'input[name="name"], input[name="system.brand"], a.source-action, a.manage-installed-upgrades',
        ),
      )
      .toHaveCount(0);
    await sheet.locator('[data-tab="item-effects"].tab-label').click();
    await expect.soft(sheet.locator("a.effect-control")).toHaveCount(0);
    await sheet.locator('[data-tab="item-description"].tab-label').click();
    await sheet.locator("prose-mirror").hover();
    await expect
      .soft(sheet.locator("prose-mirror button.toggle"))
      .toBeDisabled();
    await expect.soft(sheet.locator("prose-mirror button.toggle")).toBeHidden();
  } finally {
    await player.context.close();
  }
});
