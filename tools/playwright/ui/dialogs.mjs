// The yes/no confirmation dialog used by destructive sheet actions (delete,
// snort, uninstall). Returns the dialog locator; the spec owns every
// visibility/text/count assertion. Dismiss it with resolveYesNo(dialog, "yes" | "no").
export function yesNoDialog(page) {
  return page.locator(".cpr-dialog").filter({
    has: page.locator(".cpr-dialog-message"),
  });
}

export async function resolveYesNo(dialog, action) {
  await dialog.locator(`button[data-action="${action}"]`).click();
}

// Measures a rendered checkbox's bounding box in CSS pixels. Specs use it to
// assert the control keeps one deterministic square box across checked states;
// Foundry v13 otherwise sizes dialog checkboxes from the glyph advance, which
// shifts once the checked check-mark layers load.
export async function checkboxGeometry(checkbox) {
  return checkbox.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}
