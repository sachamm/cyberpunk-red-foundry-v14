import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createActorViaUI,
  deleteActorViaUI,
  dismissNotifications,
  openSidebarTab,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

const soft = expect.configure({ soft: true });
const ACTION_TIMEOUT = 15000;
test.use({
  viewport: { width: 1280, height: 800 },
  // Keep the CSS viewport while quartering the software canvas's pixel count.
  deviceScaleFactor: 0.5,
  actionTimeout: ACTION_TIMEOUT,
});

async function createTokenViaUI(page, { actorId, name }) {
  await openSidebarTab(page, "scenes");
  await page.locator("#scenes button.create-entry").click();
  const dialog = page.locator(".application.dialog");
  await dialog.locator('input[name="name"]').fill(name);
  await dismissNotifications(page);
  await dialog.locator('button[data-action="ok"]').click();
  await expect(dialog).toHaveCount(0);
  await page
    .locator('.scene-config .window-header [data-action="close"]')
    .click();
  // Foundry may activate a newly created scene automatically.
  if (!(await page.evaluate((n) => game.scenes.getName(n).active, name))) {
    const entry = page
      .locator("#scenes .directory-item")
      .filter({ hasText: name });
    await entry.click({ button: "right" });
    await page
      .locator("#context-menu .context-item")
      .filter({ hasText: "Activate" })
      .click();
  }
  await page.evaluate(() => game.settings.set("core", "noCanvas", false));
  await page.reload();
  await gotoReadyWorld(page);
  // Keep the real canvas enabled, but avoid software-WebGL rendering load in
  // this DOM-color test. Performance mode requires a reload to style the UI.
  await page.evaluate(async () => {
    await game.settings.set("core", "maxFPS", 10);
    await game.settings.set(
      "core",
      "performanceMode",
      CONST.CANVAS_PERFORMANCE_MODES.LOW,
    );
  });
  await page.reload();
  await gotoReadyWorld(page);
  await expect(page.locator("body")).toHaveClass(/performance-low/);
  await dismissNotifications(page);
  await page.waitForFunction(
    (sceneName) => canvas.ready && canvas.scene?.name === sceneName,
    name,
  );
  await expect(page.locator("#board")).toHaveAttribute("width", "640");
  await expect(page.locator("#board")).toHaveAttribute("height", "400");
  await openSidebarTab(page, "actors");
  await page
    .locator(`#actors [data-entry-id="${actorId}"]`)
    .dragTo(page.locator("#board"), { targetPosition: { x: 600, y: 400 } });
  await page.waitForFunction(
    (id) => canvas.tokens.placeables.some((token) => token.actor?.id === id),
    actorId,
  );
}

async function reopenHud(page, actorId) {
  await page.waitForFunction((id) => {
    const token = canvas.tokens.placeables.find(
      (entry) => entry.actor?.id === id,
    );
    return canvas.ready && token?.visible && token.renderable;
  }, actorId);
  const point = await page.evaluate(async (id) => {
    await canvas.tokens.hud.close();
    const token = canvas.tokens.placeables.find(
      (entry) => entry.actor?.id === id,
    );
    return canvas.clientCoordinatesFromCanvas(token.center);
  }, actorId);
  await expect(page.locator("#token-hud")).not.toBeVisible();
  await page.mouse.move(100, 500);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(
    (id) =>
      canvas.tokens.placeables.find((entry) => entry.actor?.id === id)?.hover,
    actorId,
    { timeout: ACTION_TIMEOUT },
  );
  // Separate right-click gestures past Foundry's 250ms double-click window.
  await page.mouse.click(point.x, point.y, { button: "right", delay: 300 });
  await expect(page.locator("#token-hud")).toBeVisible();
  expect(await page.evaluate(() => canvas.tokens.hud.object?.actor?.id)).toBe(
    actorId,
  );
}

async function palette(page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const color = (variable) => {
      probe.style.color = `var(${variable})`;
      return getComputedStyle(probe).color;
    };
    const colors = {
      rest: [
        "--cpr-background-window",
        "--cpr-text-normal",
        "--cpr-background-chat-border",
      ].map(color),
      hover: [
        "--cpr-background-foundry-hover",
        "--cpr-text-header",
        "--cpr-background-border",
      ].map(color),
      active: [
        "--cpr-background-header",
        "--cpr-text-header",
        "--cpr-background-border",
      ].map(color),
      activeHover: [
        "--cpr-background-foundry-hover",
        "--cpr-text-foundry-input",
        "--cpr-background-border",
      ].map(color),
    };
    probe.remove();
    return colors;
  });
}

