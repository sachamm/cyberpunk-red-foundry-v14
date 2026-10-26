import { expect } from "@playwright/test";

export async function verifyRollDialog(page) {
  const dialog = page
    .locator(".application")
    .filter({ has: page.locator(".total-mods") });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function readDamageFormula(dialog) {
  const header = dialog.locator(
    ".dialog-header .text-center:has(span.text-semi)",
  );
  await expect(header).toBeVisible();
  return (await header.textContent()).replace(/\s+/g, " ").trim();
}

export async function readTotalModsTooltip(dialog) {
  const totalMods = dialog.locator(".total-mods .dialog-item-input");
  await expect(totalMods).toBeVisible();
  return totalMods.getAttribute("data-tooltip");
}

export function expectModEntry(tooltip, source, value) {
  const entry = (tooltip ?? "").split("<br/>").find((e) => e.includes(source));
  expect(
    entry,
    `no mod entry for "${source}" in tooltip: ${tooltip}`,
  ).toBeTruthy();
  expect(entry, `mod entry for "${source}": ${entry}`).toContain(value);
}
