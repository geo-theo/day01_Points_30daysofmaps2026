// Cell 05 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson to the notebook before running.
import * as cell05Htl from "npm:htl";

// Prepare the data, calculate the JT statistics, and display the results table.
// Pure JavaScript: no browser or Node-specific APIs.
function createJTCore() {
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
      if (!Number.isFinite(p.rating)) { missingRating++; continue; }
      // Use the existing categories; never derive or replace the band from distance.
      const index = bands.indexOf(p.distance_band);
      if (index < 0) { mismatches.push({fid: p.fid, distance: d, actual: p.distance_band}); continue; }
      const lower = index * 250, upper = (index + 1) * 250;
      if (d < lower || (index === 5 ? d > upper : d >= upper))
        mismatches.push({fid: p.fid, distance: d, actual: p.distance_band});
      rows.push({id: p.fid, band: index, distanceBand: p.distance_band, rating: p.rating, distance: d});
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
  return {bands, expectedCounts, prepare, pairwise, makeCalculator, rng, shuffle, permutationP, analyze};
}


const cell05Core = createJTCore();
const cell05Data = cell05Core.prepare(await FileAttachment("restaurants_paris.geojson").json());
const cell05Groups = cell05Core.bands.map((_, i) => cell05Data.rows.filter(r => r.band === i).map(r => r.rating));
const cell05Output = cell05Htl.html`<section><p>Running 9,999 permutations for each analysis…</p></section>`;
display(cell05Output);

// Run the expensive permutation calculations in a worker, with fixed seeds.
const cell05WorkerSource = `const createJTCore = ${createJTCore.toString()};
self.onmessage = ({data}) => { try { const core = createJTCore();
  self.postMessage({full: core.analyze(data, 20261102, 9999),
    near: core.analyze(data.slice(0, 2), 20261104, 9999),
    beyond: core.analyze(data.slice(2), 20261103, 9999)});
} catch (error) { self.postMessage({error: String(error)}); } };`;
const cell05WorkerUrl = URL.createObjectURL(new Blob([cell05WorkerSource], {type: "text/javascript"}));
const cell05Worker = new Worker(cell05WorkerUrl);
invalidation.then(() => { cell05Worker.terminate(); URL.revokeObjectURL(cell05WorkerUrl); });
const cell05Results = await new Promise((resolve, reject) => {
  cell05Worker.onerror = event => reject(new Error(event.message));
  cell05Worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data);
  cell05Worker.postMessage(cell05Groups);
}).finally(() => {
  cell05Worker.terminate(); URL.revokeObjectURL(cell05WorkerUrl);
});
{
  const fmt = x => Number.isFinite(x) ? x.toFixed(4) : "—";
  const full = cell05Results.full, near = cell05Results.near, beyond = cell05Results.beyond;
  const analyses = [full, near, beyond];
  const summaryRows = [["Restaurants", ...analyses.map(r => r.n)],
    ["JT statistic", ...analyses.map(r => r.observed)],
    ["Expected JT under random labeling", ...analyses.map(r => r.expected)],
    ["Cross-band pairs", ...analyses.map(r => r.pairs)],
    ["P: normalized favorable comparisons", ...analyses.map(r => fmt(r.probability))],
    ["D: directional dominance", ...analyses.map(r => fmt(r.dominance))],
    ["One-sided permutation p-value", ...analyses.map(r => fmt(r.p))]];
  const table = cell05Htl.html`<table style="border-collapse:collapse;width:100%;font:13px system-ui"><thead><tr><th>Statistic</th><th>0–1,500 m (primary)</th><th>0–&lt;500 m (exploratory)</th><th>500–1,500 m (exploratory)</th></tr></thead><tbody>${summaryRows.map(row => cell05Htl.html`<tr>${row.map(v => cell05Htl.html`<td style="border-top:1px solid #ddd;padding:6px">${v}</td>`)}</tr>`)}</tbody></table>`;
  cell05Output.replaceChildren(table);
}
