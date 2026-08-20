import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

/*
 * Homebrew (JonJon's) Luck Roll — issue #695.
 *
 * When the "Enable Luck Roll" homebrew setting is on, clicking the LUCK stat
 * performs a roll-under check (1d10 under the LUCK target, like a Death Save)
 * and posts a Success/Failure chat card, instead of the standard stat roll. The
 * target is the LUCK max or current value depending on the variant setting. When
 * the setting is off, clicking LUCK does the normal stat roll.
 *
 * Driven through the real UI: the LUCK stat is clicked on the character sheet.
 * The roll outcome is random, so rather than assert a fixed result we assert the
 * invariant the rule defines — success iff the d10 rolled strictly under the
 * target, and a natural 10 always fails — across several rolls. The setting is a
 * world setting set as a precondition; the behaviour under test is the click and
 * the resulting roll/card. LUCK clicks are Ctrl-clicked to skip the verify
 * dialog (the system treats Ctrl as "skip dialog" by default).
 */

const SYSTEM_ID = "cyberpunk-red-core";
const LUCK_ROLLABLE =
  'a.rollable[data-roll-type="stat"][data-roll-title="luck"]';

async function setLuckRollSetting(page, { enabled, variant }) {
  await page.evaluate(
    async ({ id, enabled, variant }) => {
      await game.settings.set(id, "homebrewLuckRoll", enabled);
      if (variant) {
        await game.settings.set(id, "homebrewLuckRollVariant", variant);
      }
    },
    { id: SYSTEM_ID, enabled, variant },
  );
}

async function restoreLuckRollDefaults(page) {
  return page.evaluate(
    async ({ id }) => {
      const results = await Promise.allSettled([
        game.settings.set(id, "homebrewLuckRoll", false),
        game.settings.set(id, "homebrewLuckRollVariant", "max"),
      ]);

      return results
        .map((result, index) => {
          if (result.status === "fulfilled") {
            return null;
          }

          const setting =
            index === 0 ? "homebrewLuckRoll" : "homebrewLuckRollVariant";
          return `${setting}: ${result.reason?.message ?? String(result.reason)}`;
        })
        .filter(Boolean);
    },
    { id: SYSTEM_ID },
  );
}

function formatCleanupError(error) {
  return error?.message ?? String(error);
}

async function attemptRestoreLuckRollDefaults(page, label) {
  try {
    const failures = await restoreLuckRollDefaults(page);
    return {
      label,
      failures,
    };
  } catch (error) {
    return {
      label,
      failures: [formatCleanupError(error)],
    };
  }
}

