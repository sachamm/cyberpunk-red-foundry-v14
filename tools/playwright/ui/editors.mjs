export async function openNotesEditorViaUI(sheet, field) {
  const editor = sheet.locator(`prose-mirror[name="${field}"]`);
  await editor.hover();
  await editor.locator("button.toggle").click();
  await editor.locator('.editor-content[contenteditable="true"]').waitFor();
  return editor;
}

export async function saveNotesEditorViaUI(editor) {
  await editor.locator('[data-action="save"]').click();
}
