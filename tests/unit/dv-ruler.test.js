import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let overrideRulerFunctions;
let Ruler;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("foundry", {
    ...foundry,
    abstract: { DataModel: { prototype: { validate: () => true } } },
  });
  Ruler = class {
    user = { isSelf: true };
    context = { distance: { total: "1,000" } };
    _getWaypointLabelContext() {
      return this.context;
    }
  };
  vi.stubGlobal("CONFIG", { Canvas: { rulerClass: Ruler } });
  vi.stubGlobal("canvas", {
    tokens: {
      controlled: [
        {
          document: {
            getFlag: () => ({
              name: "DV Sniper Rifle",
              table: { "0_6": "30", "801_1600": "25" },
            }),
          },
        },
      ],
    },
  });
  ({ default: overrideRulerFunctions } =
    await import("../../src/modules/system/overrides.js"));
  overrideRulerFunctions();
});

afterEach(() => vi.unstubAllGlobals());

describe("DV ruler", () => {
  it("uses measured distance rather than localized display text", () => {
    const context = new Ruler()._getWaypointLabelContext(
      { measurement: { distance: 1000 } },
      {},
    );
    expect(context.dvLabel).toBe("DV: 25 Sniper Rifle");
  });

  it("matches the ruler's displayed precision at range boundaries", () => {
    const context = new Ruler()._getWaypointLabelContext(
      { measurement: { distance: 6.000000001 } },
      {},
    );
    expect(context.dvLabel).toBe("DV: 30 Sniper Rifle");
  });

  it("does not add the local token's DV to another user's measurement", () => {
    const ruler = new Ruler();
    ruler.user.isSelf = false;
    expect(
      ruler._getWaypointLabelContext({ measurement: { distance: 1000 } }, {}),
    ).not.toHaveProperty("dvLabel");
  });

  it("keeps measurement working without a selected token", () => {
    canvas.tokens.controlled = [];
    expect(
      new Ruler()._getWaypointLabelContext(
        { measurement: { distance: 1000 } },
        {},
      ),
    ).not.toHaveProperty("dvLabel");
  });
});
