import { expect } from "@playwright/test";

async function effectIds(page, { ownerType, ownerId }) {
  return page.evaluate(
    ({ ownerType, ownerId }) => {
      const owner = (ownerType === "item" ? game.items : game.actors).get(
        ownerId,
      );
      return owner.effects.map((effect) => effect.id);
    },
    { ownerType, ownerId },
  );
}

export async function createEffectViaUI(page, sheet, { ownerType, ownerId }) {
  const before = await effectIds(page, { ownerType, ownerId });
  await sheet
    .locator('.effects-list a.effect-control[data-action="create"]')
    .click();

  const aeConfig = page.locator(".application.active-effect-config");
  await expect(aeConfig).toBeVisible();

  await page.waitForFunction(
    ({ ownerType, ownerId, before }) => {
      const owner = (ownerType === "item" ? game.items : game.actors).get(
        ownerId,
      );
      return owner.effects.some((effect) => !before.includes(effect.id));
    },
    { ownerType, ownerId, before },
  );
  const effectId = await page.evaluate(
    ({ ownerType, ownerId, before }) => {
      const owner = (ownerType === "item" ? game.items : game.actors).get(
        ownerId,
      );
      return owner.effects.find((effect) => !before.includes(effect.id)).id;
    },
    { ownerType, ownerId, before },
  );

  return { aeConfig, effectId };
}

export async function closeActiveEffectConfigViaUI(page, aeConfig) {
  await aeConfig.locator('[data-action="close"]').click();
  await expect(aeConfig).toHaveCount(0);
}

export async function addModViaUI(aeConfig) {
  const rows = aeConfig.locator(".changes-list > li");
  const before = await rows.count();
  await aeConfig.locator('[data-action="addMod"]').click();
  await expect(rows).toHaveCount(before + 1);
  return rows.nth(before);
}

export async function deleteModViaUI(aeConfig, index) {
  const rows = aeConfig.locator(".changes-list > li");
  const before = await rows.count();
  await aeConfig
    .locator(
      `.changes-list > li[data-index="${index}"] [data-action="deleteMod"]`,
    )
    .click();
  await expect(rows).toHaveCount(before - 1);
}

export async function getEffectRowViaUI(sheet, effectName) {
  const row = sheet
    .locator(".effects-list li.effect")
    .filter({ hasText: effectName });
  await expect(row.first()).toBeVisible();
  return row;
}

export async function clickEffectActionViaUI(row, action) {
  await row.locator(`a.effect-control[data-action="${action}"]`).click();
}
