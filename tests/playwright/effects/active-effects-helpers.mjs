import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

/**
 * Register the console-error harness shared by all active effect specs.
 * beforeEach navigates to the ready world and collects console errors;
 * afterEach fails the test on any uncaught exception or console error not
 * registered as expected via page.expectedConsoleErrors.
 */
export function installConsoleErrorHarness() {
  test.beforeEach(async ({ page }) => {
    page.consoleErrors = [];
    // Tests that intentionally trigger a console error (e.g. via
    // DisplayMessage("error")) register a matching RegExp here so afterEach
    // ignores exactly those messages. Uncaught exceptions always fail.
    page.expectedConsoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") page.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      page.consoleErrors.push(`uncaught exception: ${err.message}`);
    });
    await gotoReadyWorld(page);
  });

  test.afterEach(async ({ page }) => {
    const unexpected = page.consoleErrors.filter(
      (text) =>
        text.startsWith("uncaught exception:") ||
        !page.expectedConsoleErrors.some((re) => re.test(text)),
    );
    expect(
      unexpected,
      `console errors during test:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });
}
