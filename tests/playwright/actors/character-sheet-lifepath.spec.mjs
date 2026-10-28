import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import {
  closeAndReopenActorSheet,
  closeDocSheet,
  openProseMirrorEditor,
  saveProseMirror,
  setProseMirrorText,
  uniqueName,
  waitForActorFields,
  waitForProseMirrorValue,
} from "../../../tools/playwright/ui/index.mjs";
import {
  createCharacterViaUI,
  lifepathDialog,
  lifepathValue,
  openLifepathTab,
} from "./character-sheet-helpers.mjs";

installConsoleErrorHarness();

/*
 * Character lifepath tab: the 17 `.lifepath-value` sections render their
 * `system.lifepath.*` fields through `TextEditor.enrichHTML`, and the wrench
 * glyph opens the "Set Lifepath" dialog (17 named textareas) that saves them
 * back. Foundry v13's enrichHTML does not convert markdown, so saved values
 * render verbatim; the player-notes ProseMirror pane binds
 * `system.information.notes`.
 */

const NOTES_PANE = ".lifepath-tab-grid .note-pad prose-mirror";
const NOTES_FIELD_PATH = "system.information.notes";

const SECTIONS = [
  "cultural-origins",
  "languages",
  "personality",
  "clothing-style",
  "hairstyle",
  "affectations",
  "value-most",
  "people-feelings",
  "valued-person",
  "valued-possession",
  "family-background",
  "child-environment",
  "family-crisis",
  "friends",
  "enemies",
  "lovers",
  "life-goals",
];

const DIALOG_FIELDS = [
  "culturalOrigin",
  "languages",
  "personality",
  "clothingStyle",
  "hairStyle",
  "affectations",
  "valueMost",
  "aboutPeople",
  "valuedPerson",
  "valuedPossession",
  "familyBackground",
  "childhoodEnvironment",
  "familyCrisis",
  "friends",
  "enemies",
  "tragicLoveAffairs",
  "lifeGoals",
];

