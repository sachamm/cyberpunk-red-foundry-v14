import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { openPlayerPage } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createItemViaUI,
  expectSheetRendered,
  openItemSettings,
  reopenItemSheetViaUI,
  setItemField,
  setItemSelected,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Program sheet: the type-specific Settings surface — program size, the class
 * select, and (for blackice) the Black ICE type select + PER/SPD stats. The
 * two damage rows branch on class × blackIceType: `damage.standard` shows for
 * the attacker classes (and for antipersonnel blackice), `damage.blackIce`
 * shows for antiprogramattacker and antiprogram blackice, so a blackice of
 * type `other` renders no damage row at all. ATK/DEF/REZ render for every
 * class — the template's attacker gate closes right after the damage rows.
 * The class select, Black ICE type select and both REZ inputs have no
 * editable guard, so on a player page they stay (disabled) form elements
 * instead of collapsing to spans like the guarded fields. The effects tab,
 * valuable section and header breadcrumb are owned by the composition,
 * item-effects and header specs; this spec pins what the program type itself
 * shows: the rendering matrix, persistence of every type-specific field, and
 * the observer view. No owned test — `isRezzed` is set by the actor-side
 * cyberdeck flow (phase 8).
 */

const CLASS_OPTIONS = [
  ["antipersonnelattacker", "Anti-Personnel"],
  ["antiprogramattacker", "Anti-Program"],
  ["booster", "Booster"],
  ["defender", "Defender"],
  ["blackice", "Black ICE"],
];

const BLACK_ICE_TYPE_OPTIONS = [
  ["antipersonnel", "Anti-Personnel"],
  ["antiprogram", "Anti-Program"],
  ["other", "Other"],
];

