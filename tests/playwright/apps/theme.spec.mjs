import { test, expect } from "@playwright/test";
import { gotoReadyWorld } from "../../../tools/playwright/session/world.mjs";
import {
  openSidebarTab,
  uniqueName,
} from "../../../tools/playwright/ui/index.mjs";

const SYSTEM_ID = "cyberpunk-red-core";

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((channel) => Number(channel) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function captureSettings(page) {
  return page.evaluate(() => ({
    theme: game.settings.get(game.system.id, "theme"),
    themeFoundry: game.settings.get(game.system.id, "themeFoundry"),
    uiConfig: game.settings.get("core", "uiConfig"),
  }));
}

async function restoreSettings(page, settings) {
  await page.evaluate(async (original) => {
    await game.settings.set(game.system.id, "themeFoundry", false);
    await game.settings.set(game.system.id, "theme", original.theme);
    await game.settings.set("core", "uiConfig", original.uiConfig);
    await game.settings.set(
      game.system.id,
      "themeFoundry",
      original.themeFoundry,
    );
  }, settings);
}

async function readThemeTokens(page) {
  return page.evaluate(() => {
    const stock = document.createElement("section");
    // AppV2 always adds `application`, but only adds `themed` after a
    // per-sheet theme is selected. Macro sheets and document-creation dialogs
    // exercise this unthemed state by default.
    stock.className = "application";
    const cpr = document.createElement("section");
    cpr.className = "application cpr themed theme-dark";
    const legacy = document.createElement("section");
    legacy.className = "app window-app themed theme-light";

    const cprHeader = document.createElement("header");
    cprHeader.className = "window-header";
    const cprHeaderButton = document.createElement("button");
    cprHeaderButton.className = "header-control";
    cprHeader.append(cprHeaderButton);

    const cprContent = document.createElement("div");
    cprContent.className = "window-content";
    const cprContentButton = document.createElement("button");
    cprContent.append(cprContentButton);
    cpr.append(cprHeader, cprContent);

    const legacyContent = document.createElement("div");
    legacyContent.className = "window-content themed theme-light";
    const legacyButton = document.createElement("button");
    legacyContent.append(legacyButton);
    legacy.append(legacyContent);

    document.body.append(stock, cpr, legacy);

    const rootStyle = getComputedStyle(document.documentElement);
    const read = (element) => {
      const style = getComputedStyle(element);
      return {
        background: style.getPropertyValue("--background").trim(),
        text: style.getPropertyValue("--color-text-primary").trim(),
      };
    };
    const result = {
      cprBackground: rootStyle
        .getPropertyValue("--cpr-background-window")
        .trim(),
      cprButtonBackground: rootStyle
        .getPropertyValue("--cpr-background-foundry-input")
        .trim(),
      cprText: rootStyle.getPropertyValue("--cpr-text-normal").trim(),
      stock: read(stock),
      cpr: read(cpr),
      cprHeaderButton: getComputedStyle(cprHeaderButton)
        .getPropertyValue("--button-background-color")
        .trim(),
      cprContentButton: getComputedStyle(cprContentButton)
        .getPropertyValue("--button-background-color")
        .trim(),
      legacy: read(legacy),
      legacyButton: getComputedStyle(legacyButton)
        .getPropertyValue("--button-background-color")
        .trim(),
      legacyContentBackground: getComputedStyle(legacyContent).backgroundImage,
    };

    stock.remove();
    cpr.remove();
    legacy.remove();
    return result;
  });
}

async function readDisabledCheckboxColors(page) {
  return page.evaluate(() => {
    const application = document.createElement("section");
    application.className = "application cpr themed";

    const createCheckbox = ({ checked = false, readonly = false } = {}) => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      if (readonly) checkbox.setAttribute("readonly", "");
      else checkbox.disabled = true;
      application.append(checkbox);
      return checkbox;
    };
    const disabledUnchecked = createCheckbox();
    const disabledChecked = createCheckbox({ checked: true });
    const readonlyUnchecked = createCheckbox({ readonly: true });
    const readonlyChecked = createCheckbox({ checked: true, readonly: true });

    const surfaceColor = (variable) => {
      const surface = document.createElement("div");
      surface.style.backgroundColor = `var(${variable})`;
      application.append(surface);
      return getComputedStyle(surface).backgroundColor;
    };

    document.body.append(application);
    const styles = getComputedStyle(disabledUnchecked);
    const result = {
      semanticColor: styles
        .getPropertyValue("--cpr-checkbox-disabled-color")
        .trim(),
      foundryColor: styles.getPropertyValue("--checkbox-disabled-color").trim(),
      controlColors: [
        {
          state: "disabled unchecked",
          color: getComputedStyle(disabledUnchecked, "::before").color,
        },
        {
          state: "disabled checked",
          color: getComputedStyle(disabledChecked, "::after").color,
        },
        {
          state: "readonly unchecked",
          color: getComputedStyle(readonlyUnchecked, "::before").color,
        },
        {
          state: "readonly checked",
          color: getComputedStyle(readonlyChecked, "::after").color,
        },
      ],
      surfaceColors: [
        surfaceColor("--cpr-background-window"),
        surfaceColor("--cpr-background-row-even"),
        surfaceColor("--cpr-background-row-odd"),
      ],
    };
    application.remove();
    return result;
  });
}

