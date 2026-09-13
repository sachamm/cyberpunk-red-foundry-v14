import { test, expect } from "@playwright/test";
import {
  gotoReadyWorld,
  openPlayerPage,
} from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createActorViaUI,
  expectSheetRendered,
  openNotesEditorViaUI,
  reopenActorSheetViaUI,
  saveNotesEditorViaUI,
  uniqueName,
  waitForSheetReplacement,
} from "../../../tools/playwright/ui/index.mjs";

const FIELD = "system.information.notes";

async function createMookWithNotes(page) {
  const id = await createActorViaUI(page, {
    type: "mook",
    name: uniqueName("scroll-mook"),
  });
  const sheetId = await expectSheetRendered(page, { collection: "actors", id });
  const sheet = page.locator(`#${sheetId}`);
  const editor = await openNotesEditorViaUI(sheet, FIELD);
  await editor
    .locator('.editor-content[contenteditable="true"]')
    .fill(
      Array.from(
        { length: 40 },
        (_, i) => `Mook note ${i + 1}: remember this detail.`,
      ).join("\n"),
    );
  const priorPart = await sheet
    .locator('[data-application-part="form"]')
    .elementHandle();
  await saveNotesEditorViaUI(editor);
  await waitForSheetReplacement(page, priorPart);
  await closeDocSheet(page, { collection: "actors", id });
  await reopenActorSheetViaUI(page, id);
  await expect(editor.locator(".editor-content")).toContainText("Mook note 40");
  return { id, sheetId, sheet, content: editor.locator(".editor-content") };
}