test.describe("Character sheet — lifepath", () => {
  test("a fresh character shows an empty lifepath and a player-notes editor", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(game);

    await test.step("all 17 sections render with empty values", async () => {
      const content = await openLifepathTab(game, sheetId);
      for (const section of SECTIONS) {
        await expect(lifepathValue(content, section), section).toHaveText("");
      }
    });

    await test.step("the player-notes ProseMirror pane is present", async () => {
      const pane = game.locator(`#${sheetId} ${NOTES_PANE}`);
      await expect(pane).toBeVisible();
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the set-lifepath dialog opens and canceling leaves the lifepath empty", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(game);
    const content = await openLifepathTab(game, sheetId);

    await test.step("the wrench glyph opens the dialog with all 17 fields", async () => {
      await content.locator("a.set-lifepath").click();
      const dialog = lifepathDialog(game);
      await expect(dialog).toBeVisible();
      for (const field of DIALOG_FIELDS) {
        await expect(
          dialog.locator(`textarea[name="${field}"]`),
          field,
        ).toHaveCount(1);
      }
    });

    await test.step("typing a value and canceling saves nothing", async () => {
      const dialog = lifepathDialog(game);
      await dialog.locator('textarea[name="culturalOrigin"]').fill("not saved");
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0);

      const newSheetId = await closeAndReopenActorSheet(game, actorId);
      const reopened = await openLifepathTab(game, newSheetId);
      await expect(lifepathValue(reopened, "cultural-origins")).toHaveText("");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("saving lifepath values persists them and renders on the tab", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(game);
    const content = await openLifepathTab(game, sheetId);

    const culturalOrigin = "Raised in the Arasaka towers";
    const personality = "Cold and calculating";
    const lifeGoals = "Buy a fast car";

    await test.step("filling three fields and saving persists them", async () => {
      await content.locator("a.set-lifepath").click();
      const dialog = lifepathDialog(game);
      await expect(dialog).toBeVisible();
      await dialog
        .locator('textarea[name="culturalOrigin"]')
        .fill(culturalOrigin);
      await dialog.locator('textarea[name="personality"]').fill(personality);
      await dialog.locator('textarea[name="lifeGoals"]').fill(lifeGoals);
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0);

      await waitForActorFields(game, actorId, {
        "system.lifepath.culturalOrigin": culturalOrigin,
        "system.lifepath.personality": personality,
        "system.lifepath.lifeGoals": lifeGoals,
      });
    });

    await test.step("the tab renders the saved values verbatim after close/reopen", async () => {
      const newSheetId = await closeAndReopenActorSheet(game, actorId);
      const reopened = await openLifepathTab(game, newSheetId);
      await expect(lifepathValue(reopened, "cultural-origins")).toHaveText(
        culturalOrigin,
      );
      await expect(lifepathValue(reopened, "personality")).toHaveText(
        personality,
      );
      await expect(lifepathValue(reopened, "life-goals")).toHaveText(lifeGoals);
      await expect(lifepathValue(reopened, "languages")).toHaveText("");
      await expect(lifepathValue(reopened, "enemies")).toHaveText("");
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the set-lifepath dialog prefills previously saved values", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(game);
    const content = await openLifepathTab(game, sheetId);

    const culturalOrigin = "Born in a corpo penthouse";
    const lifeGoals = "Retire to the badlands";

    await test.step("saving two values persists them", async () => {
      await content.locator("a.set-lifepath").click();
      const dialog = lifepathDialog(game);
      await expect(dialog).toBeVisible();
      await dialog
        .locator('textarea[name="culturalOrigin"]')
        .fill(culturalOrigin);
      await dialog.locator('textarea[name="lifeGoals"]').fill(lifeGoals);
      await dialog
        .locator('button.cpr-dialog-button[data-action="confirm"]')
        .click();
      await expect(dialog).toHaveCount(0);

      await waitForActorFields(game, actorId, {
        "system.lifepath.culturalOrigin": culturalOrigin,
        "system.lifepath.lifeGoals": lifeGoals,
      });
    });

    await test.step("reopening the dialog prefills the saved values", async () => {
      const newSheetId = await closeAndReopenActorSheet(game, actorId);
      const reopened = await openLifepathTab(game, newSheetId);
      await reopened.locator("a.set-lifepath").click();
      const dialog = lifepathDialog(game);
      await expect(dialog).toBeVisible();
      await expect(
        dialog.locator('textarea[name="culturalOrigin"]'),
      ).toHaveValue(culturalOrigin);
      await expect(dialog.locator('textarea[name="lifeGoals"]')).toHaveValue(
        lifeGoals,
      );
      await expect(dialog.locator('textarea[name="languages"]')).toHaveValue(
        "",
      );
    });

    await test.step("canceling the prefilled dialog leaves the values intact", async () => {
      const dialog = lifepathDialog(game);
      await dialog
        .locator('button.cpr-dialog-button[data-action="cancel"]')
        .click();
      await expect(dialog).toHaveCount(0);

      const newSheetId = await closeAndReopenActorSheet(game, actorId);
      const reopened = await openLifepathTab(game, newSheetId);
      await expect(lifepathValue(reopened, "cultural-origins")).toHaveText(
        culturalOrigin,
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the player notes save and persist after close/reopen", async ({
    page: game,
  }) => {
    const { actorId, sheetId } = await createCharacterViaUI(game);
    await openLifepathTab(game, sheetId);

    await test.step("the notes pane renders empty and its edit toggle appears on hover", async () => {
      const pane = game.locator(`#${sheetId} ${NOTES_PANE}`);
      await expect(pane).toBeVisible();
      const toggle = pane.locator("button.icon.toggle");
      await expect(toggle).toBeHidden();
      await pane.hover();
      await expect(toggle).toBeVisible();
    });

    await test.step("editing the notes saves and persists after close/reopen", async () => {
      const noteText = uniqueName("lifepath-notes");
      await openProseMirrorEditor(game, sheetId, NOTES_PANE);
      await setProseMirrorText(game, sheetId, noteText, NOTES_PANE);
      await saveProseMirror(game, sheetId, NOTES_PANE);

      await waitForProseMirrorValue(game, {
        collection: "actors",
        id: actorId,
        fieldPath: NOTES_FIELD_PATH,
        text: noteText,
      });

      const pane = game.locator(`#${sheetId} ${NOTES_PANE}`);
      await expect(pane).toContainText(noteText);

      const newSheetId = await closeAndReopenActorSheet(game, actorId);
      await openLifepathTab(game, newSheetId);
      await expect(game.locator(`#${newSheetId} ${NOTES_PANE}`)).toContainText(
        noteText,
      );
    });

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
