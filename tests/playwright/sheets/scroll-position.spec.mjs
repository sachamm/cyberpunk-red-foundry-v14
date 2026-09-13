import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createEmbeddedItemViaUI,
  createDocumentViaUI,
  expectSheetRendered,
  openItemSettings,
  openNotesEditorViaUI,
  saveNotesEditorViaUI,
  waitForSheetReplacement,
  reopenActorSheetViaUI,
  reopenItemSheetViaUI,
  resizeSheetViaUI,
  changeActorSheetViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

async function setScrollPosition(locator, position) {
  return locator.evaluate((element, top) => {
    element.scrollTop = Math.min(
      top,
      element.scrollHeight - element.clientHeight,
    );
    return element.scrollTop;
  }, position);
}

async function expectScrollPosition(locator, expected) {
  await expect
    .poll(() => locator.evaluate((element) => element.scrollTop))
    .toBe(expected);
}

async function scrollToBottomViaWheel(page, locator) {
  await locator.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() =>
      locator.evaluate(
        (element) =>
          element.scrollTop === element.scrollHeight - element.clientHeight,
      ),
    )
    .toBe(true);
  return locator.evaluate((element) => element.scrollTop);
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Sheet scroll position (#1368, #1382)", () => {
  test("item settings remain stationary when an item update rerenders the sheet", async ({
    page: game,
  }) => {
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: uniqueName("scroll-weapon"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "items",
      id: itemId,
    });
    const sheet = await openItemSettings(game, sheetId);
    const scroller = sheet.locator(".item-bottom-content-section");
    const damageBonus = sheet.locator('input[name="system.damageCrit.bonus"]');

    await damageBonus.scrollIntoViewIfNeeded();
    await damageBonus.fill("1");
    const scrollTop = await scroller.evaluate((element) => element.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);

    const priorPart = await sheet
      .locator('[data-application-part="form"]')
      .elementHandle();
    await damageBonus.blur();
    await waitForSheetReplacement(game, priorPart);
    await game.waitForFunction(
      (id) => game.items.get(id).system.damageCrit.bonus === 1,
      itemId,
    );
    await expectScrollPosition(scroller, scrollTop);

    await closeDocSheet(game, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(game, itemId);
    const reopened = await openItemSettings(game, reopenedId);
    await expect(
      reopened.locator('input[name="system.damageCrit.bonus"]'),
    ).toHaveValue("1");
    await closeDocSheet(game, { collection: "items", id: itemId });
  });

  test("character panes remain stationary when a skill update rerenders the sheet", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("scroll-character"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });
    const sheet = game.locator(`#${sheetId}`);
    await sheet.locator('.navtabs-bottom [data-tab="lifepath"]').click();

    const rightScroller = sheet.locator(".right-content-section");
    const bottomScroller = sheet.locator(".bottom-content-section");
    const skillInput = sheet.locator(".skill-input").last();
    await skillInput.scrollIntoViewIfNeeded();
    const bottomScrollTop = await setScrollPosition(bottomScroller, 150);
    const skillId = await skillInput.evaluate(
      (input) => input.closest("[data-item-id]").dataset.itemId,
    );
    const level = Number(await skillInput.inputValue()) + 1;

    await skillInput.fill(String(level));
    const rightScrollTop = await rightScroller.evaluate(
      (element) => element.scrollTop,
    );
    expect(rightScrollTop).toBeGreaterThan(0);
    expect(bottomScrollTop).toBeGreaterThan(0);

    const priorPart = await sheet
      .locator('[data-application-part="form"]')
      .elementHandle();
    await skillInput.blur();
    await waitForSheetReplacement(game, priorPart);
    await game.waitForFunction(
      ({ actorId, skillId, level }) =>
        game.actors.get(actorId).items.get(skillId).system.level === level,
      { actorId, skillId, level },
    );
    await expectScrollPosition(rightScroller, rightScrollTop);
    await expectScrollPosition(bottomScroller, bottomScrollTop);

    await closeDocSheet(game, { collection: "actors", id: actorId });
    await reopenActorSheetViaUI(game, actorId);
    await expect(
      sheet.locator(`[data-item-id="${skillId}"] .skill-input`),
    ).toHaveValue(String(level));
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("container inventory remains reachable and stationary when the sheet updates", async ({
    page: game,
  }) => {
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "container",
      name: uniqueName("scroll-container"),
    });
    let sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    let lastItemId;
    await test.step("a populated inventory remains reachable after reopening", async () => {
      for (let index = 0; index < 20; index += 1) {
        lastItemId = await createEmbeddedItemViaUI(game, {
          sheetId,
          actorId,
          type: "gear",
        });
      }

      await closeDocSheet(game, { collection: "actors", id: actorId });
      sheetId = await reopenActorSheetViaUI(game, actorId);
      const sheet = game.locator(`#${sheetId}`);
      const scroller = sheet.locator(".right-content");
      const lastItem = sheet.locator(`[data-item-id="${lastItemId}"]`).first();
      await expect(lastItem).toBeVisible();
      await expect
        .poll(() =>
          scroller.evaluate(
            (element) => element.scrollHeight - element.clientHeight,
          ),
        )
        .toBeGreaterThan(0);

      const scrollTop = await scrollToBottomViaWheel(game, scroller);
      await expect(lastItem).toBeInViewport();
      expect(scrollTop).toBeGreaterThan(0);
    });

    await test.step("renaming the container preserves the inventory position", async () => {
      const sheet = game.locator(`#${sheetId}`);
      const scroller = sheet.locator(".right-content");
      const lastItem = sheet.locator(`[data-item-id="${lastItemId}"]`).first();
      const scrollTop = await scrollToBottomViaWheel(game, scroller);
      const name = uniqueName("scroll-container-renamed");
      const input = sheet.locator('input[name="name"]');
      const priorPart = await sheet
        .locator('[data-application-part="form"]')
        .elementHandle();

      await input.fill(name);
      await input.blur();
      await waitForSheetReplacement(game, priorPart);
      await game.waitForFunction(
        ({ actorId, name }) => game.actors.get(actorId).name === name,
        { actorId, name },
      );
      await expectScrollPosition(scroller, scrollTop);
      await expect(lastItem).toBeInViewport();

      await closeDocSheet(game, { collection: "actors", id: actorId });
      sheetId = await reopenActorSheetViaUI(game, actorId);
      await expect(game.locator(`#${sheetId} input[name="name"]`)).toHaveValue(
        name,
      );
      await expect(
        game.locator(`#${sheetId} [data-item-id="${lastItemId}"]`).first(),
      ).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});

const NOTES_SURFACES = [
  {
    type: "mook",
    field: "system.information.notes",
    input: "system.derivedStats.hp.value",
  },
  { type: "demon", field: "system.notes", input: "system.stats.rez.value" },
  { type: "blackIce", field: "system.notes", input: "system.stats.rez.value" },
  {
    type: "character",
    field: "system.information.notes",
    input: "system.derivedStats.hp.value",
    tab: '.navtabs-bottom [data-tab="lifepath"]',
    otherTab: '.navtabs-bottom [data-tab="role"]',
  },
  {
    type: "gear",
    field: "system.description.value",
    input: "name",
    collection: "items",
    tab: '.navtabs-item [data-tab="item-description"]',
    otherTab: '.navtabs-item [data-tab="item-settings"]',
  },
  {
    type: "character",
    label: "character with mook sheet",
    sheetClass: "CPRMookActorSheet",
    field: "system.information.notes",
    input: "system.derivedStats.hp.value",
  },
];

async function scrollNotesViaWheel(page, scroller) {
  await scroller.hover();
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return scroller.evaluate((el) => el.scrollTop);
}

for (const surface of NOTES_SURFACES) {
  test(`${surface.label ?? surface.type} notes retain scrolling through edits and saves`, async ({
    page,
  }) => {
    const collection = surface.collection ?? "actors";
    const id = await createDocumentViaUI(page, {
      documentTab: collection,
      type: surface.type,
      name: uniqueName(`scroll-notes-${surface.type}`),
    });
    let sheetId = await expectSheetRendered(page, { collection, id });
    if (surface.sheetClass) {
      sheetId = await changeActorSheetViaUI(page, {
        sheetId,
        actorId: id,
        sheetClass: surface.sheetClass,
      });
    }
    const sheet = page.locator(`#${sheetId}`);
    const notes = sheet.locator(`prose-mirror[name="${surface.field}"]`);
    const content = notes.locator(".editor-content");
    const text = Array.from(
      { length: 50 },
      (_, i) => `Notes paragraph ${i + 1}: a detail to keep in view.`,
    ).join("\n");

    async function activateTab() {
      if (surface.tab) await sheet.locator(surface.tab).click();
    }
    async function reopen() {
      await closeDocSheet(page, { collection, id });
      if (collection === "actors") await reopenActorSheetViaUI(page, id);
      else await reopenItemSheetViaUI(page, id);
      await activateTab();
    }
    async function save() {
      const priorPart = await sheet
        .locator('[data-application-part="form"]')
        .elementHandle();
      await saveNotesEditorViaUI(notes);
      await waitForSheetReplacement(page, priorPart);
    }

    if (surface.type === "character" && !surface.sheetClass) {
      await test.step("lifepath text still renders after saving and reopening", async () => {
        await activateTab();
        await sheet.locator(".set-lifepath").click();
        const dialog = page.locator(".application.cpr-dialog").filter({
          has: page.locator('textarea[name="culturalOrigin"]'),
        });
        const origin = "Grew up around Night City's docks.";
        await dialog.locator('textarea[name="culturalOrigin"]').fill(origin);
        const priorPart = await sheet
          .locator('[data-application-part="form"]')
          .elementHandle();
        await dialog.locator('[data-action="confirm"]').click();
        await waitForSheetReplacement(page, priorPart);
        const culturalOrigin = sheet.locator(
          ".cultural-origins .lifepath-value",
        );
        await expect(culturalOrigin).toHaveText(origin);
        await reopen();
        await expect(culturalOrigin).toHaveText(origin);
      });
    }

    await test.step("long notes are saved and still present after reopening", async () => {
      await activateTab();
      await openNotesEditorViaUI(sheet, surface.field);
      await content.fill(text);
      await save();
      await reopen();
      await expect(content).toContainText("Notes paragraph 50");
    });

    if (collection === "actors")
      await test.step("editing another field preserves the notes reading position", async () => {
        const top = await scrollNotesViaWheel(page, content);
        const input = sheet.locator(`input[name="${surface.input}"]`);
        const value =
          surface.input === "name"
            ? uniqueName("scroll-renamed")
            : String(Number(await input.inputValue()) - 1);
        const priorPart = await sheet
          .locator('[data-application-part="form"]')
          .elementHandle();
        await input.fill(value);
        await input.blur();
        await waitForSheetReplacement(page, priorPart);
        await expect.soft
          .poll(() => content.evaluate((el) => el.scrollTop))
          .toBe(top);
        await reopen();
        await expect(input).toHaveValue(value);
        await expect(content).toContainText("Notes paragraph 50");
      });

    await test.step("opening and saving the editor preserves scrolling", async () => {
      const readingTop = await scrollNotesViaWheel(page, content);
      await openNotesEditorViaUI(sheet, surface.field);
      await expect.soft
        .poll(() => content.evaluate((el) => el.scrollTop))
        .toBe(readingTop);
      await content.fill(`${text}\nAdditional note.`);
      await setScrollPosition(content, 0);
      const editingTop = await scrollNotesViaWheel(page, content);
      await save();
      await expect.soft
        .poll(() => content.evaluate((el) => el.scrollTop))
        .toBe(editingTop);
      await reopen();
      await expect(content).toContainText("Additional note.");
    });

    await test.step("saving unchanged notes preserves scrolling without a rerender", async () => {
      await openNotesEditorViaUI(sheet, surface.field);
      const top = await scrollNotesViaWheel(page, content);
      await saveNotesEditorViaUI(notes);
      await expect(notes).toHaveClass(/inactive/);
      await expect.soft
        .poll(() => content.evaluate((el) => el.scrollTop))
        .toBe(top);
      await reopen();
      await expect(content).toContainText("Additional note.");
    });

    if (surface.otherTab) {
      await test.step("notes survive an update while their tab is hidden", async () => {
        const top = await scrollNotesViaWheel(page, content);
        await sheet.locator(surface.otherTab).click();
        await expect(content).toBeHidden();
        const input = sheet.locator(`input[name="${surface.input}"]`);
        const value =
          surface.input === "name"
            ? uniqueName("hidden-tab-edit")
            : String(Number(await input.inputValue()) - 1);
        const priorPart = await sheet
          .locator('[data-application-part="form"]')
          .elementHandle();
        await input.fill(value);
        await input.blur();
        await waitForSheetReplacement(page, priorPart);
        await activateTab();
        await expect.soft
          .poll(() => content.evaluate((el) => el.scrollTop))
          .toBe(top);
        await reopen();
        await expect(input).toHaveValue(value);
      });
    }

    await test.step("shortening notes leaves the remaining content reachable", async () => {
      await scrollNotesViaWheel(page, content);
      await openNotesEditorViaUI(sheet, surface.field);
      await content.fill("Short notes.");
      await save();
      await expect(content).toContainText("Short notes.");
      await expectScrollPosition(content, 0);
      await reopen();
      await expect(content).toHaveText("Short notes.");
    });

    await test.step("growing short notes preserves the new editing position", async () => {
      await openNotesEditorViaUI(sheet, surface.field);
      await content.fill(text);
      await setScrollPosition(content, 0);
      const top = await scrollNotesViaWheel(page, content);
      await save();
      await expect.soft
        .poll(() => content.evaluate((el) => el.scrollTop))
        .toBe(top);
      await reopen();
      await expect(content).toContainText("Notes paragraph 50");
    });

    if (surface.type === "gear") {
      await test.step("resizing and then updating keeps notes in view", async () => {
        const oldBounds = await sheet.boundingBox();
        await resizeSheetViaUI(page, sheet, {
          width: oldBounds.width + 100,
          height: oldBounds.height + 80,
        });
        await expect
          .poll(async () => (await sheet.boundingBox()).height)
          .toBeGreaterThan(oldBounds.height);
        const top = await scrollNotesViaWheel(page, content);
        const priorPart = await sheet
          .locator('[data-application-part="form"]')
          .elementHandle();
        const newName = uniqueName("resized-notes");
        await sheet.locator(surface.otherTab).click();
        await sheet.locator('input[name="name"]').fill(newName);
        await sheet.locator('input[name="name"]').blur();
        await waitForSheetReplacement(page, priorPart);
        await activateTab();
        await expect.soft
          .poll(() => content.evaluate((el) => el.scrollTop))
          .toBe(top);
        await reopen();
        await expect(sheet.locator('input[name="name"]')).toHaveValue(newName);
      });
    }

    await test.step("clearing notes leaves an empty editable field after reopening", async () => {
      await openNotesEditorViaUI(sheet, surface.field);
      await content.fill("");
      await save();
      await expectScrollPosition(content, 0);
      await reopen();
      await expect(content).toHaveText("");
      await notes.hover();
      await expect(notes.locator("button.toggle")).toBeEnabled();
    });

    await closeDocSheet(page, { collection, id });
  });
}
