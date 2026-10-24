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

const soft = expect.configure({ soft: true, timeout: 3000 });
test.use({ viewport: { width: 1280, height: 800 } });

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
      .click({ timeout: 10000 });
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
  await page.evaluate(() => canvas.tokens.hud.close());
  await expect(page.locator("#token-hud")).not.toBeVisible();
  const point = await page.evaluate((id) => {
    const token = canvas.tokens.placeables.find(
      (entry) => entry.actor?.id === id,
    );
    return canvas.clientCoordinatesFromCanvas(token.center);
  }, actorId);
  await page.mouse.move(100, 500);
  await page.mouse.move(point.x, point.y, { steps: 5 });
  await page.waitForFunction(
    (id) =>
      canvas.tokens.placeables.find((entry) => entry.actor?.id === id)?.hover,
    actorId,
    { timeout: 10000 },
  );
  await page.mouse.click(point.x, point.y, { button: "right" });
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
  return control.evaluate(async (element) => {
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

test("real token HUD controls keep consistent colors across themes and toggle states", async ({
  page,
}) => {
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
    for (const theme of ["light", "dark"]) {
      await page.evaluate(async (variant) => {
        await game.settings.set(game.system.id, "theme", variant);
        await game.settings.set(game.system.id, "themeFoundry", true);
      }, theme);
      const colors = await palette(page);
      await reopenHud(page, actorId);
      for (const selector of [
        '[data-action="config"]',
        '[data-action="sort"][data-direction="up"]',
        ".dv-table-selector",
        '[data-action="target"]',
        '[data-action="combat"]',
      ]) {
        await test.step(`${theme}: ${selector} has matching resting and hover colors`, async () => {
          const control = page.locator(`#token-hud ${selector}`);
          await page.mouse.move(100, 500);
          await soft
            .poll(() => controlStyle(control))
            .toMatchObject({ colors: colors.rest, iconOpacity: "0.7" });
          const image = control.locator("img");
          if (await control.locator("i").count()) {
            await soft
              .poll(async () => (await controlStyle(control)).glyphColor)
              .toBe(colors.rest[1]);
          }
          if (await image.count())
            await soft(image).toHaveCSS(
              "filter",
              theme === "light" ? "invert(1)" : "none",
            );
          await control.hover();
          await soft
            .poll(() => controlStyle(control))
            .toMatchObject({ colors: colors.hover, iconOpacity: "1" });
          if (await control.locator("i").count()) {
            await soft
              .poll(async () => (await controlStyle(control)).glyphColor)
              .toBe(colors.hover[1]);
          }
          if (await image.count())
            await soft(image).toHaveCSS("filter", "none");
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
          await soft
            .poll(() => controlStyle(control))
            .toMatchObject({ colors: colors.active, iconOpacity: "1" });
          const image = control.locator("img");
          if (await image.count())
            await soft(image).toHaveCSS("filter", "none");
          await control.hover();
          await soft
            .poll(() => controlStyle(control))
            .toMatchObject({ colors: colors.activeHover, iconOpacity: "1" });
          if (await image.count())
            await soft(image).toHaveCSS(
              "filter",
              theme === "light" ? "invert(1)" : "none",
            );
          await control.click();
          await reopenHud(page, actorId);
          await soft(control).not.toHaveClass(/active/);
        });
      }
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
        await reference.hover({ timeout: 5000 });
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
      });
    }
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
