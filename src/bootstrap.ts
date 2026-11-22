/** Парный bootstrap разницы средних двух конфигураций на одних и тех же вопросах. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BootResult { diff: number; lo: number; hi: number; shareAbove0: number; iters: number }

export function pairedBootstrap(a: number[], b: number[], iters = 2000, seed = 42): BootResult {
  const n = a.length;
  const rnd = mulberry32(seed);
  const d = a.map((x, i) => b[i] - x);
  const diffs: number[] = [];
  for (let it = 0; it < iters; it++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += d[Math.floor(rnd() * n)];
    diffs.push(s / n);
  }
  diffs.sort((x, y) => x - y);
  const q = (p: number) => diffs[Math.min(iters - 1, Math.floor(p * iters))];
  return {
    diff: d.reduce((s, x) => s + x, 0) / n,
    lo: q(0.025), hi: q(0.975),
    shareAbove0: diffs.filter((x) => x > 0).length / iters,
    iters,
  };
}
