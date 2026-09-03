import { describe, expect, it } from "vitest";

import {
  driveSetup,
  launchedWorldHasJoinScreen,
  reachInteractableSetup,
} from "../../tools/playwright/setup/foundry-setup.mjs";

class FakeLocator {
  constructor({ visible = false, onClick } = {}) {
    this.visible = visible;
    this.onClick = onClick;
    this.fill = async () => {};
    this.click = async () => {
      this.onClick?.();
    };
    this.check = async () => {};
  }

  first() {
    return this;
  }

  async waitFor() {
    if (!this.visible) {
      throw new Error("not visible");
    }
  }
}

class FakePage {
  constructor({
    licenseVisible = false,
    passwordVisible = false,
    initialPath = "/join",
    goBackVisible = false,
    joinNavigationError,
    joinScreenVisibleAfterNavigationError = false,
  } = {}) {
    this.licenseVisible = licenseVisible;
    this.passwordVisible = passwordVisible;
    this.goBackVisible = goBackVisible;
    this.joinNavigationError = joinNavigationError;
    this.joinScreenVisibleAfterNavigationError =
      joinScreenVisibleAfterNavigationError;
    this.joinScreenVisible = initialPath === "/join";
    this.currentUrl = `http://localhost:30001${initialPath}`;
    this.keyboard = {
      press: async () => {},
    };
    this.waitForLoadState = async () => {};
    this.evaluate = async () => {};
  }

  handleClick(selector) {
    if (
      this.goBackVisible &&
      (selector.includes('a:has-text("Go Back")') ||
        selector.includes('button:has-text("Go Back")'))
    ) {
      this.currentUrl = "http://localhost:30001/setup";
      this.goBackVisible = false;
    }
  }

  async goto(url) {
    if (url === "http://localhost:30001") {
      this.currentUrl = url;
      return;
    }
    this.currentUrl = url;
    if (url.endsWith("/join") && this.joinNavigationError) {
      this.joinScreenVisible = this.joinScreenVisibleAfterNavigationError;
      throw this.joinNavigationError;
    }
  }

  url() {
    return this.currentUrl;
  }

  locator(selector) {
    if (selector.includes('input[name="licenseKey"]')) {
      return new FakeLocator({ visible: this.licenseVisible });
    }

    if (
      selector.includes('a:has-text("Go Back")') ||
      selector.includes('button:has-text("Go Back")')
    ) {
      return new FakeLocator({
        visible: this.goBackVisible,
        onClick: () => this.handleClick(selector),
      });
    }

    if (selector.includes('select[name="userid"]')) {
      return new FakeLocator({ visible: this.joinScreenVisible });
    }

    if (
      selector.includes('input[name="adminPassword"]') ||
      selector.includes('input[name="password"]') ||
      selector.includes('input[type="password"]')
    ) {
      return new FakeLocator({ visible: this.passwordVisible });
    }

    return new FakeLocator({
      visible: false,
      onClick: () => this.handleClick(selector),
    });
  }
}

function expectAdminPasswordGuidance(message) {
  expect(message).toContain("FOUNDRY_ADMIN_PASS");
  expect(message).toContain("foundryconfig.json");
  expect(message).toContain("adminPassword");
  expect(message).toMatch(/\.env|environment|export/i);
}

function expectEnvOnlyGuidance(message, envKey) {
  expect(message).toContain(envKey);
  expect(message).not.toContain("foundryconfig.json");
  expect(message).toMatch(/\.env|environment|export/i);
}

describe("playwright Foundry setup messaging", () => {
  it("accepts an interrupted navigation that reaches the join screen", async () => {
    const page = new FakePage({
      initialPath: "/setup",
      joinNavigationError: new Error("interrupted by another navigation"),
      joinScreenVisibleAfterNavigationError: true,
    });
    const config = { url: "http://localhost:30001" };

    await expect(launchedWorldHasJoinScreen(page, config)).resolves.toBe(true);
  });

  it("preserves a navigation error when no join screen appears", async () => {
    const navigationError = new Error("join navigation failed");
    const page = new FakePage({
      initialPath: "/setup",
      joinNavigationError: navigationError,
    });
    const config = { url: "http://localhost:30001" };

    await expect(launchedWorldHasJoinScreen(page, config)).rejects.toBe(
      navigationError,
    );
  });

  it("keeps missing admin-password guidance on the supported config workflow", async () => {
    const page = new FakePage({ passwordVisible: true });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "",
      foundryKey: "licensed",
    };

    const error = await reachInteractableSetup(page, config).catch(
      (cause) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expectAdminPasswordGuidance(error.message);
  });

  it("applies the same admin-password guidance during fresh-world setup", async () => {
    const page = new FakePage({ passwordVisible: true, initialPath: "/setup" });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "",
      foundryKey: "licensed",
    };

    const error = await driveSetup(page, {
      config,
      worldId: "cprc-playwright-test",
    }).catch((cause) => cause);

    expect(error).toBeInstanceOf(Error);
    expectAdminPasswordGuidance(error.message);
  });

  it("keeps missing license-key guidance on the env workflow", async () => {
    const page = new FakePage({ licenseVisible: true });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "admin-secret",
      foundryKey: "",
    };

    const error = await reachInteractableSetup(page, config).catch(
      (cause) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expectEnvOnlyGuidance(error.message, "FOUNDRY_KEY");
  });

  it("keeps setup auth optional when no password form is present", async () => {
    const page = new FakePage({
      passwordVisible: false,
      initialPath: "/setup",
    });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "",
      foundryKey: "licensed",
    };

    await expect(reachInteractableSetup(page, config)).resolves.toBeUndefined();
  });

  it("leaves the join screen alone during fresh-world setup", async () => {
    const page = new FakePage({ passwordVisible: true, initialPath: "/join" });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "",
      foundryKey: "licensed",
    };

    await expect(
      driveSetup(page, {
        config,
        worldId: "cprc-playwright-test",
      }),
    ).resolves.toBeUndefined();
  });

  it("treats the auth route as the setup admin gate", async () => {
    const page = new FakePage({ passwordVisible: true, initialPath: "/auth" });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "",
      foundryKey: "licensed",
    };

    const error = await driveSetup(page, {
      config,
      worldId: "cprc-playwright-test",
    }).catch((cause) => cause);

    expect(error).toBeInstanceOf(Error);
    expectAdminPasswordGuidance(error.message);
  });

  it("recovers from the no-active-game page with Go Back", async () => {
    const page = new FakePage({
      passwordVisible: false,
      initialPath: "/no",
      goBackVisible: true,
    });
    const config = {
      url: "http://localhost:30001",
      foundryAdminPass: "",
      foundryKey: "licensed",
    };

    await expect(reachInteractableSetup(page, config)).resolves.toBeUndefined();
    expect(page.url()).toBe("http://localhost:30001/setup");
  });
});