test("the settings rows follow the program class and Black ICE type", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "program",
    name: uniqueName("program"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });
  const settings = await openItemSettings(page, sheetId);
  const list = settings.locator(".item-settings-tab ol.items-list");
  const rowFor = (control) =>
    list.locator("li.item", { has: page.locator(control) });
  const expectStatsAndRez = async () => {
    await expect(list.locator('input[name="system.atk"]')).toHaveCount(1);
    await expect(list.locator('input[name="system.def"]')).toHaveCount(1);
    await expect(list.locator('input[name="system.rez.max"]')).toHaveCount(1);
    await expect(list.locator('input[name="system.rez.value"]')).toHaveCount(1);
  };

  const expectNoBlackIceRows = async () => {
    await expect(
      list.locator('select[name="system.blackIceType"]'),
    ).toHaveCount(0);
    await expect(list.locator('input[name="system.per"]')).toHaveCount(0);
    await expect(list.locator('input[name="system.spd"]')).toHaveCount(0);
  };

  await test.step("a fresh program (defender) shows no conditional rows", async () => {
    await expect(settings.locator('select[name="system.class"]')).toHaveValue(
      "defender",
    );
    for (const [value, label] of CLASS_OPTIONS) {
      await expect(
        settings.locator(
          `select[name="system.class"] option[value="${value}"]`,
        ),
      ).toHaveText(label);
    }
    await expect(list.locator('input[name="system.size"]')).toHaveCount(1);
    await expect(
      list.locator('input[name="system.damage.standard"]'),
    ).toHaveCount(0);
    await expect(
      list.locator('input[name="system.damage.blackIce"]'),
    ).toHaveCount(0);
    await expectNoBlackIceRows();
    await expectStatsAndRez();
  });

  await test.step("booster renders the same base set", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: "booster",
    });
    await expect(settings.locator('select[name="system.class"]')).toHaveValue(
      "booster",
    );
    await expect(
      list.locator('input[name="system.damage.standard"]'),
    ).toHaveCount(0);
    await expect(
      list.locator('input[name="system.damage.blackIce"]'),
    ).toHaveCount(0);
    await expectNoBlackIceRows();
    await expectStatsAndRez();
  });

  await test.step("antipersonnelattacker adds the standard damage row only", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: "antipersonnelattacker",
    });
    const standard = list.locator('input[name="system.damage.standard"]');
    await expect(standard).toHaveCount(1);
    await expect(
      rowFor('input[name="system.damage.standard"]').locator(".setting-name"),
    ).toHaveText("Damage");
    await expect(
      list.locator('input[name="system.damage.blackIce"]'),
    ).toHaveCount(0);
    await expectNoBlackIceRows();
    await expectStatsAndRez();
  });

  await test.step("antiprogramattacker adds both damage rows", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: "antiprogramattacker",
    });
    await expect(
      rowFor('input[name="system.damage.standard"]').locator(".setting-name"),
    ).toHaveText("Damage to non Black ICE");
    const blackIce = list.locator('input[name="system.damage.blackIce"]');
    await expect(blackIce).toHaveCount(1);
    await expect(
      rowFor('input[name="system.damage.blackIce"]').locator(".setting-name"),
    ).toHaveText("Damage to Black ICE");
    await expectNoBlackIceRows();
    await expectStatsAndRez();
  });

  await test.step("blackice adds the type select and PER/SPD", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: "blackice",
    });
    const typeSelect = settings.locator('select[name="system.blackIceType"]');
    await expect(typeSelect).toHaveCount(1);
    await expect(typeSelect).toHaveValue("antipersonnel");
    for (const [value, label] of BLACK_ICE_TYPE_OPTIONS) {
      await expect(typeSelect.locator(`option[value="${value}"]`)).toHaveText(
        label,
      );
    }
    await expect(list.locator('input[name="system.per"]')).toHaveCount(1);
    await expect(list.locator('input[name="system.spd"]')).toHaveCount(1);
    // The default antipersonnel type keeps the standard row, labelled for
    // netrunners.
    const standard = list.locator('input[name="system.damage.standard"]');
    await expect(standard).toHaveCount(1);
    await expect(
      rowFor('input[name="system.damage.standard"]').locator(".setting-name"),
    ).toHaveText("Damage to Netrunner");
    await expect(
      list.locator('input[name="system.damage.blackIce"]'),
    ).toHaveCount(0);
    await expectStatsAndRez();
  });

  await test.step("antiprogram blackice swaps the standard row for the Black ICE row", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.blackIceType",
      value: "antiprogram",
    });
    await expect(
      list.locator('input[name="system.damage.standard"]'),
    ).toHaveCount(0);
    const blackIce = list.locator('input[name="system.damage.blackIce"]');
    await expect(blackIce).toHaveCount(1);
    await expect(
      rowFor('input[name="system.damage.blackIce"]').locator(".setting-name"),
    ).toHaveText("Damage to Programs");
    // PER/SPD stay — they key off the class, not the type.
    await expect(list.locator('input[name="system.per"]')).toHaveCount(1);
    await expect(list.locator('input[name="system.spd"]')).toHaveCount(1);
    await expectStatsAndRez();
  });

  await test.step("a blackice of type other renders no damage row at all", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.blackIceType",
      value: "other",
    });
    await expect(
      list.locator('input[name="system.damage.standard"]'),
    ).toHaveCount(0);
    await expect(
      list.locator('input[name="system.damage.blackIce"]'),
    ).toHaveCount(0);
    await expect(list.locator('input[name="system.per"]')).toHaveCount(1);
    await expect(list.locator('input[name="system.spd"]')).toHaveCount(1);
    await expectStatsAndRez();
  });
});

