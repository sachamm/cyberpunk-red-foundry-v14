import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemUtils from "../../src/modules/utils/cpr-systemUtils.js";

describe("sheet DV token selection", () => {
  let actor;
  let token;

  beforeEach(() => {
    actor = { token: null };
    token = { actor, isOwner: true, document: { id: "selected" } };
    vi.stubGlobal("canvas", { ready: true, tokens: { controlled: [token] } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the selected linked character token", () => {
    expect(SystemUtils.GetDvToken(actor)).toBe(token.document);
  });

  it("does not use another actor's selected token", () => {
    token.actor = {};
    expect(SystemUtils.GetDvToken(actor)).toBeNull();
  });

  it("does not guess between multiple selected tokens for the same actor", () => {
    canvas.tokens.controlled.push({ ...token, document: { id: "second" } });
    expect(SystemUtils.GetDvToken(actor)).toBeNull();
  });

  it("requires a selected token the user owns", () => {
    token.isOwner = false;
    expect(SystemUtils.GetDvToken(actor)).toBeNull();
    canvas.tokens.controlled = [];
    expect(SystemUtils.GetDvToken(actor)).toBeNull();
  });

  it("preserves an unlinked actor's explicit token context", () => {
    actor.token = { object: {}, isOwner: true, id: "unlinked" };
    expect(SystemUtils.GetDvToken(actor)).toBe(actor.token);
  });

  it("does not resolve a token without an active canvas", () => {
    canvas.ready = false;
    expect(SystemUtils.GetDvToken(actor)).toBeNull();
  });
});
