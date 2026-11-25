/** Small deterministic PRNG (mulberry32) so the demo dataset is reproducible. */
export function createRng(seed: number) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const pickN = <T>(items: readonly T[], n: number): T[] => shuffle(items).slice(0, Math.max(0, n));

  const chance = (p: number): boolean => next() < p;

  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = next() * total;
    for (const [value, w] of entries) {
      roll -= w;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  };

  return { next, int, pick, pickN, shuffle, chance, weighted };
}

export type Rng = ReturnType<typeof createRng>;