async function readFormControlColors(page) {
  return page.evaluate(() => {
    const application = document.createElement("section");
    application.className = "application themed";

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "Placeholder";

    const unchecked = document.createElement("input");
    unchecked.type = "checkbox";
    const checked = document.createElement("input");
    checked.type = "checkbox";
    checked.checked = true;

    const range = document.createElement("input");
    range.type = "range";

    const surfaceColor = (variable) => {
      const surface = document.createElement("div");
      surface.style.backgroundColor = `var(${variable})`;
      application.append(surface);
      return getComputedStyle(surface).backgroundColor;
    };

    application.append(textInput, unchecked, checked, range);
    document.body.append(application);

    const inputStyle = getComputedStyle(textInput);
    const uncheckedStyle = getComputedStyle(unchecked);
    const checkedStyle = getComputedStyle(checked);
    const rangeStyle = getComputedStyle(range);
    const result = {
      input: {
        background: inputStyle.backgroundColor,
        text: inputStyle.color,
        placeholder: getComputedStyle(textInput, "::placeholder").color,
      },
      checkbox: {
        unchecked: getComputedStyle(unchecked, "::before").color,
        checked: getComputedStyle(checked, "::after").color,
        semanticUnchecked: uncheckedStyle
          .getPropertyValue("--cpr-checkbox-unchecked-color")
          .trim(),
        mappedUnchecked: uncheckedStyle
          .getPropertyValue("--checkbox-background-color")
          .trim(),
        semanticChecked: checkedStyle
          .getPropertyValue("--cpr-background-toggle-checked")
          .trim(),
        mappedChecked: checkedStyle
          .getPropertyValue("--checkbox-checked-color")
          .trim(),
      },
      range: {
        track: rangeStyle.getPropertyValue("--range-track-color").trim(),
        trackBorder: rangeStyle
          .getPropertyValue("--range-track-border-color")
          .trim(),
        thumb: rangeStyle
          .getPropertyValue("--range-thumb-background-color")
          .trim(),
        thumbBorder: rangeStyle
          .getPropertyValue("--range-thumb-border-color")
          .trim(),
        semanticTrack: rangeStyle
          .getPropertyValue("--cpr-background-foundry-input")
          .trim(),
        semanticTrackBorder: rangeStyle
          .getPropertyValue("--cpr-background-chat-border")
          .trim(),
        semanticThumb: rangeStyle
          .getPropertyValue("--cpr-background-toggle-checked")
          .trim(),
        semanticThumbBorder: rangeStyle
          .getPropertyValue("--cpr-background-border")
          .trim(),
      },
      surfaceColors: [
        surfaceColor("--cpr-background-window"),
        surfaceColor("--cpr-background-row-even"),
        surfaceColor("--cpr-background-row-odd"),
      ],
    };
    application.remove();
    return result;
  });
}

