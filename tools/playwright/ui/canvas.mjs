import { reloadReadyWorld } from "../session/world.mjs";
import { openSidebarTab } from "./sidebar.mjs";
import { dismissNotifications } from "./sheets.mjs";

export async function createCanvasTokenViaUI(page, { actorId, name }) {
  await openSidebarTab(page, "scenes");
  await page.locator("#scenes button.create-entry").click();
  const dialog = page.locator(".application.dialog");
  await dialog.locator('input[name="name"]').fill(name);
  await dismissNotifications(page);
  await dialog.locator('button[data-action="ok"]').click();
  await page.locator('.scene-config [data-action="close"]').click();
  if (!(await page.evaluate((n) => game.scenes.getName(n).active, name))) {
    await page
      .locator("#scenes .directory-item")
      .filter({ hasText: name })
      .click({ button: "right" });
    await page
      .locator("#context-menu .context-item")
      .filter({ hasText: "Activate" })
      .click();
  }
  await page.evaluate(() => game.settings.set("core", "noCanvas", false));
  await reloadReadyWorld(page);
  await page.waitForFunction(() => canvas.ready);
  await page.evaluate(async () => {
    await game.settings.set("core", "maxFPS", 10);
    await game.settings.set(
      "core",
      "performanceMode",
      CONST.CANVAS_PERFORMANCE_MODES.LOW,
    );
  });
  await reloadReadyWorld(page);
  await page.waitForFunction(
    (n) => canvas.ready && canvas.scene?.name === n,
    name,
  );
  await openSidebarTab(page, "actors");
  await page
    .locator(`#actors [data-entry-id="${actorId}"]`)
    .dragTo(page.locator("#board"), {
      targetPosition: { x: 600, y: 400 },
    });
  await page.waitForFunction(
    (id) => canvas.tokens.placeables.some((t) => t.actor?.id === id),
    actorId,
  );
  return page.evaluate(
    (id) => canvas.tokens.placeables.find((t) => t.actor?.id === id).id,
    actorId,
  );
}

export async function openCanvasTokenHudViaUI(page, tokenId) {
  await page.getByRole("tab", { name: "Token Controls", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Tokens", exact: true })
    .click();
  const point = await page.evaluate(
    (id) => canvas.clientCoordinatesFromCanvas(canvas.tokens.get(id).center),
    tokenId,
  );
  await page.mouse.move(100, 500);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction((id) => canvas.tokens.get(id)?.hover, tokenId);
  await page.mouse.click(point.x, point.y);
  await page.mouse.click(point.x, point.y, { button: "right", delay: 300 });
  await page.locator("#token-hud").waitFor({ state: "visible" });
}

export async function measureCanvasDistanceViaUI(
  page,
  { tokenId, gridSpaces },
) {
  const points = await page.evaluate(
    ({ tokenId: id, gridSpaces: n }) => {
      const token = canvas.tokens.get(id);
      return {
        start: canvas.clientCoordinatesFromCanvas(token.center),
        end: canvas.clientCoordinatesFromCanvas({
          x: token.center.x + n * canvas.grid.size,
          y: token.center.y,
        }),
      };
    },
    { tokenId, gridSpaces },
  );
  if (await page.evaluate(() => canvas.controls.ruler.active)) {
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Measure Distance", exact: true })
    .click();
  await page.waitForFunction(() => game.activeTool === "ruler");
  await page.mouse.move(100, 500);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(
    (points.start.x + points.end.x) / 2,
    (points.start.y + points.end.y) / 2,
    { steps: 3 },
  );
  await page.waitForFunction(() => canvas.controls.ruler.active);
  await page.mouse.move(points.end.x, points.end.y, { steps: 3 });
}
