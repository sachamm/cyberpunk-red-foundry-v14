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
