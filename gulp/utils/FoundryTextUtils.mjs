import prettier from "prettier";

/**
 * Match Foundry's built-in enriched-text forms plus similarly shaped custom
 * enrichers. The expression is deliberately broader than the built-in
 * document-link type list so module and system enrichers such as @Check[...] do
 * not need to be enumerated here.
 */
const FOUNDRY_EXPRESSION_PATTERN =
  /@[A-Z][A-Z0-9_-]*\[[^\]<]+\](?:\{[^}<]+\})?|\[\[(?:\/[A-Z]+\s)?[^<\r\n]*?\]{2,3}(?:\{[^}<]+\})?/giu;

/** Prefix used for opaque tokens passed through Prettier. */
const TOKEN_PREFIX = "FVTTPRETTIERENRICHER";

/**
 * Replaces Foundry enriched-text expressions with opaque, whitespace-free
 * tokens which Prettier treats as indivisible words.
 *
 * @param {string} html - HTML containing Foundry enriched-text expressions
 * @returns {{html: string, restore: (formattedHtml: string) => string}} The
 * protected HTML and a function which restores the original expressions
 */
function protectFoundryExpressions(html) {
  let prefix = TOKEN_PREFIX;
  while (html.includes(prefix)) {
    prefix += "X";
  }

  const protectedExpressions = [];
  const protectedHtml = html.replace(
    FOUNDRY_EXPRESSION_PATTERN,
    (expression) => {
      const tokenBase = `${prefix}${protectedExpressions.length}${prefix}`;
      const token = tokenBase.padEnd(
        Math.max(tokenBase.length, expression.length),
        "X",
      );
      protectedExpressions.push({ expression, token });
      return token;
    },
  );

  return {
    html: protectedHtml,
    restore(formattedHtml) {
      let restoredHtml = formattedHtml;

      for (const { expression, token } of protectedExpressions) {
        const tokenIndex = restoredHtml.indexOf(token);
        const duplicateIndex = restoredHtml.indexOf(
          token,
          tokenIndex + token.length,
        );
        if (tokenIndex === -1 || duplicateIndex !== -1) {
          throw new Error("Prettier altered a protected Foundry expression");
        }
        restoredHtml = restoredHtml.replace(token, expression);
      }

      return restoredHtml;
    },
  };
}

/**
 * Formats Foundry rich-text HTML without allowing Prettier to insert
 * whitespace inside enriched-text expressions.
 *
 * @param {string} html - Foundry rich-text HTML to format
 * @param {Object} [prettierOptions] - Additional Prettier options
 * @returns {Promise<string>} The formatted HTML
 */
export async function formatFoundryHtml(html, prettierOptions = {}) {
  const protectedHtml = protectFoundryExpressions(html);
  const formattedHtml = await prettier.format(protectedHtml.html, {
    ...prettierOptions,
    parser: "html",
  });
  return protectedHtml.restore(formattedHtml);
}
