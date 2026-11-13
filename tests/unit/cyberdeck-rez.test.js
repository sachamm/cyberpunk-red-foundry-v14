import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/item/cpr-item.js", () => ({ default: class {} }));
vi.mock("../../src/modules/rolls/cpr-rolls.js", () => ({}));
import CPRCyberdeckItem from "../../src/modules/item/types/cpr-cyberdeck.js";

afterEach(() => vi.unstubAllGlobals());

function programWithToken(value) {
  const actor = { update: vi.fn().mockResolvedValue(undefined) };
  const program = {
    system: { class: "blackice", rez: { value, max: 25 } },
    flags: { "cyberpunk-red-core": { sceneId: "inactive", biTokenId: "ice" } },
    update: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal("game", {
    system: { id: "cyberpunk-red-core" },
    scenes: new Map([["inactive", { tokens: new Map([["ice", { actor }]]) }]]),
  });
  return { program, actor };
}

describe("Black ICE REZ synchronization", () => {
  it("resets both the program and its token in an inactive scene", async () => {
    const { program, actor } = programWithToken(24);
    await new CPRCyberdeckItem().resetRezProgram(program);
    expect(actor.update).toHaveBeenCalledWith({ "system.stats.rez.value": 25 });
    expect(program.update).toHaveBeenCalledWith({ "system.rez.value": 25 });
  });

  it("clamps damage at zero for both representations", async () => {
    const { program, actor } = programWithToken(1);
    await new CPRCyberdeckItem().reduceRezProgram(program, 3);
    expect(actor.update).toHaveBeenCalledWith({ "system.stats.rez.value": 0 });
    expect(program.update).toHaveBeenCalledWith({ "system.rez.value": 0 });
  });

  it("still changes program REZ when the linked scene has been deleted", async () => {
    const { program, actor } = programWithToken(5);
    game.scenes.clear();
    await new CPRCyberdeckItem().reduceRezProgram(program);
    expect(actor.update).not.toHaveBeenCalled();
    expect(program.update).toHaveBeenCalledWith({ "system.rez.value": 4 });
  });
});