async function scrollNotes(page, content, delta) {
  await content.hover();
  await page.mouse.wheel(0, delta);
  await expect
    .poll(() => content.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return content.evaluate((element) => element.scrollTop);
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("mook notes keep separate scroll positions in two open sheets", async ({
  page,
}) => {
  const first = await createMookWithNotes(page);
  const firstTop = await scrollNotes(page, first.content, 180);
  const second = await createMookWithNotes(page);
  const secondTop = await scrollNotes(page, second.content, 360);
  expect(secondTop).not.toBe(firstTop);

  await test.step("updating the front sheet does not move the other sheet's notes", async () => {
    const input = second.sheet.locator(
      'input[name="system.derivedStats.hp.value"]',
    );
    const value = String(Number(await input.inputValue()) - 1);
    const priorPart = await second.sheet
      .locator('[data-application-part="form"]')
      .elementHandle();
    await input.fill(value);
    await input.blur();
    await waitForSheetReplacement(page, priorPart);
    await expect.soft
      .poll(() => second.content.evaluate((el) => el.scrollTop))
      .toBe(secondTop);
    await expect.soft
      .poll(() => first.content.evaluate((el) => el.scrollTop))
      .toBe(firstTop);
    await closeDocSheet(page, { collection: "actors", id: second.id });
    await reopenActorSheetViaUI(page, second.id);
    await expect(input).toHaveValue(value);
  });

  await closeDocSheet(page, { collection: "actors", id: second.id });
  await closeDocSheet(page, { collection: "actors", id: first.id });
});

async function setPlayerOwnership(page, actorId, ownership) {
  await page.evaluate(
    async ({ id, level }) => {
      const player = game.users.getName("E2E Player");
      await game.actors.get(id).update({
        ownership: {
          default: 0,
          [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS[level],
        },
      });
    },
    { id: actorId, level: ownership },
  );
}

async function openMookAsPlayer(player, actorId) {
  const sheetId = await reopenActorSheetViaUI(player, actorId);
  return player.locator(`#${sheetId}`);
}

async function reopenMookAsPlayer(player, actorId, previousSheet) {
  await closeDocSheet(player, { collection: "actors", id: actorId });
  await expect(previousSheet).toHaveCount(0);
  return openMookAsPlayer(player, actorId);
}

async function expectEditing(notes, editable) {
  await notes.hover();
  const toggle = notes.locator("button.toggle");
  if (editable) await expect(toggle).toBeEnabled();
  else await expect(toggle).toBeDisabled();
}

for (const { ownership, editable } of [
  { ownership: "OWNER", editable: true },
  { ownership: "OBSERVER", editable: false },
]) {
  test(`an ${ownership.toLowerCase()} player keeps mook notes scrolled when the GM updates the actor`, async ({
    page,
    browser,
    baseURL,
  }) => {
    const actor = await createMookWithNotes(page);
    await setPlayerOwnership(page, actor.id, ownership);
    const { context, page: player } = await openPlayerPage(browser, baseURL);
    const errors = [];
    player.on("pageerror", (error) => errors.push(error.message));
    try {
      let playerSheet = await openMookAsPlayer(player, actor.id);
      let notes = playerSheet.locator(`prose-mirror[name="${FIELD}"]`);
      let content = notes.locator(".editor-content");
      await expect(playerSheet.locator(".mook-sheet")).toBeVisible();
      await expect(content).toContainText("Mook note 40");
      await expect(notes).toBeVisible();
      await expect
        .poll(() => content.evaluate((element) => element.clientWidth))
        .toBeGreaterThan(0);
      await expect
        .poll(() => content.evaluate((element) => element.clientHeight))
        .toBeGreaterThan(0);
      await expectEditing(notes, editable);
      const top = await scrollNotes(player, content, 240);

      await test.step("a remote update preserves position and editing permission", async () => {
        const playerPart = await playerSheet
          .locator('[data-application-part="form"]')
          .elementHandle();
        const gmPart = await actor.sheet
          .locator('[data-application-part="form"]')
          .elementHandle();
        const input = actor.sheet.locator(
          'input[name="system.derivedStats.hp.value"]',
        );
        const value = String(Number(await input.inputValue()) - 1);
        await input.fill(value);
        await input.blur();
        await waitForSheetReplacement(page, gmPart);
        await waitForSheetReplacement(player, playerPart);
        await expect.soft
          .poll(() => content.evaluate((el) => el.scrollTop))
          .toBe(top);
        await expectEditing(notes, editable);
        await closeDocSheet(page, { collection: "actors", id: actor.id });
        await reopenActorSheetViaUI(page, actor.id);
        await expect(input).toHaveValue(value);
        playerSheet = await reopenMookAsPlayer(player, actor.id, playerSheet);
        notes = playerSheet.locator(`prose-mirror[name="${FIELD}"]`);
        content = notes.locator(".editor-content");
        await expect(content).toContainText("Mook note 40");
        await expectEditing(notes, editable);
        expect(errors).toEqual([]);
      });
    } finally {
      await context.close();
      await closeDocSheet(page, { collection: "actors", id: actor.id });
    }
  });
}

test("limited permission does not display mook notes", async ({
  page,
  browser,
  baseURL,
}) => {
  const actor = await createMookWithNotes(page);
  await setPlayerOwnership(page, actor.id, "LIMITED");
  const { context, page: player } = await openPlayerPage(browser, baseURL);
  const errors = [];
  player.on("pageerror", (error) => errors.push(error.message));
  try {
    let playerSheet = await openMookAsPlayer(player, actor.id);
    let notes = playerSheet.locator(`prose-mirror[name="${FIELD}"]`);
    let content = notes.locator(".editor-content");
    await expect(playerSheet.locator(".mook-sheet-limited")).toBeVisible();
    await expect(notes).toBeHidden();
    await expect
      .poll(() => content.evaluate((element) => element.clientWidth))
      .toBeLessThan(20);

    await test.step("a remote update does not display notes", async () => {
      const playerPart = await playerSheet
        .locator('[data-application-part="form"]')
        .elementHandle();
      const gmPart = await actor.sheet
        .locator('[data-application-part="form"]')
        .elementHandle();
      const input = actor.sheet.locator(
        'input[name="system.derivedStats.hp.value"]',
      );
      const value = String(Number(await input.inputValue()) - 1);
      await input.fill(value);
      await input.blur();
      await waitForSheetReplacement(page, gmPart);
      await waitForSheetReplacement(player, playerPart);
      await expect(notes).toBeHidden();
      await expect
        .poll(() => content.evaluate((element) => element.clientWidth))
        .toBeLessThan(20);
      await closeDocSheet(page, { collection: "actors", id: actor.id });
      await reopenActorSheetViaUI(page, actor.id);
      await expect(input).toHaveValue(value);
      playerSheet = await reopenMookAsPlayer(player, actor.id, playerSheet);
      notes = playerSheet.locator(`prose-mirror[name="${FIELD}"]`);
      content = notes.locator(".editor-content");
      await expect(notes).toBeHidden();
      await expect
        .poll(() => content.evaluate((element) => element.clientWidth))
        .toBeLessThan(20);
      expect(errors).toEqual([]);
    });
  } finally {
    await context.close();
    await closeDocSheet(page, { collection: "actors", id: actor.id });
  }
});
