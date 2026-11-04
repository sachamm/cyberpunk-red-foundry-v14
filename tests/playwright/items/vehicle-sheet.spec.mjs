import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
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
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Vehicle sheet: the four type-specific Settings inputs (structural damage
 * points, seats, combat speed, narrative speed) and the upgrade-adjusted
 * rendering of an owned vehicle. The generic install flow and the
 * override-vs-modifier arithmetic are owned by upgradable.spec.mjs; this spec
 * pins what the vehicle sheet itself shows: schema defaults, persistence of
 * every stat, the `cprShowUpgrade` callout on the upgraded stat label only,
 * and the upgrade-adjusted header chips (the world copy keeps its base
 * values).
 */

test("vehicle sheet stats render defaults and persist across a hard reopen", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "vehicle",
    name: uniqueName("vehicle"),
  });
  let sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  let settings = await openItemSettings(page, sheetId);

  await test.step("a new vehicle shows the schema defaults", async () => {
    await expect(settings.locator('input[name="system.sdp"]')).toHaveValue(
      "50",
    );
    await expect(settings.locator('input[name="system.seats"]')).toHaveValue(
      "2",
    );
    await expect(
      settings.locator('input[name="system.speedCombat"]'),
    ).toHaveValue("20");
    await expect(
      settings.locator('input[name="system.speedNarrative"]'),
    ).toHaveValue("");
  });

  // Numeric fields store numbers, so the values must match the stored type —
  // setItemField polls for a strict equality against the document.
  const values = [
    ["system.sdp", 75],
    ["system.seats", 6],
    ["system.speedCombat", 30],
    ["system.speedNarrative", "120mph"],
  ];

  await test.step("setting every stat to a non-default value persists across a hard reopen", async () => {
    for (const [path, value] of values) {
      await setItemField(page, { sheetId, itemId, name: path, path, value });
    }

    await closeDocSheet(page, { collection: "items", id: itemId });
    sheetId = await reopenItemSheetViaUI(page, itemId);
    settings = await openItemSettings(page, sheetId);
    for (const [path, value] of values) {
      await expect(settings.locator(`input[name="${path}"]`)).toHaveValue(
        String(value),
      );
    }
  });
});

test("an installed seating upgrade adjusts the owned vehicle callout and chips", async ({
  page,
}) => {
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("vehicle-owner"),
  });
  const actorSheetId = await expectSheetRendered(page, {
    collection: "actors",
    id: actorId,
  });

  // World vehicle with a non-default seat count so the upgrade-adjusted chip
  // (8) is distinguishable from the base (6).
  const vehicleName = uniqueName("vehicle");
  const worldVehicleId = await createItemViaUI(page, {
    type: "vehicle",
    name: vehicleName,
  });
  const worldSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: worldVehicleId,
  });
  await setItemField(page, {
    sheetId: worldSheetId,
    itemId: worldVehicleId,
    name: "system.seats",
    path: "system.seats",
    value: 6,
  });
  await closeDocSheet(page, { collection: "items", id: worldVehicleId });
  await dragItemToActorSheet(page, {
    itemId: worldVehicleId,
    sheetId: actorSheetId,
    actorId,
  });
  const vehicleId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: vehicleName },
  );

  // A seating upgrade built through the UI, mirroring the core "Seating
  // Upgrade" (+2 seats) — no compendium import needed.
  const upgradeName = uniqueName("seating-upgrade");
  const worldUpgradeId = await createItemViaUI(page, {
    type: "itemUpgrade",
    name: upgradeName,
  });
  const upgradeSheetId = await expectSheetRendered(page, {
    collection: "items",
    id: worldUpgradeId,
  });
  await setItemSelected(page, {
    sheetId: upgradeSheetId,
    itemId: worldUpgradeId,
    name: "system.type",
    value: "vehicle",
  });
  await setItemSelected(page, {
    sheetId: upgradeSheetId,
    itemId: worldUpgradeId,
    name: "system.modifiers.seats.type",
    value: "modifier",
  });
  await setItemField(page, {
    sheetId: upgradeSheetId,
    itemId: worldUpgradeId,
    name: "system.modifiers.seats.value",
    path: "system.modifiers.seats.value",
    value: 2,
  });
  await closeDocSheet(page, { collection: "items", id: worldUpgradeId });
  await dragItemToActorSheet(page, {
    itemId: worldUpgradeId,
    sheetId: actorSheetId,
    actorId,
  });
  const upgradeId = await page.evaluate(
    ({ actorId, name }) => game.actors.get(actorId).items.getName(name).id,
    { actorId, name: upgradeName },
  );

  let vehicleSheetId;
  const openVehicleSettings = async () => {
    if (vehicleSheetId)
      await closeOwnedItemSheet(page, { actorId, itemId: vehicleId });
    const gear = await activateGearTab(page, actorSheetId);
    const row = await hoverGearRow(gear, vehicleId);
    await row.locator(".item-edit").click();
    vehicleSheetId = await openOwnedItemSheet(page, {
      actorId,
      itemId: vehicleId,
    });
    return openItemSettings(page, vehicleSheetId);
  };

  const assertUpgradedVehicle = async (settings) => {
    const seatsRow = settings.locator("li.item", {
      has: page.locator('input[name="system.seats"]'),
    });
    await expect(seatsRow).toContainText("(Upgrades modifier: 2)");
    for (const name of ["system.sdp", "system.speedCombat"]) {
      const row = settings.locator("li.item", {
        has: page.locator(`input[name="${name}"]`),
      });
      await expect(row).not.toContainText("(");
    }
    const sheet = page.locator(`#${vehicleSheetId}`);
    await expect(sheet.locator(".item-header-chips")).toContainText("Seats 8");
    await expect(sheet.locator(".item-header-chips")).toContainText("SDP 50");
    await expect(sheet.locator(".item-header-chips")).toContainText(
      "Combat Speed 20",
    );
    await expect(
      sheet.locator(".item-image-block i.fa-square-caret-up"),
    ).toHaveCount(1);
  };

  await test.step("install the seating upgrade into the owned vehicle", async () => {
    await installUpgrade(page, {
      actorSheetId,
      actorId,
      upgradeId,
      targetId: vehicleId,
    });
  });

  await test.step("the owned sheet shows the callout, adjusted chips and upgrade icon", async () => {
    const settings = await openVehicleSettings();
    await assertUpgradedVehicle(settings);
  });

  await test.step("the upgrade rendering persists across a hard reopen", async () => {
    const settings = await openVehicleSettings();
    await assertUpgradedVehicle(settings);
  });

  await test.step("the world copy keeps its base values", async () => {
    await closeOwnedItemSheet(page, { actorId, itemId: vehicleId });
    const reopenedWorldId = await reopenItemSheetViaUI(page, worldVehicleId);
    const worldSettings = await openItemSettings(page, reopenedWorldId);
    const worldSeatsRow = worldSettings.locator("li.item", {
      has: page.locator('input[name="system.seats"]'),
    });
    await expect(worldSeatsRow).not.toContainText("(");
    await expect(
      worldSettings.locator('input[name="system.seats"]'),
    ).toHaveValue("6");
    const worldSheet = page.locator(`#${reopenedWorldId}`);
    await expect(worldSheet.locator(".item-header-chips")).toContainText(
      "Seats 6",
    );
    await expect(worldSheet.locator(".item-header-chips")).not.toContainText(
      "Seats 8",
    );
    await expect(
      worldSheet.locator(".item-image-block i.fa-square-caret-up"),
    ).toHaveCount(0);
  });
});
