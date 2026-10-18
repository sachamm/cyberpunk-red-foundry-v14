// Snapshot the chat log size; pair with waitForNewChatMessage to detect a
// message posted by an action taken in between.
export async function chatMessageCount(page) {
  return page.evaluate(() => game.messages.size);
}

// After the caller triggers an action, wait for a new chat message and return
// its id. With requireRoll, waits until the newest message carries at least one
// roll (roll actions post their roll on the message); with requireContent,
// until it carries content (item cards post to chat as plain messages).
// Read-only; specs own all card assertions.
export async function waitForNewChatMessage(
  page,
  before,
  { requireRoll = false, requireContent = false, timeout = 10000 } = {},
) {
  return page.waitForFunction(
    ({ before, requireRoll, requireContent }) => {
      if (game.messages.size <= before) return false;
      const msg = game.messages.contents.at(-1);
      if (!msg) return false;
      if (requireRoll && !msg.rolls.length) return false;
      if (requireContent && !msg.content) return false;
      return msg.id;
    },
    { before, requireRoll, requireContent },
    { timeout },
  );
}