// Ctrl-click the LUCK stat (skipping the verify dialog), wait for the new chat
// message, and read back what kind of roll it was and the rendered result.
async function rollLuck(page, sheetId) {
  const before = await page.evaluate(() => game.messages.size);
  // macOS Chromium treats Ctrl+click as a right-click (context menu) and never
  // dispatches `click`, so use Cmd there. The roll handler accepts both
  // (`event.ctrlKey || event.metaKey`).
  const modifier = process.platform === "darwin" ? ["Meta"] : ["Control"];
  await page
    .locator(`#${sheetId} ${LUCK_ROLLABLE}`)
    .click({ modifiers: modifier });
  await page.waitForFunction((n) => game.messages.size > n, before, {
    timeout: 10000,
  });
  return page.evaluate(() => {
    const message = game.messages.contents.at(-1);
    const content = message.content;
    const die = Number((content.match(/d10_(\d+)/) || [])[1]);
    const result = content.includes("roll-success")
      ? "success"
      : content.includes("roll-failure")
        ? "failure"
        : "none";
    return {
      rollClass: message.rolls?.[0]?.constructor?.name ?? null,
      die,
      result,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("Homebrew Luck Roll", () => {
  test.afterEach(async ({ page: game }, testInfo) => {
    // Restore defaults so the world setting never leaks between tests.
    const cleanupDiagnostics = [];
    const initialAttempt = await attemptRestoreLuckRollDefaults(
      game,
      "initial restore",
    );
    if (initialAttempt.failures.length === 0) {
      return;
    }

    cleanupDiagnostics.push(
      `${initialAttempt.label}: ${initialAttempt.failures.join("; ")}`,
    );

    try {
      await gotoReadyWorld(game);
      cleanupDiagnostics.push(
        "recovery: reloaded the world before retrying cleanup",
      );
    } catch (error) {
      cleanupDiagnostics.push(`recovery failed: ${formatCleanupError(error)}`);
    }

    const retryAttempt = await attemptRestoreLuckRollDefaults(
      game,
      "retry restore",
    );
    cleanupDiagnostics.push(
      retryAttempt.failures.length === 0
        ? `${retryAttempt.label}: restored defaults after recovery`
        : `${retryAttempt.label}: ${retryAttempt.failures.join("; ")}`,
    );

    await testInfo.attach("luck-roll-cleanup", {
      body: `${cleanupDiagnostics.join("\n")}\nTest status at cleanup: ${testInfo.status}`,
      contentType: "text/plain",
    });

    if (retryAttempt.failures.length === 0) {
      return;
    }

    const message = `Failed to restore Luck Roll defaults after retry: ${retryAttempt.failures.join("; ")}`;
    if (testInfo.errors.length > 0) {
      console.warn(`${message}\n${cleanupDiagnostics.join("\n")}`);
      return;
    }

    throw new Error(`${message}\n${cleanupDiagnostics.join("\n")}`);
  });

  test("clicking LUCK rolls a roll-under Luck Roll when enabled", async ({
    page: game,
  }) => {
    await setLuckRollSetting(game, { enabled: true, variant: "max" });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const target = await game.evaluate(
      (id) => game.actors.get(id).system.stats.luck.max,
      actorId,
    );

    for (let i = 0; i < 6; i += 1) {
      const { rollClass, die, result } = await rollLuck(game, sheetId);
      expect(rollClass).toBe("CPRLuckRoll");
      // Strictly-under, natural-10-always-fails (mirrors the Death Save).
      const expected = die !== 10 && die < target ? "success" : "failure";
      expect(
        result,
        `die ${die} vs target ${target} should be ${expected}`,
      ).toBe(expected);
    }

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("the variant setting selects which LUCK value to roll under", async ({
    page: game,
  }) => {
    await setLuckRollSetting(game, { enabled: true, variant: "max" });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    // Give the LUCK pool a current value distinct from its max so the two
    // variants resolve to different targets.
    await game.evaluate(
      (id) =>
        game.actors.get(id).update({
          "system.stats.luck.max": 8,
          "system.stats.luck.value": 2,
        }),
      actorId,
    );

    const dialog = game
      .locator(".application")
      .filter({ hasText: "LUCK to beat" });
    const targetText = () => dialog.locator(".dialog-item").first();

    // Max variant → target is the LUCK max (8).
    await game.locator(`#${sheetId} ${LUCK_ROLLABLE}`).click();
    await expect(dialog).toBeVisible();
    await expect(targetText()).toContainText("8");
    // Core Situational Modifiers must not be offered: LUCK is a roll-under check
    // (like the Death Save), so a negative modifier would perversely help. The
    // dialog must not show the Core Situational Modifiers control.
    await expect(dialog).not.toContainText("Core Situational Modifiers");
    await dialog.locator('button[data-action="cancel"]').click();
    await expect(dialog).toHaveCount(0);

    // Current variant → target is the current LUCK value (2).
    await setLuckRollSetting(game, { enabled: true, variant: "current" });
    await game.locator(`#${sheetId} ${LUCK_ROLLABLE}`).click();
    await expect(dialog).toBeVisible();
    await expect(targetText()).toContainText("2");
    await dialog.locator('button[data-action="cancel"]').click();
    await expect(dialog).toHaveCount(0);

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("clicking LUCK rolls a normal stat roll when disabled", async ({
    page: game,
  }) => {
    await setLuckRollSetting(game, { enabled: false, variant: "max" });

    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const sheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const { rollClass } = await rollLuck(game, sheetId);
    expect(rollClass).toBe("CPRStatRoll");

    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
