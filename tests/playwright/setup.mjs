import { chromium } from "@playwright/test";
import {
  clearRunState,
  newWorldId,
  PLAYER_CHARACTER_NAME,
  PLAYER_NAME,
  PLAYER_STORAGE_STATE,
  removeWorld,
  STORAGE_STATE,
  writeSession,
} from "../../tools/playwright/config/harness-config.mjs";
import {
  startFoundry,
  stopFoundry,
} from "../../tools/playwright/server/foundry-server.mjs";
import {
  createPlayerWithCharacter,
  driveSetup,
  joinAsGM,
  joinAsUser,
} from "../../tools/playwright/setup/foundry-setup.mjs";

const disableCanvas = (page) =>
  page.evaluate(() => game.settings.set("core", "noCanvas", true));

export default async function globalSetup() {
  const { child, config } = await startFoundry({
    config: undefined,
    mode: "test",
    silent: true,
  });
  const worldId = newWorldId();
  writeSession({
    config,
    worldId,
    pid: child.pid,
    mode: "test",
    ephemeral: true,
  });

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await driveSetup(page, { config, worldId });
    await joinAsGM(page, config);
    await disableCanvas(page);
    await createPlayerWithCharacter(page, {
      userName: PLAYER_NAME,
      characterName: PLAYER_CHARACTER_NAME,
    });
    await page.context().storageState({ path: STORAGE_STATE });

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await joinAsUser(playerPage, config, PLAYER_NAME);
    await disableCanvas(playerPage);
    await playerContext.storageState({ path: PLAYER_STORAGE_STATE });
    await playerContext.close();
  } catch (error) {
    await browser.close().catch(() => {});
    await stopFoundry(child).catch(() => {});
    await removeWorld(config.dataPath, worldId).catch(() => {});
    clearRunState();
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}
