import { expect } from "@playwright/test";
import { waitForActorFields } from "./actors.mjs";

// Open a ledger window (eurobucks, reputation, improvement points, ...) from a
// rendered sheet via its header icon; returns a locator scoped to the window.
export async function openLedgerWindow(page, sheetId, openIconSelector) {
  await page.locator(`#${sheetId} ${openIconSelector}`).click();
  const ledger = page.locator(".application.ledger");
  await expect(ledger).toBeVisible();
  return ledger;
}

// Apply an add / subtract / set change in an open ledger window and wait for
// the new value to persist on the actor (the window re-renders in place from it).
export async function applyLedgerChange(
  page,
  actorId,
  fieldPath,
  action,
  value,
  reason,
) {
  const before = await page.evaluate(
    ({ actorId, fieldPath }) => {
      const actor = game.actors.get(actorId);
      return actor ? foundry.utils.getProperty(actor, fieldPath) : undefined;
    },
    { actorId, fieldPath },
  );
  const expected =
    action === "add"
      ? before + value
      : action === "subtract"
        ? before - value
        : value;

  const ledger = page.locator(".application.ledger");
  await ledger.locator('input[name="modifyValue"]').fill(String(value));
  await ledger.locator('input[name="reason"]').fill(reason);
  await ledger.locator(`.ledger-edit-button[data-action="${action}"]`).click();
  await waitForActorFields(page, actorId, { [fieldPath]: expected });
}

// Close a ledger window via its header close button.
export async function closeLedgerWindow(page) {
  const ledger = page.locator(".application.ledger");
  await ledger.locator('button[data-action="close"]').click();
  await expect(ledger).toBeHidden();
}
