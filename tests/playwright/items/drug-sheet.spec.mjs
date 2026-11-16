import { test, expect } from "@playwright/test";
import { installConsoleErrorHarness } from "../../../tools/playwright/session/console-harness.mjs";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  closeDocSheet,
  createEffectViaUI,
  createItemViaUI,
  getEffectRowViaUI,
  reopenItemSheetViaUI,
  submitActiveEffectConfigViaUI,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

installConsoleErrorHarness();

/*
 * Drug sheet: the "Primary effect" (system.consumed) select on the Effects
 * tab. It renders only while usage is "snorted", offers every effect name
 * plus a trailing "none" option, and the choice persists across a full sheet
 * reopen. The snort bulk-disable behaviour of the usage change itself is
 * owned by item-effects.spec.mjs and not re-proven here.
 */

async function openEffectsTab(itemSheet) {
  await itemSheet.locator('a.tab-label[data-tab="item-effects"]').click();
}

test.beforeEach(async ({ page }) => gotoReadyWorld(page));

test("the primary-effect select follows the snorted usage and persists", async ({
  page,
}) => {
  const itemId = await createItemViaUI(page, {
    type: "drug",
    name: uniqueName("drug"),
  });
  let itemSheet = page.locator(`#CPRItemSheet-Item-${itemId}`);
  await expect(itemSheet).toBeVisible();

  const firstEffect = uniqueName("effect");
  const secondEffect = uniqueName("effect");

  await test.step("two named effects are created on the drug", async () => {
    await openEffectsTab(itemSheet);

    for (const effectName of [firstEffect, secondEffect]) {
      const { aeConfig } = await createEffectViaUI(page, itemSheet, {
        ownerType: "item",
        ownerId: itemId,
      });
      await aeConfig.locator('input[name="name"]').fill(effectName);
      await submitActiveEffectConfigViaUI(page, aeConfig);
    }

    for (const effectName of [firstEffect, secondEffect]) {
      const row = await getEffectRowViaUI(itemSheet, effectName);
      await expect(row).toHaveCount(1);
    }
  });

  await test.step("snorted usage reveals the primary-effect select with every effect name", async () => {
    const usageSelect = itemSheet.locator('select[name="system.usage"]');
    await usageSelect.selectOption("snorted");

    const consumedSelect = itemSheet.locator('select[name="system.consumed"]');
    await expect(consumedSelect).toBeVisible({ timeout: 10000 });
    const options = await consumedSelect
      .locator("option")
      .evaluateAll((opts) => opts.map((opt) => opt.value));
    expect(options).toEqual([firstEffect, secondEffect, "none"]);
  });

  await test.step("the primary-effect choice persists across a full sheet reopen", async () => {
    const consumedSelect = itemSheet.locator('select[name="system.consumed"]');
    await consumedSelect.selectOption(secondEffect);

    await closeDocSheet(page, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(page, itemId);
    itemSheet = page.locator(`#${reopenedId}`);
    await openEffectsTab(itemSheet);

    await expect(itemSheet.locator('select[name="system.usage"]')).toHaveValue(
      "snorted",
    );
    await expect(
      itemSheet.locator('select[name="system.consumed"]'),
    ).toHaveValue(secondEffect);
  });

  await test.step("switching usage away from snorted hides the select again", async () => {
    const usageSelect = itemSheet.locator('select[name="system.usage"]');
    await usageSelect.selectOption("toggled");

    await expect(
      itemSheet.locator('select[name="system.consumed"]'),
    ).toHaveCount(0);
  });

  await test.step("the hidden state persists across a full sheet reopen", async () => {
    await closeDocSheet(page, { collection: "items", id: itemId });
    const reopenedId = await reopenItemSheetViaUI(page, itemId);
    itemSheet = page.locator(`#${reopenedId}`);
    await openEffectsTab(itemSheet);

    await expect(itemSheet.locator('select[name="system.usage"]')).toHaveValue(
      "toggled",
    );
    await expect(
      itemSheet.locator('select[name="system.consumed"]'),
    ).toHaveCount(0);
  });
});
