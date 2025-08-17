/** Tiny mulberry32 PRNG for determinism without deps. */
export function prng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFromHex(hex: string) {
  // take first 8 hex chars
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

