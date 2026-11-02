// Pure JavaScript: no browser or Node-specific APIs.
export function createJTCore() {
  const bands = ["<250m", "<500m", "<750m", "<1000m", "<1250m", "<1500m"];
  const expectedCounts = [9, 49, 106, 254, 320, 332];
  function prepare(geojson) {
    if (!Array.isArray(geojson?.features)) throw Error("Expected a GeoJSON FeatureCollection with features.");
    const rows = [], mismatches = [];
    let missingDistance = 0, missingRating = 0;
    for (const feature of geojson.features) {
      const p = feature.properties ?? {}, d = p.distance_from_eiffeltower_m;
      if (!Number.isFinite(d) || d < 0) { missingDistance++; continue; }
      if (d > 1500) continue;
      // Half-open bands, except that the last includes exactly 1,500 m.
      const index = Math.min(Math.floor(d / 250), 5);
      if (p.distance_band !== bands[index]) mismatches.push({fid: p.fid, distance: d, actual: p.distance_band, expected: bands[index]});
      if (!Number.isFinite(p.rating)) { missingRating++; continue; }
      rows.push({band: index, rating: p.rating, distance: d});
    }
    const counts = bands.map((_, i) => rows.filter(r => r.band === i).length);
    return {rows, counts, mismatches, missingDistance, missingRating,
      countDiscrepancies: counts.map((actual, i) => ({band: bands[i], actual, expected: expectedCounts[i]})).filter(x => x.actual !== x.expected)};
  }
  function pairwise(groups) {
    let jt = 0;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++)
      for (const a of groups[i]) for (const b of groups[j]) jt += b > a ? 1 : b === a ? 0.5 : 0;
    return jt;
  }
  function makeCalculator(groups) {
    const values = [...new Set(groups.flat())].sort((a, b) => a - b);
    const ranks = new Map(values.map((v, i) => [v, i + 1]));
    const sizes = groups.map(g => g.length);
    const initial = groups.flat().map(v => ranks.get(v));
    function calculate(rankValues) {
      const tree = new Int32Array(values.length + 1);
      let jt = 0, previous = 0, start = 0;
      for (const size of sizes) {
        for (let i = start; i < start + size; i++) {
          const rank = rankValues[i]; let less = 0, through = 0;
          for (let k = rank - 1; k > 0; k -= k & -k) less += tree[k];
          for (let k = rank; k > 0; k -= k & -k) through += tree[k];
          jt += less + (through - less) / 2;
        }
        for (let i = start; i < start + size; i++)
          for (let k = rankValues[i]; k < tree.length; k += k & -k) tree[k]++;
        previous += size; start = previous;
      }
      return jt;
    }
    return {initial, sizes, calculate};
  }
  function rng(seed) {
    let state = seed >>> 0;
    return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0; };
  }
  // Rejection sampling avoids modulo bias in each Fisher–Yates index.
  function shuffle(a, randomUint32) {
    for (let i = a.length - 1; i > 0; i--) {
      const range = i + 1, limit = Math.floor(4294967296 / range) * range;
      let x; do { x = randomUint32(); } while (x >= limit);
      const j = x % range; [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function permutationP(observed, samples) { return (1 + samples.filter(x => x >= observed).length) / (samples.length + 1); }
  function analyze(groups, seed = 20261102, permutations = 9999) {
    if (groups.length < 2 || groups.some(g => !g.length)) throw Error("Each ordered analysis requires at least two nonempty groups.");
    if (!Number.isInteger(permutations) || permutations < 1) throw Error("Permutations must be a positive integer.");
    const calc = makeCalculator(groups), observed = calc.calculate(calc.initial);
    let pairs = 0; for (let i = 0; i < calc.sizes.length; i++) for (let j = i + 1; j < calc.sizes.length; j++) pairs += calc.sizes[i] * calc.sizes[j];
    const random = rng(seed), ranks = calc.initial.slice(), distribution = [];
    for (let i = 0; i < permutations; i++) { shuffle(ranks, random); distribution.push(calc.calculate(ranks)); }
    const p = permutationP(observed, distribution), probability = observed / pairs;
    return {n: ranks.length, sizes: calc.sizes, observed, expected: pairs / 2, pairs, probability, dominance: 2 * probability - 1, p, permutations, seed, distribution};
  }
  function quantile(sorted, p) { const v = (sorted.length - 1) * p, i = Math.floor(v); return sorted[i] + (v - i) * (sorted[Math.ceil(v)] - sorted[i]); }
  function describe(groups) { return groups.map((g, i) => { const s = [...g].sort((a,b) => a-b); return {band: bands[i], n: s.length, mean: s.length ? s.reduce((a,b)=>a+b,0)/s.length : null, median: s.length ? quantile(s,.5) : null, q1: s.length ? quantile(s,.25) : null, q3: s.length ? quantile(s,.75) : null}; }); }
  return {bands, expectedCounts, prepare, pairwise, makeCalculator, rng, shuffle, permutationP, analyze, describe};
}
