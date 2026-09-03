/* global User */
import { SYSTEM_NAME } from "../config/harness-config.mjs";

/*
 * Drives Foundry's startup gates and gets us into a launched, ready world.
 *
 * IMPORTANT: the exact selectors for the license / EULA / setup screens are
 * Foundry-version-specific (v13 moved everything to ApplicationV2). They are
 * written defensively here but SHOULD be confirmed against a live instance on
 * first run - `npm run playwright:serve` + the Playwright MCP is the intended way to
 * inspect the real DOM and adjust these. Each step is a no-op if its screen is
 * not present, so a warm dataPath (already licensed, EULA accepted) skips ahead.
 */

const SHORT = 4000;

// True if `locator` becomes visible within `timeout`, false otherwise - never throws.
async function present(locator, timeout = SHORT) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

/*
 * Foundry shows onboarding "tours" (e.g. the Setup screen's "Backups Overview")
 * as a `.tour` step plus a full-screen `.tour-overlay` that renders above the
 * setup UI and intercepts clicks on the controls below it - enough to make
 * worldCreate/worldLaunch silently miss. Dismiss any visible tour: click its exit
 * ("X") control, fall back to pressing Escape (Foundry exits tours on Escape),
 * and as a last resort remove any lingering `.tour-overlay`/`.tour` nodes so they
 * stop intercepting pointer events. A tour can chain several steps, so repeat a
 * few times. No-op when none is present.
 */
