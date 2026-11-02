// New, independent Observable Notebooks 2.0 cell. Attach both GeoJSON files.
const distanceBandBuffers = await FileAttachment("eiffel_buffers.geojson").json();
const distanceBandRestaurants = await FileAttachment("restaurants_within1500m.geojson").json();

const distanceBandAnalysis = (() => {
  const permutations = 9999;
  const seed = 20261101; // Fixed seed makes the Monte Carlo p-value reproducible.
  const alpha = 0.05;

  // Buffer polygons are cumulative. Use their layer names to define disjoint
  // distance intervals instead of counting a restaurant in multiple polygons.
  const radii = [...new Set(distanceBandBuffers.features.map(feature => {
    const match = /^buffer_(\d+(?:\.\d+)?)m$/.exec(feature.properties?.layer ?? "");
    if (!match || Number(match[1]) <= 0) {
      throw new Error("Expected buffer layer names such as buffer_250m.");
    }
    return Number(match[1]);
  }))].sort((a, b) => a - b);
  if (radii.length < 2) throw new Error("At least two buffer distances are required.");

  const bands = radii.map((upper, i) => ({
    lower: i ? radii[i - 1] : 0,
    upper,
    label: `${i ? "(" : "["}${i ? radii[i - 1] : 0}, ${upper}] m`,
    total: 0,
    ratings: []
  }));
  let outsideOrInvalidDistance = 0;
  for (const feature of distanceBandRestaurants.features) {
    const d = feature.properties;
    const distance = d?.distance_from_eiffeltower_m;
    if (!Number.isFinite(distance) || distance < 0 || distance > radii[radii.length - 1]) {
      ++outsideOrInvalidDistance;
      continue;
    }
    const band = bands.find(b => distance <= b.upper);
    ++band.total;
    if (Number.isFinite(d.avg_rating) && d.avg_rating >= 1 && d.avg_rating <= 5) {
      band.ratings.push(d.avg_rating);
    }
  }

  // Linearly interpolated quartiles (the convention used by D3 quantile).
  function quantile(sorted, p) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const fraction = index - lower;
    return sorted[lower] + fraction * (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]);
  }

  function kruskalWallis(groups, iterations, initialSeed) {
    const active = groups.filter(group => group.length > 0);
    const sizes = active.map(group => group.length);
    const values = active.flat();
    const n = values.length;
    const k = sizes.length;
    const base = {n, k, df: Math.max(0, k - 1), H: null, p: null, permutations: iterations};
    if (k < 2) return {...base, reason: "At least two nonempty bands are required."};

    const sorted = values.map((value, index) => ({value, index})).sort((a, b) => a.value - b.value);
    const ranks = new Array(n);
    let tieSum = 0;
    for (let start = 0; start < n;) {
      let end = start + 1;
      while (end < n && sorted[end].value === sorted[start].value) ++end;
      const rank = (start + 1 + end) / 2;
      for (let i = start; i < end; ++i) ranks[sorted[i].index] = rank;
      const t = end - start;
      tieSum += t ** 3 - t;
      start = end;
    }
    const tieCorrection = 1 - tieSum / (n ** 3 - n);
    if (tieCorrection <= 0) return {...base, reason: "All included ratings are identical."};

    // Equivalent to the usual rank-sum formula, with less cancellation near H=0.
    function statistic(rankValues) {
      let offset = 0;
      let between = 0;
      for (const size of sizes) {
        let sum = 0;
        for (let j = 0; j < size; ++j) sum += rankValues[offset++];
        between += size * (sum / size - (n + 1) / 2) ** 2;
      }
      return 12 * between / (n * (n + 1) * tieCorrection);
    }
    const H = statistic(ranks);

    // Mulberry32 generator and Fisher–Yates shuffle. Permuting pooled ranks
    // preserves all ties and group sizes under the equal-distributions null.
    let state = initialSeed >>> 0;
    function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), state | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const shuffled = ranks.slice();
    let extreme = 0;
    const tolerance = 1e-12 * Math.max(1, H);
    for (let iteration = 0; iteration < iterations; ++iteration) {
      for (let i = n - 1; i > 0; --i) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (statistic(shuffled) >= H - tolerance) ++extreme;
    }
    // Plus-one correction: a randomized permutation p-value is never zero.
    const p = (extreme + 1) / (iterations + 1);
    return {...base, H, p, tieCorrection, seed: initialSeed, reason: null};
  }

  const test = kruskalWallis(bands.map(b => b.ratings), permutations, seed);
  const summaries = bands.map(band => {
    const sorted = band.ratings.slice().sort((a, b) => a - b);
    return {
      label: band.label,
      total: band.total,
      n: sorted.length,
      omitted: band.total - sorted.length,
      median: quantile(sorted, 0.5),
      q1: quantile(sorted, 0.25),
      q3: quantile(sorted, 0.75)
    };
  });
  return {bands: summaries, test, alpha, outsideOrInvalidDistance};
})();

display((() => {
  const {bands, test, alpha, outsideOrInvalidDistance} = distanceBandAnalysis;
  const format = value => value === null ? "—" : value.toFixed(2);
  const conclusion = test.p === null ? test.reason
    : test.p < alpha
      ? "The test finds evidence of differences in rating distributions across distance bands (α = 0.05). It does not identify which bands differ."
      : "The test does not find evidence of differences in rating distributions across distance bands at α = 0.05; this does not establish that the bands are equivalent.";
  return htl.html`<section style="padding: 16px; background: white; color: #111827; font-family: system-ui, sans-serif;">
    <h3 style="margin: 0 0 8px;">Distance-band analysis · Kruskal–Wallis</h3>
    <p style="margin: 0 0 12px; font-weight: 600;">
      H = ${test.H === null ? "N/A" : test.H.toFixed(3)} · df = ${test.df}
      · permutation p = ${test.p === null ? "N/A" : test.p.toFixed(4)}
      · n = ${test.n.toLocaleString("en-US")}
    </p>
    <div style="overflow-x: auto;">
      <table style="border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums;">
        <thead><tr>${["Distance band", "Rated n", "Unrated / invalid", "Median", "Q1", "Q3"].map(label =>
          htl.html`<th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">${label}</th>`
        )}</tr></thead>
        <tbody>${bands.map(b => htl.html`<tr>
          ${[b.label, b.n, b.omitted, format(b.median), format(b.q1), format(b.q3)].map(value =>
            htl.html`<td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${value}</td>`
          )}
        </tr>`)}</tbody>
      </table>
    </div>
    <p style="margin: 12px 0 8px;">${conclusion}</p>
    <p style="margin: 0; color: #4b5563; font-size: 12px;">
      Bands are disjoint: [0, 250] includes both endpoints; (250, 500] excludes 250 and includes 500, and so on.
      Each restaurant has equal weight. Missing or invalid ratings are excluded.
      ${outsideOrInvalidDistance} records excluded for out-of-range or invalid distances.
      The test uses average ranks, a tie correction, and ${test.permutations.toLocaleString("en-US")} permutations with a fixed seed.
      The p-value is a Monte Carlo estimate, not an exact or chi-square p-value.
      Empty bands are omitted from the test. The test assumes independent observations; nearby restaurants may be spatially related.
      These observational results do not establish a causal effect of distance.
    </p>
  </section>`;
})());