async function controlStyle(control) {
  return control.evaluateAll(async (elements) => {
    if (elements.length !== 1) return null;
    const [element] = elements;
    const style = getComputedStyle(element);
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
    const image = element.querySelector("img");
    const glyph = element.querySelector("i");
    const icon = image ?? glyph;
    return {
      colors: [style.backgroundColor, style.color, style.borderTopColor],
      filter: image ? getComputedStyle(image).filter : null,
      iconOpacity: icon ? getComputedStyle(icon).opacity : null,
      glyphColor: glyph ? getComputedStyle(glyph, "::before").color : null,
    };
  });
}

function expectControlStyle(
  control,
  colors,
  { glyph = false, opacity = "1", filter = null } = {},
) {
  return soft
    .poll(() => controlStyle(control))
    .toEqual({
      colors,
      filter,
      iconOpacity: opacity,
      glyphColor: glyph ? colors[1] : null,
    });
}

// A failed canvas interaction in one palette must not skip the other palette.
for (const theme of ["light", "dark"]) {
  test(`real token HUD controls keep consistent colors and toggle states in ${theme} mode`, async ({
    page,
  }) => {
    // Software-rendered canvas interactions can exceed the normal test budget.
    test.slow();
    await gotoReadyWorld(page);
    const original = await page.evaluate(() => ({
      theme: game.settings.get(game.system.id, "theme"),
      themeFoundry: game.settings.get(game.system.id, "themeFoundry"),
      uiConfig: game.settings.get("core", "uiConfig"),
      noCanvas: game.settings.get("core", "noCanvas"),
      maxFPS: game.settings.get("core", "maxFPS"),
      performanceMode: game.settings.get("core", "performanceMode"),
    }));
    const name = uniqueName("hud-scene");
    let actorId;
    try {
      actorId = await createActorViaUI(page, {
        type: "character",
        name: uniqueName("hud-actor"),
      });
      await closeDocSheet(page, { collection: "actors", id: actorId });
      await createTokenViaUI(page, { actorId, name });
      await page.evaluate(async (variant) => {
        await game.settings.set(game.system.id, "theme", variant);
        await game.settings.set(game.system.id, "themeFoundry", true);
      }, theme);
      const colors = await palette(page);
      await reopenHud(page, actorId);
      for (const [selector, glyph] of [
        ['[data-action="config"]', true],
        ['[data-action="sort"][data-direction="up"]', false],
        [".dv-table-selector", false],
        ['[data-action="target"]', true],
        ['[data-action="combat"]', false],
      ]) {
        await test.step(`${theme}: ${selector} has matching resting and hover colors`, async () => {
          const control = page.locator(`#token-hud ${selector}`);
          await page.mouse.move(100, 500);
          await expectControlStyle(control, colors.rest, {
            glyph,
            opacity: "0.7",
            filter: glyph ? null : theme === "light" ? "invert(1)" : "none",
          });
          await control.hover();
          await expectControlStyle(control, colors.hover, {
            glyph,
            filter: glyph ? null : "none",
          });
        });
      }
      for (const action of ["target", "visibility"]) {
        await test.step(`${theme}: ${action} stays readable when active and hovered after reopening`, async () => {
          const control = page.locator(`#token-hud [data-action="${action}"]`);
          await control.click();
          await expect(control).toHaveClass(/active/);
          if (action === "visibility") {
            await page.waitForFunction(
              (id) =>
                canvas.tokens.placeables.find((entry) => entry.actor?.id === id)
                  ?.document.hidden,
              actorId,
            );
          }
          await reopenHud(page, actorId);
          await page.mouse.move(100, 500);
          const glyph = action === "target";
          await expectControlStyle(control, colors.active, {
            glyph,
            filter: glyph ? null : "none",
          });
          await control.hover();
          await expectControlStyle(control, colors.activeHover, {
            glyph,
            filter: glyph ? null : theme === "light" ? "invert(1)" : "none",
          });
          await control.click();
          await reopenHud(page, actorId);
          await soft(control).not.toHaveClass(/active/);
        });
      }
      await test.step(`${theme}: movement choices stay readable when hovered, selected and reopened`, async () => {
        const button = page.locator(
          '#token-hud button[data-palette="movementActions"]',
        );
        const menu = page.locator(
          '#token-hud .palette[data-palette="movementActions"]',
        );
        const defaultAction = menu.locator('[data-movement-action=""]');
        const walk = menu.locator('[data-movement-action="walk"]');
        const resting = [
          "rgba(0, 0, 0, 0)",
          colors.rest[1],
          "rgba(0, 0, 0, 0)",
        ];
        await button.click();
        await expect(menu).toBeVisible();
        await expect(defaultAction).toContainText("Default (Walk)");
        await expect(walk).toHaveText("Walk");
        await page.mouse.move(100, 500);
        await expectControlStyle(defaultAction, colors.active, {
          glyph: true,
        });
        await expectControlStyle(walk, resting, {
          opacity: "0.7",
          filter: theme === "light" ? "invert(1)" : "none",
        });
        await defaultAction.hover();
        await expectControlStyle(defaultAction, colors.hover, {
          glyph: true,
        });
        await walk.hover();
        await expectControlStyle(walk, colors.hover, { filter: "none" });
        await walk.click();
        await page.waitForFunction(
          (id) =>
            canvas.tokens.placeables.find((token) => token.actor?.id === id)
              ?.document.movementAction === "walk",
          actorId,
        );
        await reopenHud(page, actorId);
        if (!(await menu.isVisible())) await button.click();
        await page.mouse.move(100, 500);
        await soft(walk).toHaveClass(/active/);
        await expectControlStyle(walk, colors.active, { filter: "none" });
        await expectControlStyle(defaultAction, resting, { glyph: true });
        await walk.hover();
        await expectControlStyle(walk, colors.hover, { filter: "none" });
        await button.click();
        await expect(menu).not.toBeVisible();
      });
      await test.step(`${theme}: disabled integration leaves the native HUD unchanged`, async () => {
        await page.evaluate(() =>
          game.settings.set(game.system.id, "themeFoundry", false),
        );
        const control = page.locator('#token-hud [data-action="visibility"]');
        await control.hover();
        const before = await controlStyle(control);
        await page.evaluate(() => {
          const hud = document.querySelector("#token-hud");
          const reference = hud.cloneNode(false);
          reference.id = "cpr-native-hud-reference";
          reference.style.cssText = "position: fixed; left: 500px; top: 100px";
          reference.append(
            hud.querySelector('[data-action="visibility"]').cloneNode(true),
          );
          document.body.append(reference);
          reference.style.zIndex = "10000";
          reference.style.pointerEvents = "auto";
        });
        const reference = page.locator(
          '#cpr-native-hud-reference [data-action="visibility"]',
        );
        await reference.hover();
        await soft.poll(() => controlStyle(reference)).toEqual(before);
        await page
          .locator("#cpr-native-hud-reference")
          .evaluate((element) => element.remove());
        await page.evaluate(async () => {
          await game.settings.set(game.system.id, "themeFoundry", true);
          await game.settings.set(game.system.id, "themeFoundry", false);
        });
        await reopenHud(page, actorId);
        await control.hover();
        await soft.poll(() => controlStyle(control)).toEqual(before);
        const movementButton = page.locator(
          '#token-hud button[data-palette="movementActions"]',
        );
        const movement = page.locator(
          '#token-hud .palette[data-palette="movementActions"] [data-movement-action="walk"]',
        );
        await movementButton.click();
        await movement.hover();
        const nativeMovement = await controlStyle(movement);
        await page.evaluate(async () => {
          await game.settings.set(game.system.id, "themeFoundry", true);
          await game.settings.set(game.system.id, "themeFoundry", false);
        });
        await reopenHud(page, actorId);
        await movementButton.click();
        await movement.hover();
        await soft.poll(() => controlStyle(movement)).toEqual(nativeMovement);
      });
    } finally {
      try {
        if (await page.evaluate((n) => !!game.scenes.getName(n), name)) {
          await openSidebarTab(page, "scenes");
          await page
            .locator("#scenes .directory-item")
            .filter({ hasText: name })
            .click({ button: "right" });
          await page
            .locator("#context-menu .context-item")
            .filter({ hasText: "Delete" })
            .click();
          await page
            .locator('.application.dialog button[data-action="yes"]')
            .click();
        }
        if (actorId) await deleteActorViaUI(page, actorId);
      } finally {
        await page.evaluate(async (settings) => {
          document.querySelector("#cpr-native-hud-reference")?.remove();
          await game.settings.set(game.system.id, "themeFoundry", false);
          await game.settings.set(game.system.id, "theme", settings.theme);
          await game.settings.set("core", "uiConfig", settings.uiConfig);
          if (canvas.initialized) {
            await game.settings.set("core", "maxFPS", settings.maxFPS);
            await game.settings.set(
              "core",
              "performanceMode",
              settings.performanceMode,
            );
          }
          await game.settings.set(
            game.system.id,
            "themeFoundry",
            settings.themeFoundry,
          );
          await game.settings.set("core", "noCanvas", settings.noCanvas);
        }, original);
      }
    }
  });
}