async function dismissTours(page) {
  const exit = page.locator(
    '.tour-center-step a[data-action="exit"], .tour a[data-action="exit"], ' +
      '.tour [data-action="exit"], [data-action="exit"]',
  );
  const overlay = page.locator(".tour-overlay, .tour-center-step, .tour");
  for (let i = 0; i < 5; i += 1) {
    if (!(await present(overlay, 1000))) break;
    if (await present(exit, 250)) {
      await exit
        .first()
        .click()
        .catch(() => {});
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  // Last resort: physically remove any overlay still intercepting clicks.
  await page
    .evaluate(() => {
      document
        .querySelectorAll(".tour-overlay, .tour-center-step, .tour")
        .forEach((el) => el.remove());
    })
    .catch(() => {});
}

/*
 * Click a Setup control even when a tour overlay is fighting us: a tour can
 * re-render between page load and the click and intercept pointer events, which
 * makes a normal `.click()` time out ("<div class="tour-overlay"> intercepts
 * pointer events"). Clear the tour first, try a real click, and fall back to
 * dispatching the event straight at the element - which ignores any overlay
 * stacked on top. Mirrors the worldLaunch handling below.
 */
async function clickThrough(page, locator) {
  await dismissTours(page);
  await locator
    .click({ timeout: SHORT })
    .catch(() => locator.dispatchEvent("click"));
}

/*
 * On a fresh data dir, Foundry's Setup screen opens a "Share Usage Data" consent
 * prompt that sits above the world/tour controls until answered. Decline it so
 * the setup UI is interactable. No-op on a data dir that already answered.
 */
async function declineDataSharing(page) {
  const decline = page
    .locator(
      'button[data-action="no"]:has-text("Decline Sharing"), ' +
        'button:has-text("Decline Sharing")',
    )
    .first();
  if (await present(decline)) {
    await decline.click().catch(() => {});
  }
}

async function authenticateSetup(page, foundryAdminPass) {
  const passwordInput = page
    .locator(
      'input[name="adminPassword"], input[name="password"], input[type="password"]',
    )
    .first();
  if (!(await present(passwordInput, 1000))) return;

  if (!foundryAdminPass) {
    throw new Error(
      "Foundry setup requires the administrator password. Set " +
        "foundry.adminPassword in foundryconfig.json, or set FOUNDRY_ADMIN_PASS " +
        "in the repo-root .env file or export it in your shell.",
    );
  }

  await passwordInput.fill(foundryAdminPass);
  await page
    .locator(
      'button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")',
    )
    .first()
    .click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function acceptLicense(page, foundryKey) {
  const keyInput = page.locator('input[name="licenseKey"]').first();
  if (!(await present(keyInput))) return;

  if (!foundryKey) {
    throw new Error(
      "Foundry is showing the license activation screen but no license key is configured. Set " +
        "FOUNDRY_KEY in the repo-root .env file or export it in your shell.",
    );
  }
  await keyInput.fill(foundryKey);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function acceptEula(page) {
  const agree = page
    .locator('input#eula-agree, input[name="agree"], input[type="checkbox"]')
    .first();
  if (!(await present(agree))) return;

  await agree.check().catch(() => {});
  await page.locator("button#sign").first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function satisfySetupGates(page, config) {
  await acceptLicense(page, config.foundryKey);
  await acceptEula(page);
  await authenticateSetup(page, config.foundryAdminPass);
  await declineDataSharing(page);
  await dismissTours(page);
}

async function clickWorldLaunch(page, worldId) {
  const tile = page.locator(`[data-package-id="${worldId}"]`).first();
  if (!(await present(tile))) {
    throw new Error(`World '${worldId}' is not visible on the setup screen.`);
  }

  // Setup tiles reveal Launch on hover, but the anchor stays in the DOM even
  // while hidden. Dispatch the click directly so hover/tour timing cannot make
  // us miss the launch action.
  await tile.hover().catch(() => {});
  const launch = tile.locator('[data-action="worldLaunch"]').first();
  await launch.dispatchEvent("click").catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function handleCoreWorldMigrationPrompt(page) {
  const beginMigration = page
    .locator(
      'button:has-text("Begin Migration"), button:has-text("Migrate World")',
    )
    .last();
  const backupCheckbox = page.locator('input[name="createBackup"]').last();
  const migrationTitle = page
    .getByText(/World Data Migration Required|World Migration Required/i)
    .last();
  const migrationBody = page
    .getByText(/Launching the world .* will migrate/i)
    .last();

  const hasBeginMigration = await present(beginMigration, 1000);
  const hasMigrationTitle = await present(migrationTitle, 1000);
  const hasMigrationBody = await present(migrationBody, 1000);
  const promptVisible =
    hasBeginMigration && (hasMigrationTitle || hasMigrationBody);
  if (!promptVisible) return false;

  const backupEnabled = await backupCheckbox.isChecked().catch(() => false);
  if (backupEnabled) {
    await backupCheckbox.setChecked(false, { force: true }).catch(() => {});
    await backupCheckbox
      .evaluate((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        input.checked = false;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      })
      .catch(() => {});
    const backupStillEnabled = await backupCheckbox
      .isChecked()
      .catch(() => false);
    if (backupStillEnabled) {
      throw new Error(
        "Foundry's core world migration prompt appeared, but backup creation could not be disabled.",
      );
    }
  }

  await clickThrough(page, beginMigration);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
  return true;
}

async function recoverNoActiveGameSession(page) {
  const pathname = new URL(page.url()).pathname;
  if (!/\/(?:no|game)$/.test(pathname)) return false;

  const goBack = page
    .locator('a:has-text("Go Back"), button:has-text("Go Back")')
    .first();
  if (!(await present(goBack, 1000))) return false;

  await clickThrough(page, goBack);
  await page.waitForLoadState("networkidle").catch(() => {});
  return true;
}

async function waitForJoinAfterMigration(page, config, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await recoverNoActiveGameSession(page);
    const pathname = new URL(page.url()).pathname;
    if (
      /\/(join|auth)$/.test(pathname) &&
      (await currentPageHasJoinScreen(page))
    ) {
      return true;
    }
    await page.waitForTimeout(2000);
  }

  // If Foundry never redirected on its own, try the join screen once as a fallback.
  return launchedWorldHasJoinScreen(page, config);
}

async function launchWorldFromSetup(page, { config, worldId }) {
  // Retry from /setup until the world is joinable. A launch can either succeed
  // directly, surface Foundry's core migration dialog, or simply need another try.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await recoverNoActiveGameSession(page);
    await dismissTours(page);
    await clickWorldLaunch(page, worldId);
    const handledMigration = await handleCoreWorldMigrationPrompt(page);
    if (handledMigration) {
      if (await waitForJoinAfterMigration(page, config)) return;
    } else if (await launchedWorldHasJoinScreen(page, config)) {
      return;
    }
    await page.goto(`${config.url}/setup`, { waitUntil: "domcontentloaded" });
  }
  throw new Error(`World '${worldId}' did not launch from setup.`);
}

async function createAndLaunchWorld(page, worldId, config) {
  // Already in a world / at the join screen - nothing to set up.
  if (/\/(game|join)/.test(new URL(page.url()).pathname)) return;

  // The Setup screen often opens a tour overlay that would intercept our clicks.
  await dismissTours(page);

  const createButton = page
    .locator(
      '[data-action="worldCreate"], button:has-text("Create World"), a:has-text("Create World")',
    )
    .first();
  if (await present(createButton)) {
    await clickThrough(page, createButton);

    // World creation dialog. Opening it can spawn a fresh tour (e.g. "Backups Overview") that
    // overlays and re-renders the dialog, detaching the title input mid-fill - a 30s `fill` timeout
    // that flaked CI. Clear tours and retry so a tour that appears after the dialog can't wedge us.
    const titleInput = page.locator('input[name="title"]').first();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await dismissTours(page);
      const filled = await titleInput
        .fill(worldId, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (filled) break;
    }
    const idInput = page.locator('input[name="id"]').first();
    if (await present(idInput, 1000)) {
      await idInput.fill(worldId);
    }
    await page
      .locator('select[name="system"]')
      .first()
      .selectOption(SYSTEM_NAME);
    await clickThrough(
      page,
      page
        .locator('button[type="submit"], button:has-text("Create World")')
        .last(),
    );
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  await launchWorldFromSetup(page, { config, worldId });
}

/*
 * Idempotently satisfy whatever gate Foundry is currently showing, then ensure
 * our ephemeral world is created and launched. On a fresh data dir the order is
 * license -> EULA -> decline data-sharing -> setup.
 */
export async function reachInteractableSetup(page, config) {
  await page.goto(`${config.url}/setup`, { waitUntil: "domcontentloaded" });
  await recoverNoActiveGameSession(page);
  await satisfySetupGates(page, config);
}

export async function driveSetup(page, { config, worldId }) {
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  await recoverNoActiveGameSession(page);

  // If Foundry has already redirected us into a live world or exposed the
  // join screen, setup auth is irrelevant and world creation is already a no-op.
  // Do not treat `/auth` the same way: on admin-protected setups that is the
  // setup login gate we specifically need to satisfy.
  if (
    /\/(game|join)$/.test(new URL(page.url()).pathname) ||
    (await currentPageHasJoinScreen(page))
  ) {
    return;
  }

  await satisfySetupGates(page, config);
  await createAndLaunchWorld(page, worldId, config);
}

async function currentPageHasJoinScreen(page) {
  return present(page.locator('select[name="userid"]').first(), 2000);
}

export async function launchedWorldHasJoinScreen(page, config) {
  let navigationError;
  try {
    await page.goto(`${config.url}/join`, { waitUntil: "domcontentloaded" });
  } catch (error) {
    // Foundry can start its own redirect to /join while this fallback is
    // navigating there. Let that navigation finish, then verify the result.
    navigationError = error;
    await page
      .waitForLoadState("domcontentloaded", { timeout: SHORT })
      .catch(() => {});
  }
  await recoverNoActiveGameSession(page);
  const hasJoinScreen = await currentPageHasJoinScreen(page);
  if (!hasJoinScreen && navigationError) throw navigationError;
  return hasJoinScreen;
}

export async function launchExistingWorld(page, { config, worldId }) {
  await reachInteractableSetup(page, config);
  await launchWorldFromSetup(page, { config, worldId });
}

async function openWorldConfig(page, { config, worldId }) {
  await reachInteractableSetup(page, config);
  const tile = page.locator(`[data-package-id="${worldId}"]`).first();
  if (!(await present(tile))) {
    throw new Error(`World '${worldId}' is not visible on the setup screen.`);
  }

  await tile
    .click({ button: "right" })
    .catch(() => tile.dispatchEvent("contextmenu"));
  const editWorld = page.locator("#context-menu .context-item", {
    hasText: "Edit World",
  });
  if (!(await present(editWorld, 3000))) {
    throw new Error(
      `Could not find the Edit World menu item for '${worldId}'.`,
    );
  }
  await clickThrough(page, editWorld);

  const form = page
    .locator('form#world-config, form:has(input[name="resetKeys"])')
    .last();
  if (!(await present(form, 5000))) {
    throw new Error(`Could not open the world config form for '${worldId}'.`);
  }
  return form;
}

export async function resetWorldUserPasswords(page, { config, worldId }) {
  const form = await openWorldConfig(page, { config, worldId });
  const resetKeys = form.locator('input[name="resetKeys"]');
  if (!(await present(resetKeys, 1000))) {
    throw new Error(
      `Could not find the Reset User Passwords checkbox for '${worldId}'.`,
    );
  }
  await resetKeys.check();

  const submit = form
    .locator('button[type="submit"], button:has-text("Update World")')
    .last();
  if (!(await present(submit, 1000))) {
    throw new Error(`No Update World control found for '${worldId}'.`);
  }
  await clickThrough(page, submit);
  await page.waitForLoadState("networkidle").catch(() => {});
  await expectWorldConfigClosed(page, worldId);
}

async function expectWorldConfigClosed(page, worldId) {
  const form = page.locator(
    'form#world-config, form:has(input[name="resetKeys"])',
  );
  const closed = await form
    .waitFor({ state: "detached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!closed && (await form.count())) {
    throw new Error(`World config form for '${worldId}' did not close.`);
  }
}

async function finishJoinedWorld(page, { requireGamemaster = false } = {}) {
  await page.waitForFunction(() => globalThis.game?.ready === true, null, {
    timeout: 60000,
  });

  // A freshly launched world auto-starts in-world tours (the sidebar/canvas
  // "Welcome" tours) whose `.tour-overlay` renders above the game UI and
  // intercepts pointer events, making later driven interactions silently miss.
  await page
    .evaluate(() => {
      for (const tour of globalThis.game?.tours?.contents ?? []) {
        try {
          tour.exit?.();
        } catch {
          /* a tour that refuses to exit is handled by the DOM cleanup below */
        }
      }
    })
    .catch(() => {});
  await dismissTours(page);

  if (requireGamemaster) {
    const isGamemaster = await page.evaluate(
      () => game.user.role === CONST.USER_ROLES.GAMEMASTER,
    );
    if (!isGamemaster) throw new Error("Joined user is not a full Gamemaster.");
  }

  await page
    .evaluate(
      () =>
        globalThis.game?.paused &&
        globalThis.game.togglePause(false, { broadcast: true }),
    )
    .catch(() => {});
  await page.waitForTimeout(750);
}

/*
 * From the world login screen, sign in as the named user and wait for game ready.
 */
export async function joinAsUser(page, config, label, { password = "" } = {}) {
  if (!/\/(join|auth)/.test(new URL(page.url()).pathname)) {
    await page.goto(`${config.url}/join`, { waitUntil: "domcontentloaded" });
  }

  const userSelect = page.locator('select[name="userid"]').first();
  if (await present(userSelect)) {
    await userSelect.selectOption({ label }).catch(async () => {
      await userSelect.selectOption({ index: 1 });
    });
  }
  await page.locator('input[name="password"]').first().fill(password);
  await page
    .locator('button[name="join"], button[type="submit"]')
    .first()
    .click();

  await finishJoinedWorld(page);
}

async function waitForJoinableUsers(page) {
  const userSelect = page.locator('select[name="userid"]').first();
  await userSelect.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const select = document.querySelector('select[name="userid"]');
      if (!(select instanceof HTMLSelectElement)) return false;
      return Array.from(select.options).some((option) => option.value);
    },
    null,
    { timeout: 60000 },
  );
  return userSelect;
}

async function loginWithUserValue(page, config, value, password) {
  await page.goto(`${config.url}/join`, { waitUntil: "domcontentloaded" });
  const userSelect = await waitForJoinableUsers(page);
  await userSelect.selectOption(value);
  await page.locator('input[name="password"]').first().fill(password);
  await page
    .locator('button[name="join"], button[type="submit"]')
    .first()
    .click();
  await finishJoinedWorld(page, { requireGamemaster: true });
}

export async function joinAsFullGM(page, config, { password }) {
  await page.goto(`${config.url}/join`, { waitUntil: "domcontentloaded" });
  await waitForJoinableUsers(page);
  const candidates = await page
    .locator('select[name="userid"] option')
    .evaluateAll((options) =>
      options
        .map((option) => ({
          label: option.label || option.textContent?.trim() || "",
          value: option.value,
        }))
        .filter((option) => option.value),
    );
  const ordered = [
    ...candidates.filter((user) => user.label === "Gamemaster"),
    ...candidates.filter((user) => user.label !== "Gamemaster"),
  ];
  if (ordered.length === 0) {
    throw new Error(
      "No joinable users were available on the world join screen.",
    );
  }

  const failures = [];
  for (const candidate of ordered) {
    try {
      await loginWithUserValue(page, config, candidate.value, password);
      return candidate;
    } catch (error) {
      failures.push(`${candidate.label}: ${error.message}`);
      await page
        .goto(`${config.url}/logout`, { waitUntil: "domcontentloaded" })
        .catch(() => {});
    }
  }

  throw new Error(
    `No full Gamemaster user could log in. Tried:\n${failures.join("\n")}`,
  );
}

/*
 * Sign in as the default Gamemaster (blank password on a freshly created world).
 */
export async function joinAsGM(page, config) {
  return joinAsUser(page, config, "Gamemaster");
}

/*
 * Create (idempotently) a non-GM player User, then create and assign their
 * Character. Setup is not exercising the actor-creation dialog itself, so use
 * the document API here to avoid Foundry boot-time dialog races before the real
 * specs start driving the UI helpers.
 */
export async function createPlayerWithCharacter(
  page,
  { userName, characterName },
) {
  const { userId, actorId } = await page.evaluate(
    async ({ userName, characterName }) => {
      const user =
        game.users.getName(userName) ??
        (await User.create({ name: userName, role: CONST.USER_ROLES.PLAYER }));
      const actor =
        game.actors.getName(characterName) ??
        (await Actor.create({ name: characterName, type: "character" }));
      return { userId: user.id, actorId: actor.id };
    },
    { userName, characterName },
  );
  await page.evaluate(
    async ({ userId, actorId }) => {
      const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      const user = game.users.get(userId);
      const actor = game.actors.get(actorId);
      await actor.update({ [`ownership.${user.id}`]: owner });
      await user.update({ character: actor.id });
    },
    { userId, actorId },
  );
  return { userId, actorId };
}
