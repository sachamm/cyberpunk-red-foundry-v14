import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";

/*
 * Regression coverage for the migrateActors canvas race: when the runner batch-writes world
 * actors while the active scene's draw is still in flight, token updates crash because
 * `canvas.pendingRenderFlags` does not exist until the draw completes.
 * `MigrationRunner.waitForCanvasReady()` must resolve immediately when there is nothing to
 * wait for (no viewed scene, or no draw in progress) and wait for the "canvasReady" hook
 * while a draw is in progress. The e2e test drives the full runner with a linked token on
 * the active scene — the exact shape of the crash — pinning the world one version behind
 * using a value derived from the runner, so it stays valid as migrations are added.
 */

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test("waitForCanvasReady only waits while a scene draw is in progress", async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const runner = game.cpr.MigrationRunner;
    if (typeof runner.waitForCanvasReady !== "function") {
      return { missing: true };
    }

    // Bounded await: turns a hang into a fast "timeout" verdict instead of letting a broken
    // implementation block world loading (and this test) indefinitely.
    const settle = (promise) =>
      Promise.race([
        promise.then(
          () => "resolved",
          () => "rejected",
        ),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 2000)),
      ]);

    // Shadow canvas/scene state with own properties so each scenario is deterministic
    // regardless of what the real canvas is doing.
    const shadows = [];
    const shadow = (target, name, value) => {
      Object.defineProperty(target, name, {
        value,
        configurable: true,
        writable: true,
      });
      shadows.push([target, name]);
    };
    const restore = () => {
      for (const [target, name] of shadows.splice(0)) delete target[name];
    };

    // The harness world runs with the canvas disabled; report it as enabled so each scenario
    // exercises its intended branch instead of the no-canvas short circuit.
    const settingsGet = game.settings.get.bind(game.settings);
    shadow(game.settings, "get", (scope, key, ...rest) =>
      scope === "core" && key === "noCanvas"
        ? false
        : settingsGet(scope, key, ...rest),
    );

    const scenarios = [
      {
        name: "canvas already ready",
        setup: () => {
          shadow(game.scenes, "current", {});
          shadow(canvas, "ready", true);
        },
      },
      {
        name: "no current scene",
        setup: () => shadow(game.scenes, "current", null),
      },
      {
        name: "draw not in progress",
        setup: () => {
          shadow(game.scenes, "current", {});
          shadow(canvas, "ready", false);
          shadow(canvas, "loading", false);
        },
      },
    ];

    const runScenario = async (scenario) => {
      const before = shadows.length;
      scenario.setup();
      try {
        return await settle(runner.waitForCanvasReady());
      } finally {
        // Restore only this scenario's shadows, leaving the no-canvas intercept in place.
        while (shadows.length > before) {
          const [target, name] = shadows.pop();
          delete target[name];
        }
      }
    };

    const outcomes = [];
    for (const scenario of scenarios) {
      outcomes.push({
        name: scenario.name,
        outcome: await runScenario(scenario),
      });
    }

    // A draw in progress must not resolve on its own, but must resolve once canvasReady fires.
    shadow(game.scenes, "current", {});
    shadow(canvas, "ready", false);
    shadow(canvas, "loading", true);
    let inFlight = null;
    try {
      const pending = runner.waitForCanvasReady();
      let settledEarly = false;
      pending.then(
        () => {
          settledEarly = true;
        },
        () => {
          settledEarly = true;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      Hooks.callAll("canvasReady", canvas);
      inFlight = { settledEarly, outcome: await settle(pending) };
    } finally {
      restore();
    }

    return { missing: false, outcomes, inFlight };
  });

  expect(
    results.missing,
    "MigrationRunner.waitForCanvasReady should be a function",
  ).toBe(false);
  for (const { name, outcome } of results.outcomes) {
    expect(outcome, `${name}: expected immediate resolution`).toBe("resolved");
  }
  expect(
    results.inFlight.settledEarly,
    "must not resolve while a draw is in progress",
  ).toBe(false);
  expect(results.inFlight.outcome, "must resolve once canvasReady fires").toBe(
    "resolved",
  );
});

test("world migration completes with a linked token on the active scene", async ({
  page,
}) => {
  const seeded = await page.evaluate(async () => {
    let scene = game.scenes.current;
    if (!scene) {
      scene = await Scene.create({ name: "migration canvas e2e" });
      game.scenes.viewed = scene.id;
    }
    const actor = await Actor.create({
      name: "Migration Canvas E2E",
      type: "character",
    });
    const [token] = await scene.createEmbeddedDocuments("Token", [
      { x: 100, y: 100, actorId: actor.id },
    ]);
    return { sceneId: scene.id, actorId: actor.id, tokenId: token.id };
  });

  // Force the world one version behind so the full runner executes on reload. Derived from
  // the runner rather than hardcoded so future migrations keep this test meaningful.
  await page.evaluate(async () => {
    const runner = game.cpr.MigrationRunner;
    await game.settings.set(
      game.system.id,
      "dataModelVersion",
      String(runner.newDataModelVersion - 1),
    );
  });
  await page.reload();

  const migration = page.locator("#cpr-migration");
  const confirm = migration.locator('[data-action="confirmMigration"]');
  await expect(confirm).toBeVisible();
  await confirm.hover();
  await page.mouse.down();
  await expect(confirm).toHaveCount(0);
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const runner = game.cpr.MigrationRunner;
        return runner.error
          ? String(runner.error.cause?.stack ?? runner.error)
          : runner.migrationSuccessful;
      }),
    )
    .toBe(true);

  await page.waitForFunction(
    () =>
      game.settings.get(game.system.id, "dataModelVersion") ===
      String(game.cpr.MigrationRunner.newDataModelVersion),
  );

  const result = await page.evaluate(({ actorId, sceneId, tokenId }) => {
    const actor = game.actors.get(actorId);
    const token = game.scenes.get(sceneId).tokens.get(tokenId);
    return {
      migrationCurrent:
        actor?.getFlag(game.system.id, "_migration")?.current ?? null,
      latest: game.cpr.MigrationRunner.newDataModelVersion,
      tokenActorId: token?.actorId ?? null,
    };
  }, seeded);

  expect(result.migrationCurrent, "actor was rewritten by the runner").toBe(
    result.latest,
  );
  expect(result.tokenActorId, "token survived the actor batch write").toBe(
    seeded.actorId,
  );
});