test.beforeEach(async ({ page }) => {
  await gotoReadyWorld(page);
});

test.describe("CPR theme integration", () => {
  test("registers the optional Foundry theme as a client setting", async ({
    page: game,
  }) => {
    const setting = await game.evaluate((systemId) => {
      const config = window.game.settings.settings.get(
        `${systemId}.themeFoundry`,
      );
      return {
        scope: config.scope,
        config: config.config,
        default: config.default,
        name: config.name,
        hint: config.hint,
      };
    }, SYSTEM_ID);

    expect(setting).toEqual({
      scope: "client",
      config: true,
      default: true,
      name: "CPR.settings.themeFoundry.title",
      hint: "CPR.settings.themeFoundry.hint",
    });
  });

  test("themes an unconfigured native ApplicationV2 sheet", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    let macroId;
    try {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "theme", "dark");
        await game.settings.set(game.system.id, "themeFoundry", true);
      });

      const state = await game.evaluate(async () => {
        const macro = await Macro.create({
          name: "ApplicationV2 theme probe",
          type: "script",
          command: "",
        });
        await macro.sheet.render({ force: true });
        const element = macro.sheet.element;
        const rootStyle = getComputedStyle(document.documentElement);
        return {
          macroId: macro.id,
          elementId: element.id,
          classes: [...element.classList],
          background: getComputedStyle(element)
            .getPropertyValue("--background")
            .trim(),
          cprBackground: rootStyle
            .getPropertyValue("--cpr-background-window")
            .trim(),
        };
      });
      macroId = state.macroId;

      expect(state.classes).toContain("application");
      expect(state.classes).not.toContain("themed");
      expect(state.classes).not.toContain("window-app");
      expect(state.background).toBe(state.cprBackground);

      const headerButton = game
        .locator(`#${state.elementId} .window-header button.header-control`)
        .first();
      await expect(headerButton).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      const hoverColors = await headerButton.evaluate(() => {
        const cprProbe = document.createElement("span");
        cprProbe.style.backgroundColor = "var(--cpr-background-foundry-hover)";
        const foundryProbe = document.createElement("span");
        foundryProbe.style.backgroundColor = "var(--color-warm-2)";
        document.body.append(cprProbe, foundryProbe);
        const result = {
          cpr: getComputedStyle(cprProbe).backgroundColor,
          foundry: getComputedStyle(foundryProbe).backgroundColor,
        };
        cprProbe.remove();
        foundryProbe.remove();
        return result;
      });
      await headerButton.hover();
      await expect(headerButton).toHaveCSS("background-color", hoverColors.cpr);
      expect(hoverColors.cpr).not.toBe(hoverColors.foundry);
    } finally {
      if (macroId) {
        await game.evaluate(async (id) => {
          const macro = game.macros.get(id);
          await macro?.sheet.close();
          await macro?.delete();
        }, macroId);
      }
      await restoreSettings(game, original);
    }
  });

  test("always maps CPR windows without changing stock Foundry", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    try {
      await game.evaluate(async () => {
        const uiConfig = game.settings.get("core", "uiConfig");
        await game.settings.set("core", "uiConfig", {
          ...uiConfig,
          colorScheme: {
            ...uiConfig.colorScheme,
            applications: "dark",
            interface: "dark",
          },
        });
        await game.settings.set(game.system.id, "themeFoundry", false);
        await game.settings.set(game.system.id, "theme", "light");
      });

      await expect(game.locator("html")).toHaveAttribute(
        "data-cpr-theme",
        "light",
      );
      await expect(game.locator("html")).not.toHaveAttribute(
        "data-cpr-theme-foundry",
      );

      const tokens = await readThemeTokens(game);
      expect(tokens.cpr.background).toBe(tokens.cprBackground);
      expect(tokens.cpr.text).toBe(tokens.cprText);
      expect(tokens.stock.background).not.toBe(tokens.cprBackground);
      expect(tokens.stock.text).not.toBe(tokens.cprText);
      expect(tokens.cprContentButton).toBe(tokens.cprButtonBackground);
      expect(tokens.cprHeaderButton).not.toBe(tokens.cprContentButton);
      expect(tokens.legacy.text).not.toBe(tokens.cprText);
      expect(tokens.legacyButton).not.toBe(tokens.cprButtonBackground);
      expect(tokens.legacyContentBackground).toContain("parchment.jpg");
    } finally {
      await restoreSettings(game, original);
    }
  });

  test("keeps disabled checkboxes visible in both CPR variants", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    try {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "themeFoundry", false);
      });

      for (const variant of ["light", "dark"]) {
        await game.evaluate(
          async (theme) => game.settings.set(game.system.id, "theme", theme),
          variant,
        );
        await expect(game.locator("html")).toHaveAttribute(
          "data-cpr-theme",
          variant,
        );

        const colors = await readDisabledCheckboxColors(game);
        expect(colors.foundryColor).toBe(colors.semanticColor);
        for (const control of colors.controlColors) {
          for (const surfaceColor of colors.surfaceColors) {
            expect(
              contrastRatio(control.color, surfaceColor),
              `${variant} ${control.state}: ${control.color} on ${surfaceColor}`,
            ).toBeGreaterThanOrEqual(3);
          }
        }
      }
    } finally {
      await restoreSettings(game, original);
    }
  });

  test("keeps themed form control states distinct in both CPR variants", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    try {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "themeFoundry", true);
      });

      for (const variant of ["light", "dark"]) {
        await game.evaluate(
          async (theme) => game.settings.set(game.system.id, "theme", theme),
          variant,
        );
        await expect(game.locator("html")).toHaveAttribute(
          "data-cpr-theme",
          variant,
        );

        const colors = await readFormControlColors(game);
        expect(colors.input.placeholder).not.toBe(colors.input.text);
        expect(
          contrastRatio(colors.input.placeholder, colors.input.background),
          `${variant} placeholder contrast`,
        ).toBeGreaterThanOrEqual(3);

        expect(colors.checkbox.mappedUnchecked).toBe(
          colors.checkbox.semanticUnchecked,
        );
        expect(colors.checkbox.mappedChecked).toBe(
          colors.checkbox.semanticChecked,
        );
        for (const surfaceColor of colors.surfaceColors) {
          expect(
            contrastRatio(colors.checkbox.unchecked, surfaceColor),
            `${variant} unchecked checkbox contrast`,
          ).toBeGreaterThanOrEqual(3);
          expect(
            contrastRatio(colors.checkbox.checked, surfaceColor),
            `${variant} checked checkbox contrast`,
          ).toBeGreaterThanOrEqual(3);
        }

        expect(colors.range.track).toBe(colors.range.semanticTrack);
        expect(colors.range.trackBorder).toBe(colors.range.semanticTrackBorder);
        expect(colors.range.thumb).toBe(colors.range.semanticThumb);
        expect(colors.range.thumbBorder).toBe(colors.range.semanticThumbBorder);
      }
    } finally {
      await restoreSettings(game, original);
    }
  });

  test("keeps the main menu readable with the light CPR palette", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    try {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "themeFoundry", true);
        await game.settings.set(game.system.id, "theme", "light");
        await ui.menu.toggle();
      });
      await expect(game.locator("#menu")).toHaveClass(/active/);

      const colors = await game.evaluate(() => {
        const menu = document.querySelector("#menu");
        const heading = menu.querySelector("h2");
        const semanticProbe = document.createElement("span");
        semanticProbe.style.color = "var(--cpr-text-header)";
        menu.append(semanticProbe);
        const result = {
          heading: getComputedStyle(heading).color,
          semantic: getComputedStyle(semanticProbe).color,
        };
        semanticProbe.remove();
        return result;
      });
      expect(colors.heading).toBe(colors.semantic);
    } finally {
      await game.evaluate(async () => {
        if (ui.menu.rendered) await ui.menu.toggle();
      });
      await restoreSettings(game, original);
    }
  });

  test("themes hotbar macro slots and sidebar folder controls", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    const folderName = uniqueName("theme-folder");
    const macroName = uniqueName("broken-macro");
    let created;
    try {
      created = await game.evaluate(
        async ({ folderName, macroName }) => {
          const previousMacroId = game.user.hotbar[1] ?? null;
          const folder = await Folder.create({
            name: folderName,
            type: "Item",
          });
          const macro = await Macro.create({
            name: macroName,
            type: "script",
            command: "",
            img: `systems/${game.system.id}/missing-theme-probe.png`,
          });
          await game.user.assignHotbarMacro(macro, 1);
          await game.settings.set(game.system.id, "themeFoundry", true);
          return {
            folderId: folder.id,
            macroId: macro.id,
            previousMacroId,
          };
        },
        { folderName, macroName },
      );

      await openSidebarTab(game, "items");
      const folderHeader = game.locator(
        `#items li.folder[data-folder-id="${created.folderId}"] > .folder-header`,
      );
      const folderNameElement = folderHeader.locator(".folder-name");
      const folderGlyph = folderHeader.locator(":scope > i");
      const folderButtons = folderHeader.locator(".create-button");
      const macroSlot = game.locator('#hotbar .slot[data-slot="1"]');
      const macroImage = macroSlot.locator("img.slot-icon");
      await expect(folderHeader).toBeVisible();
      await expect(folderButtons).toHaveCount(2);
      await folderNameElement.click();
      await expect(folderButtons.first()).toBeVisible();
      await expect(macroImage).toBeVisible();
      await game.waitForFunction(() => {
        const image = document.querySelector(
          '#hotbar .slot[data-slot="1"] img.slot-icon',
        );
        return image?.complete && image.naturalWidth === 0;
      });

      for (const variant of ["light", "dark"]) {
        await game.evaluate(
          async (theme) => game.settings.set(game.system.id, "theme", theme),
          variant,
        );
        await expect(game.locator("html")).toHaveAttribute(
          "data-cpr-theme",
          variant,
        );

        const semantic = await game.evaluate(() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--cpr-text-normal)";
          probe.style.backgroundColor = "var(--cpr-background-border)";
          probe.style.borderColor = "var(--cpr-text-header)";
          probe.style.outlineColor = "var(--cpr-text-icon-highlight)";
          document.body.append(probe);
          const style = getComputedStyle(probe);
          const colors = {
            normal: style.color,
            border: style.backgroundColor,
            header: style.borderColor,
            highlight: style.outlineColor,
          };
          probe.remove();
          return colors;
        });

        await expect(macroImage).toHaveCSS("color", semantic.normal);
        await macroSlot.hover();
        await expect(macroSlot).toHaveCSS("border-color", semantic.border);
        const hotbarRadii = await macroSlot.evaluate((element) => {
          const slotStyle = getComputedStyle(element);
          const imageStyle = getComputedStyle(
            element.querySelector("img.slot-icon"),
          );
          const keyStyle = getComputedStyle(element.querySelector(".key"));
          return {
            border: Number.parseFloat(slotStyle.borderTopWidth),
            image: Number.parseFloat(imageStyle.borderTopRightRadius),
            key: Number.parseFloat(keyStyle.borderTopLeftRadius),
            slot: Number.parseFloat(slotStyle.borderTopRightRadius),
          };
        });
        expect(hotbarRadii.image + hotbarRadii.border).toBe(hotbarRadii.slot);
        expect(hotbarRadii.key + hotbarRadii.border).toBe(hotbarRadii.slot);

        await game.mouse.move(0, 0);
        await expect(folderNameElement).toHaveCSS("color", semantic.header);
        await expect(folderGlyph).toHaveCSS("color", semantic.header);
        for (let index = 0; index < 2; index += 1) {
          const button = folderButtons.nth(index);
          await expect(button).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
          );
          await expect(button).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
          await expect(button).toHaveCSS("color", semantic.header);
          const restingIndicator = await button.evaluate((element) => {
            const style = getComputedStyle(element, "::after");
            return {
              background: style.backgroundColor,
              color: style.color,
            };
          });
          expect(restingIndicator).toEqual({
            background: "rgba(0, 0, 0, 0)",
            color: semantic.header,
          });

          await folderHeader.hover();
          await expect(button).toBeVisible();
          await button.hover();
          await expect(button).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
          );
          await expect(button).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
          await expect(button).toHaveCSS("color", semantic.highlight);
          const hoverIndicator = await button.evaluate((element) => {
            const style = getComputedStyle(element, "::after");
            return {
              background: style.backgroundColor,
              color: style.color,
            };
          });
          expect(hoverIndicator).toEqual({
            background: "rgba(0, 0, 0, 0)",
            color: semantic.highlight,
          });
          await game.mouse.move(0, 0);
        }
      }
    } finally {
      if (created) {
        await game.evaluate(async ({ folderId, macroId, previousMacroId }) => {
          const previousMacro = previousMacroId
            ? game.macros.get(previousMacroId)
            : null;
          await game.user.assignHotbarMacro(previousMacro, 1);
          await game.macros.get(macroId)?.delete();
          await game.folders.get(folderId)?.delete();
        }, created);
      }
      await restoreSettings(game, original);
    }
  });

  test("extends an explicit variant to Foundry and follows Foundry in auto", async ({
    page: game,
  }) => {
    const original = await captureSettings(game);
    try {
      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "themeFoundry", false);
        await game.settings.set(game.system.id, "theme", "dark");
        await game.settings.set(game.system.id, "themeFoundry", true);
      });

      await expect(game.locator("html")).toHaveAttribute(
        "data-cpr-theme",
        "dark",
      );
      await expect(game.locator("html")).toHaveAttribute(
        "data-cpr-theme-foundry",
        "",
      );

      let state = await game.evaluate(() => ({
        colorScheme: game.settings.get("core", "uiConfig").colorScheme,
        bodyClasses: [...document.body.classList],
      }));
      expect(state.colorScheme.applications).toBe("dark");
      expect(state.colorScheme.interface).toBe("dark");
      expect(state.bodyClasses).toContain("theme-dark");

      let tokens = await readThemeTokens(game);
      expect(tokens.stock.background).toBe(tokens.cprBackground);
      expect(tokens.stock.text).toBe(tokens.cprText);
      expect(tokens.cprHeaderButton).not.toBe(tokens.cprContentButton);
      expect(tokens.legacy.text).not.toBe(tokens.cprText);
      expect(tokens.legacyButton).not.toBe(tokens.cprButtonBackground);
      expect(tokens.legacyContentBackground).toContain("parchment.jpg");

      await game.evaluate(async () => {
        await game.settings.set(game.system.id, "theme", "auto");
        const uiConfig = game.settings.get("core", "uiConfig");
        await game.settings.set("core", "uiConfig", {
          ...uiConfig,
          colorScheme: {
            ...uiConfig.colorScheme,
            applications: "light",
            interface: "light",
          },
        });
      });

      await expect(game.locator("html")).toHaveAttribute(
        "data-cpr-theme",
        "light",
      );
      state = await game.evaluate(() => ({
        colorScheme: game.settings.get("core", "uiConfig").colorScheme,
        bodyClasses: [...document.body.classList],
      }));
      expect(state.colorScheme.applications).toBe("light");
      expect(state.colorScheme.interface).toBe("light");
      expect(state.bodyClasses).toContain("theme-light");

      tokens = await readThemeTokens(game);
      expect(tokens.stock.background).toBe(tokens.cprBackground);
      expect(tokens.stock.text).toBe(tokens.cprText);
    } finally {
      await restoreSettings(game, original);
    }
  });
});
