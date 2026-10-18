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

async function createTokenViaUI(page) {
  const name = uniqueName("hud-scene");
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
  const entry = page
    .locator("#scenes .directory-item")
    .filter({ hasText: name });
  await entry.click({ button: "right" });
  await page
    .locator("#context-menu .context-item")
    .filter({ hasText: "Activate" })
    .click();
  await page.waitForFunction(
    (sceneName) => canvas.ready && canvas.scene?.name === sceneName,
    name,
  );
  const actorId = await createActorViaUI(page, {
    type: "character",
    name: uniqueName("hud-actor"),
  });
  await closeDocSheet(page, { collection: "actors", id: actorId });
  await openSidebarTab(page, "actors");
  await page
    .locator(`#actors [data-entry-id="${actorId}"]`)
    .dragTo(page.locator("#board"), { targetPosition: { x: 850, y: 450 } });
  await page.waitForFunction(
    (id) => canvas.tokens.placeables.some((token) => token.actor?.id === id),
    actorId,
  );
  return { actorId, name };
}

async function reopenHud(page, actorId) {
  await page.waitForFunction(() => canvas.ready);
  const point = await page.evaluate((id) => {
    const token = canvas.tokens.placeables.find(
      (entry) => entry.actor?.id === id,
    );
    return canvas.clientCoordinatesFromCanvas(token.center);
  }, actorId);
  await page.mouse.click(400, 100);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .locator("#token-hud")
    .waitFor({ state: "visible", timeout: 10000 });
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
    return {
      colors: [style.backgroundColor, style.color, style.borderTopColor],
      filter: image ? getComputedStyle(image).filter : null,
    };
  });
}

test("real token HUD controls keep consistent colors across themes and toggle states", async ({
  page,
}) => {
  // Real canvas rendering is substantially slower under software WebGL in CI.
  test.slow();
  await gotoReadyWorld(page);
  const original = await page.evaluate(() => ({
    theme: game.settings.get(game.system.id, "theme"),
    themeFoundry: game.settings.get(game.system.id, "themeFoundry"),
    uiConfig: game.settings.get("core", "uiConfig"),
  }));
  await page.evaluate(() => game.settings.set("core", "noCanvas", false));
  await page.reload();
  await gotoReadyWorld(page);
  await dismissNotifications(page);
  const { actorId, name } = await createTokenViaUI(page);
  try {
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
      ]) {
        await test.step(`${theme}: ${selector} has matching resting and hover colors`, async () => {
          const control = page.locator(`#token-hud ${selector}`);
          await page.mouse.move(500, 300);
          await soft
            .poll(async () => (await controlStyle(control)).colors)
            .toEqual(colors.rest);
          const image = control.locator("img");
          if (await image.count())
            await soft(image).toHaveCSS(
              "filter",
              theme === "light" ? "invert(1)" : "none",
            );
          await control.hover();
          await soft
            .poll(async () => (await controlStyle(control)).colors)
            .toEqual(colors.hover);
          if (await image.count())
            await soft(image).toHaveCSS("filter", "none");
        });
      }
      for (const action of ["target", "visibility"]) {
        await test.step(`${theme}: ${action} stays readable when active and hovered after reopening`, async () => {
          const control = page.locator(`#token-hud [data-action="${action}"]`);
          await control.click();
          await expect(control).toHaveClass(/active/);
          await reopenHud(page, actorId);
          await page.mouse.move(500, 300);
          await soft
            .poll(async () => (await controlStyle(control)).colors)
            .toEqual(colors.active);
          const image = control.locator("img");
          if (await image.count())
            await soft(image).toHaveCSS("filter", "none");
          await control.hover();
          await soft
            .poll(async () => (await controlStyle(control)).colors)
            .toEqual(colors.activeHover);
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
    await page.evaluate(async (settings) => {
      await game.settings.set(game.system.id, "themeFoundry", false);
      await game.settings.set(game.system.id, "theme", settings.theme);
      await game.settings.set("core", "uiConfig", settings.uiConfig);
      await game.settings.set(
        game.system.id,
        "themeFoundry",
        settings.themeFoundry,
      );
      await game.settings.set("core", "noCanvas", true);
    }, original);
    await openSidebarTab(page, "scenes");
    await page
      .locator("#scenes .directory-item")
      .filter({ hasText: name })
      .click({ button: "right" });
    await page
      .locator("#context-menu .context-item")
      .filter({ hasText: "Delete" })
      .click();
    await page.locator('.application.dialog button[data-action="yes"]').click();
    await deleteActorViaUI(page, actorId);
  }
});
