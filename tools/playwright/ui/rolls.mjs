export async function rollType(page, factory, args, dieFaces, faces) {
  return page.evaluate(
    async ({ factory, args, dieFaces, faces }) => {
      const sys = game.system.id;
      const R = await import(`/systems/${sys}/modules/rolls/cpr-rolls.js`);
      const original = CONFIG.Dice.randomUniform;
      const queue = faces.map((f) => 1 - (f - 0.5) / dieFaces);
      let i = 0;
      CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
      try {
        const roll = R[factory].create(...args);
        await roll.roll();
        return {
          cls: roll.constructor.name,
          isRoll: roll instanceof foundry.dice.Roll,
          resultTotal: roll.resultTotal,
          total: roll.total,
          finite: Number.isFinite(roll.resultTotal),
          critSuccess: roll.wasCritSuccess(),
          critFail: roll.wasCritFail(),
        };
      } finally {
        CONFIG.Dice.randomUniform = original;
      }
    },
    { factory, args, dieFaces, faces },
  );
}
