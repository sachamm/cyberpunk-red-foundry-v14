import { expect } from "@playwright/test";

// The verify-roll dialog — the modal that shows a roll's formula and its Total
// Mods breakdown before it is confirmed (used by both attack and damage rolls).
export async function verifyRollDialog(page) {
  const dialog = page
    .locator(".application")
    .filter({ has: page.locator(".total-mods") });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Read the roll's formula from the dialog header ("Label: <formula>").
export async function readDamageFormula(dialog) {
  const header = dialog.locator(
    ".dialog-header .text-center:has(span.text-semi)",
  );
  await expect(header).toBeVisible();
  return (await header.textContent()).replace(/\s+/g, " ").trim();
}

// Read the applied-modifiers breakdown from the dialog's Total Mods tooltip.
// The tooltip lists one entry per mod — "<source> (<key label>): <+value>" —
// delimited by "<br/>".
export async function readTotalModsTooltip(dialog) {
  const totalMods = dialog.locator(".total-mods .dialog-item-input");
  await expect(totalMods).toBeVisible();
  return totalMods.getAttribute("data-tooltip");
}

// Assert the Total Mods tooltip carries a modifier entry for `source` whose
// value is `value`. Splitting on "<br/>" anchors the value to its own mod, so
// a value regression can't hide behind an unrelated mod that shares the value.
export function expectModEntry(tooltip, source, value) {
  const entry = (tooltip ?? "").split("<br/>").find((e) => e.includes(source));
  expect(
    entry,
    `no mod entry for "${source}" in tooltip: ${tooltip}`,
  ).toBeTruthy();
  expect(entry, `mod entry for "${source}": ${entry}`).toContain(value);
}