test("size, class, Black ICE type, damage, stats and REZ persist across a hard reopen", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "program",
    name: uniqueName("program"),
  });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await test.step("set every field in the states where it is visible", async () => {
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: "antiprogramattacker",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.size",
      path: "system.size",
      value: 3,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.damage.standard",
      path: "system.damage.standard",
      value: "3d6",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.damage.blackIce",
      path: "system.damage.blackIce",
      value: "2d6+1",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.atk",
      path: "system.atk",
      value: 6,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.def",
      path: "system.def",
      value: 7,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.rez.max",
      path: "system.rez.max",
      value: 12,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.rez.value",
      path: "system.rez.value",
      value: 9,
    });
    await setItemSelected(page, {
      sheetId,
      itemId,
      name: "system.class",
      value: "blackice",
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.per",
      path: "system.per",
      value: 4,
    });
    await setItemField(page, {
      sheetId,
      itemId,
      name: "system.spd",
      path: "system.spd",
      value: 5,
    });
  });

  let reopened;
  await test.step("the values survive a hard reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    reopened = await reopenItemSheetViaUI(page, itemId);
    const settings = await openItemSettings(page, reopened);
    await expect(settings.locator('select[name="system.class"]')).toHaveValue(
      "blackice",
    );
    await expect(
      settings.locator('select[name="system.blackIceType"]'),
    ).toHaveValue("antipersonnel");
    await expect(settings.locator('input[name="system.size"]')).toHaveValue(
      "3",
    );
    await expect(
      settings.locator('input[name="system.damage.standard"]'),
    ).toHaveValue("3d6");
    await expect(settings.locator('input[name="system.per"]')).toHaveValue("4");
    await expect(settings.locator('input[name="system.spd"]')).toHaveValue("5");
    await expect(settings.locator('input[name="system.atk"]')).toHaveValue("6");
    await expect(settings.locator('input[name="system.def"]')).toHaveValue("7");
    await expect(settings.locator('input[name="system.rez.max"]')).toHaveValue(
      "12",
    );
    await expect(
      settings.locator('input[name="system.rez.value"]'),
    ).toHaveValue("9");
  });

  await test.step("the hidden Black ICE damage row kept its value too", async () => {
    await setItemSelected(page, {
      sheetId: reopened,
      itemId,
      name: "system.blackIceType",
      value: "antiprogram",
    });
    const settings = page.locator(`#${reopened}`);
    await expect(
      settings.locator('input[name="system.damage.blackIce"]'),
    ).toHaveValue("2d6+1");
    await expect(
      settings.locator('input[name="system.damage.standard"]'),
    ).toHaveCount(0);
  });
});

test("an observer sees unguarded controls as disabled elements and guarded fields as spans", async ({
  page,
  browser,
  baseURL,
}) => {
  const name = uniqueName("observed-program");
  const itemId = await createItemViaUI(page, { type: "program", name });
  const sheetId = await expectSheetRendered(page, {
    collection: "items",
    id: itemId,
  });

  await setItemSelected(page, {
    sheetId,
    itemId,
    name: "system.class",
    value: "blackice",
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.size",
    path: "system.size",
    value: 2,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.damage.standard",
    path: "system.damage.standard",
    value: "3d6",
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.per",
    path: "system.per",
    value: 4,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.spd",
    path: "system.spd",
    value: 5,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.atk",
    path: "system.atk",
    value: 6,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.def",
    path: "system.def",
    value: 7,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.rez.max",
    path: "system.rez.max",
    value: 12,
  });
  await setItemField(page, {
    sheetId,
    itemId,
    name: "system.rez.value",
    path: "system.rez.value",
    value: 9,
  });
  await closeDocSheet(page, { collection: "items", id: itemId });

  await page.evaluate(async (id) => {
    const item = game.items.get(id);
    await item.update({
      "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    });
  }, itemId);

  const player = await openPlayerPage(browser, baseURL);
  try {
    const observerSheetId = await reopenItemSheetViaUI(player.page, itemId);
    const settings = await openItemSettings(player.page, observerSheetId);
    const list = settings.locator(".item-settings-tab ol.items-list");

    for (const [label, value] of [
      [/Program Size/, "2"],
      [/Netrunner/, "3d6"],
      [/PER/, "4"],
      [/SPD/, "5"],
      [/ATK/, "6"],
      [/DEF/, "7"],
    ]) {
      const row = list.locator("li.item", {
        has: player.page.locator(".setting-name", { hasText: label }),
      });
      await expect.soft(row).toHaveCount(1);
      await expect.soft(row.locator(".setting-value span")).toHaveText(value);
      await expect.soft(row.locator("input, select")).toHaveCount(0);
    }

    const classSelect = list.locator('select[name="system.class"]');
    await expect.soft(classSelect).toBeDisabled();
    await expect.soft(classSelect).toHaveValue("blackice");
    const typeSelect = list.locator('select[name="system.blackIceType"]');
    await expect.soft(typeSelect).toBeDisabled();
    await expect.soft(typeSelect).toHaveValue("antipersonnel");
    const rezMax = list.locator('input[name="system.rez.max"]');
    await expect.soft(rezMax).toBeDisabled();
    await expect.soft(rezMax).toHaveValue("12");
    const rezCurrent = list.locator('input[name="system.rez.value"]');
    await expect.soft(rezCurrent).toBeDisabled();
    await expect.soft(rezCurrent).toHaveValue("9");
  } finally {
    await player.context.close();
  }
});
