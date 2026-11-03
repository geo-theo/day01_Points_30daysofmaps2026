// CELL 11.1 — Data and settings. Paste each numbered section into a separate
// Observable Notebooks 2.0 JavaScript/TypeScript cell, in order.
// First attach restaurants_paris.geojson with exactly that name.
import * as cell11Plot from "npm:@observablehq/plot";
import * as cell11Inputs from "npm:@observablehq/inputs";
import {html as cell11Html} from "npm:htl";

const cell11Minimum = 20; // At least two observations per side are required.
const cell11PermutationCount = 9999;
const cell11BootstrapCount = 1000;
const cell11Seed = 20261102;
const cell11GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
if (cell11GeoJSON?.type !== "FeatureCollection" || !Array.isArray(cell11GeoJSON.features))
  throw new Error("restaurants_paris.geojson must be a GeoJSON FeatureCollection.");
const cutpointData = cell11GeoJSON.features.map(({properties: p}) => ({
  rating: p?.rating, distance: p?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && d.rating >= 1 && d.rating <= 5 &&
  Number.isFinite(d.distance) && d.distance >= 0 && d.distance <= 1500)
  .sort((a, b) => a.distance - b.distance);
if (!Number.isInteger(cell11Minimum) || cell11Minimum < 2)
  throw new Error("The minimum group size must be an integer of at least 2.");
if (!Number.isInteger(cell11PermutationCount) || cell11PermutationCount < 1 ||
    !Number.isInteger(cell11BootstrapCount) || cell11BootstrapCount < 1)
  throw new Error("Simulation counts must be positive integers.");
if (cutpointData.length < 2 * cell11Minimum || !cutpointData.every(d =>
  Number.isFinite(d.rating) && Number.isFinite(d.distance)))
  throw new Error("Insufficient or invalid prepared observations.");
display(cell11Html`<p><b>Usable restaurants:</b> ${cutpointData.length}; within 250 m: ${cutpointData.filter(d => d.distance <= 250).length}. Ratings and distances are finite; both endpoints of the 0–1,500 m range are included.</p>`);

// CELL 11.2 — Reusable functions and synthetic validation.
// Data must be sorted by distance; centered sums reduce cancellation.
function cell11Scan(data, minimum, ratings = null) {
  if (!Number.isInteger(minimum) || minimum < 2) throw new Error("Minimum must be at least 2.");
  const n = data.length;
  if (ratings && ratings.length !== n) throw new Error("Ratings length mismatch.");
  const values = ratings || data.map(d => d.rating);
  let total = 0, totalSq = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(data[i].distance) || !Number.isFinite(values[i]) ||
        (i && data[i].distance < data[i - 1].distance)) throw new Error("Scan requires finite, distance-sorted data.");
    const x = values[i] - 3;
    total += x; totalSq += x * x;
  }
  let sum = 0, sumSq = 0;
  const results = [];
  for (let i = 1; i < n; i++) {
    const x = values[i - 1] - 3;
    sum += x; sumSq += x * x;
    if (i < minimum || n - i < minimum || data[i - 1].distance === data[i].distance) continue;
    const outsideSum = total - sum;
    // Tiny negative values from floating point cancellation are clamped to zero.
    const vi = Math.max(0, (sumSq - sum * sum / i) / (i - 1));
    const vo = Math.max(0, (totalSq - sumSq - outsideSum * outsideSum / (n - i)) / (n - i - 1));
    const mi = 3 + sum / i, mo = 3 + outsideSum / (n - i);
    const se2 = vi / i + vo / (n - i);
    // A zero or undefined standard error has no defined Welch statistic.
    const t = Number.isFinite(se2) && se2 > 1e-14 ? (mo - mi) / Math.sqrt(se2) : null;
    results.push({radius: data[i - 1].distance + (data[i].distance - data[i - 1].distance) / 2,
      n_inside: i, n_outside: n - i, mean_inside: mi, mean_outside: mo,
      variance_inside: vi, variance_outside: vo, rating_difference: mo - mi,
      t_statistic: t, inside_observation: data[i - 1], outside_observation: data[i]});
  }
  return results;
}
function cell11Best(rows, key = "t_statistic") {
  // In a tie, keep the first (smallest) radius. Negative maxima are retained.
  return rows.reduce((best, row) => Number.isFinite(row[key]) &&
    (!best || row[key] > best[key]) ? row : best, null);
}
function cell11Random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cell11Shuffle(values, random) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}
function cell11Quantile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * p;
  const lo = Math.floor(index), fraction = index - lo;
  return sorted[lo] + fraction * (sorted[Math.ceil(index)] - sorted[lo]);
}
function cell11SD(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1));
}
function cell11Permute(data, minimum, observed, iterations, seed) {
  const random = cell11Random(seed), ratings = data.map(d => d.rating), maxima = [];
  let exceedances = 0;
  for (let b = 0; b < iterations; b++) {
    cell11Shuffle(ratings, random);
    const best = cell11Best(cell11Scan(data, minimum, ratings));
    // Silently dropping an undefined permutation would change the null distribution.
    if (!best) throw new Error(`Permutation ${b + 1} has no defined Welch statistic; the global test cannot be calculated for these data.`);
    maxima.push(best.t_statistic);
    if (best.t_statistic >= observed) exceedances++;
  }
  return {observed, maxima, exceedances, iterations, p: (1 + exceedances) / (iterations + 1),
    percentile95: cell11Quantile(maxima, 0.95)};
}
function cell11Bootstrap(data, minimum, iterations, seed) {
  const random = cell11Random(seed), samples = [];
  let invalid = 0;
  for (let b = 0; b < iterations; b++) {
    const resample = Array.from({length: data.length}, () => data[Math.floor(random() * data.length)])
      .sort((a, b) => a.distance - b.distance);
    const best = cell11Best(cell11Scan(resample, minimum));
    if (best) samples.push({radius: best.radius, rating_difference: best.rating_difference});
    else invalid++;
  }
  const radii = samples.map(d => d.radius);
  return {samples, invalid, iterations, median: cell11Quantile(radii, 0.5),
    lower: cell11Quantile(radii, 0.025), upper: cell11Quantile(radii, 0.975), sd: cell11SD(radii)};
}
// Known best split at 2.5; duplicates stay together; constant data have no t.
const cell11TestData = [1, 2, 3, 4].map((distance, i) => ({distance, rating: [1, 2, 4, 5][i]}));
const cell11TestBest = cell11Best(cell11Scan(cell11TestData, 2));
const cell11DuplicateTest = [1, 1, 1, 2, 3, 4].map((distance, i) => ({distance, rating: [1, 2, 3, 4, 4, 5][i]}));
if (cell11TestBest?.radius !== 2.5 || Math.abs(cell11TestBest.t_statistic - 3 / Math.sqrt(0.5)) > 1e-10 ||
    cell11Scan(cell11DuplicateTest, 2).some(row => row.n_inside === 2) ||
    cell11Best(cell11Scan(cell11TestData.map(d => ({...d, rating: 3})), 2)) !== null)
  throw new Error("Cell 11 synthetic validation failed.");
display(cell11Html`<p>Cutpoint function checks passed: known split, duplicate distances, and zero variance.</p>`);

// CELL 11.3 — Observed cutpoints and primary result.
const cutpointResults = cell11Scan(cutpointData, cell11Minimum);
const cell11Optimal = cell11Best(cutpointResults);
if (!cell11Optimal) throw new Error("No eligible cutpoint has a defined Welch statistic.");
const optimalRadius = cell11Optimal.radius;
const cell11RawOptimal = cell11Best(cutpointResults, "rating_difference");
const cell11Format = (x, digits = 3) => Number.isFinite(x) ? x.toFixed(digits) : "unavailable";
display(cell11Html`<h3>Observed cutpoint analysis</h3>`);
display(cell11Inputs.table([
  {statistic: "Optimal radius (m)", result: cell11Format(optimalRadius, 2)},
  {statistic: "Restaurants inside", result: cell11Optimal.n_inside},
  {statistic: "Restaurants outside", result: cell11Optimal.n_outside},
  {statistic: "Mean rating inside", result: cell11Format(cell11Optimal.mean_inside)},
  {statistic: "Mean rating outside", result: cell11Format(cell11Optimal.mean_outside)},
  {statistic: "Outside − inside (stars)", result: cell11Format(cell11Optimal.rating_difference)},
  {statistic: "Maximum Welch t-statistic", result: cell11Format(cell11Optimal.t_statistic)},
  {statistic: "Greatest raw difference radius (m)", result: cell11Format(cell11RawOptimal.radius, 2)},
  {statistic: "Greatest raw difference (stars)", result: cell11Format(cell11RawOptimal.rating_difference)}
]));
display(cell11Html`<p>The selected midpoint lies between observed distances ${cell11Format(cell11Optimal.inside_observation.distance, 6)} m (inside) and ${cell11Format(cell11Optimal.outside_observation.distance, 6)} m (outside). The midpoint is representative of this interval, not a precisely measured boundary.</p>`);

// CELL 11.4 — One-sided max-statistic permutation test (may take a moment).
const cell11Permutation = cell11Permute(cutpointData, cell11Minimum, cell11Optimal.t_statistic,
  cell11PermutationCount, cell11Seed);
display(cell11Html`<p><b>Global permutation test:</b> observed maximum t = ${cell11Format(cell11Permutation.observed)}; p = ${cell11Format(cell11Permutation.p, 4)}; 95th percentile of permutation maxima = ${cell11Format(cell11Permutation.percentile95)} (${cell11PermutationCount.toLocaleString()} permutations; seed ${cell11Seed}).</p>`);

// CELL 11.5 — Paired restaurant bootstrap (may take a moment).
const cell11BootstrapResult = cell11Bootstrap(cutpointData, cell11Minimum, cell11BootstrapCount, cell11Seed + 1);
if (!cell11BootstrapResult.samples.length) throw new Error("No bootstrap resample produced a defined optimum.");
display(cell11Html`<p><b>Bootstrap stability:</b> median ${cell11Format(cell11BootstrapResult.median, 1)} m; descriptive 2.5th–97.5th percentile range ${cell11Format(cell11BootstrapResult.lower, 1)}–${cell11Format(cell11BootstrapResult.upper, 1)} m; SD ${cell11Format(cell11BootstrapResult.sd, 1)} m. ${cell11BootstrapResult.invalid} of ${cell11BootstrapCount} resamples had no defined optimum and were excluded. This is a descriptive stability range, not automatically a confidence interval, and ordinary restaurant resampling does not account for spatial dependence.</p>`);

// CELL 11.6 — Welch statistic curve.
display(cell11Plot.plot({width: 900, height: 360, marginLeft: 65,
  x: {label: "Distance threshold from Eiffel Tower (m)"}, y: {label: "Welch-style t-statistic"},
  marks: [cell11Plot.ruleY([0], {stroke: "#999"}),
    cell11Plot.ruleY([cell11Permutation.percentile95], {stroke: "#b45309", strokeDasharray: "6,4"}),
    cell11Plot.ruleX([250, 500], {stroke: "#ccc", strokeDasharray: "3,4"}),
    cell11Plot.lineY(cutpointResults, {x: "radius", y: "t_statistic", stroke: "#245a81"}),
    cell11Plot.ruleX([optimalRadius], {stroke: "#b42318", strokeWidth: 2})]}));
display(cell11Html`<p>Blue: observed t-statistic; red: selected radius; dashed orange: 95th percentile of permutation maxima; gray: 250 and 500 m. The displayed percentile is descriptive; use the reported Monte Carlo p-value for the 0.05 decision.</p>`);

// CELL 11.7 — Cumulative rating differences.
display(cell11Plot.plot({width: 900, height: 360, marginLeft: 65,
  x: {label: "Distance threshold from Eiffel Tower (m)"}, y: {label: "Mean rating outside − inside (stars)"},
  marks: [cell11Plot.ruleY([0], {stroke: "#999"}),
    cell11Plot.ruleX([250, 500], {stroke: "#ccc", strokeDasharray: "3,4"}),
    cell11Plot.lineY(cutpointResults, {x: "radius", y: "rating_difference", stroke: "#245a81"}),
    cell11Plot.ruleX([optimalRadius], {stroke: "#b42318", strokeWidth: 2})]}));
display(cell11Html`<p>Each point compares all restaurants inside the radius with all restaurants outside it through 1,500 m; these are cumulative comparisons, not distance bands.</p>`);

// CELL 11.8 — Permutation maximum distribution.
display(cell11Plot.plot({width: 900, height: 330,
  x: {label: "Maximum Welch t-statistic under permutation"}, y: {label: "Permutations"},
  marks: [cell11Plot.rectY(cell11Permutation.maxima, cell11Plot.binX({y: "count"}, {x: d => d, thresholds: 35, fill: "#a9c5d8"})),
    cell11Plot.ruleX([cell11Permutation.percentile95], {stroke: "#b45309", strokeDasharray: "6,4", strokeWidth: 2}),
    cell11Plot.ruleX([cell11Permutation.observed], {stroke: "#b42318", strokeWidth: 2})]}));
display(cell11Html`<p>Red: observed maximum t = ${cell11Format(cell11Permutation.observed)}; dashed orange: permutation 95th percentile = ${cell11Format(cell11Permutation.percentile95)}; global one-sided p = ${cell11Format(cell11Permutation.p, 4)}.</p>`);

// CELL 11.9 — Bootstrap optimum distribution.
display(cell11Plot.plot({width: 900, height: 330,
  x: {label: "Bootstrap optimal radius (m)"}, y: {label: "Bootstrap resamples"},
  marks: [cell11Plot.rectY(cell11BootstrapResult.samples, cell11Plot.binX({y: "count"}, {x: "radius", thresholds: 35, fill: "#a9c5d8"})),
    cell11Plot.ruleX([cell11BootstrapResult.lower, cell11BootstrapResult.upper], {stroke: "#b45309", strokeDasharray: "6,4", strokeWidth: 2}),
    cell11Plot.ruleX([cell11BootstrapResult.median], {stroke: "#287a50", strokeWidth: 2}),
    cell11Plot.ruleX([optimalRadius], {stroke: "#b42318", strokeWidth: 2})]}));
display(cell11Html`<p>Red: observed optimum; green: bootstrap median; dashed orange: descriptive 2.5th and 97.5th percentiles. Overlapping markers can obscure one another.</p>`);

// CELL 11.10 — Exploratory minimum-group-size sensitivity; no alternative p-values.
const cell11Sensitivity = [9, 10, 20, 30, 50].map(minimum => {
  const best = cell11Best(cell11Scan(cutpointData, minimum));
  return {minimum, radius: best?.radius ?? null, n_inside: best?.n_inside ?? null,
    n_outside: best?.n_outside ?? null, rating_difference: best?.rating_difference ?? null,
    t_statistic: best?.t_statistic ?? null};
});
display(cell11Html`<h3>Exploratory sensitivity to minimum group size</h3>`);
display(cell11Inputs.table(cell11Sensitivity));
const cell11SensitivityRadii = cell11Sensitivity.map(d => d.radius).filter(Number.isFinite);
const cell11SensitivitySpread = Math.max(...cell11SensitivityRadii) - Math.min(...cell11SensitivityRadii);
display(cell11Html`<p>Eligible configurations select radii from ${cell11Format(Math.min(...cell11SensitivityRadii), 1)} to ${cell11Format(Math.max(...cell11SensitivityRadii), 1)} m, a spread of ${cell11Format(cell11SensitivitySpread, 1)} m. Significance for an alternative constraint requires its own permutation scan.</p>`);

// CELL 11.11 — Results summary, based on the already-computed objects.
const cell11Significant = cell11Permutation.p < 0.05;
// These distance spreads are descriptive yardsticks, not statistical tests.
const cell11BootstrapWidth = cell11BootstrapResult.upper - cell11BootstrapResult.lower;
const cell11BootstrapDescription = cell11BootstrapWidth > 250 ? "varies substantially" : "is comparatively concentrated";
const cell11SensitivityDescription = cell11SensitivitySpread > 100 ? "varies substantially" : "is comparatively similar";
const cell11Direction = cell11Optimal.rating_difference > 0 ? "lower" : cell11Optimal.rating_difference < 0 ? "higher" : "equal";
const cell11Support = cell11Significant && cell11Optimal.rating_difference > 0
  ? "The significant separation is consistent with the hypothesized direction."
  : cell11Optimal.rating_difference > 0
    ? "The observed difference is in the hypothesized direction, but the global test does not provide evidence at the 0.05 level."
    : "The selected separation is not in the hypothesized direction, so it does not support that hypothesis.";
display(cell11Html`<section>
  <h3>Results summary</h3>
  <p>The strongest standardized inside-versus-outside separation occurs at a representative radius of <b>${cell11Format(optimalRadius, 1)} m</b> (between observed distances ${cell11Format(cell11Optimal.inside_observation.distance, 3)} and ${cell11Format(cell11Optimal.outside_observation.distance, 3)} m). Mean ratings are ${cell11Format(cell11Optimal.mean_inside)} inside (n = ${cell11Optimal.n_inside}) and ${cell11Format(cell11Optimal.mean_outside)} outside (n = ${cell11Optimal.n_outside}); inside ratings are ${cell11Direction}, with outside minus inside = ${cell11Format(cell11Optimal.rating_difference)} stars. The one-sided global permutation p-value is <b>${cell11Format(cell11Permutation.p, 4)}</b>, ${cell11Significant ? "below" : "not below"} 0.05 after searching the eligible radii. ${cell11Support}</p>
  <p>The radius ${cell11BootstrapDescription} across bootstrap resamples: median ${cell11Format(cell11BootstrapResult.median, 1)} m, descriptive 2.5th–97.5th percentile range ${cell11Format(cell11BootstrapResult.lower, 1)}–${cell11Format(cell11BootstrapResult.upper, 1)} m (SD ${cell11Format(cell11BootstrapResult.sd, 1)} m). The optimum ${cell11SensitivityDescription} across the exploratory group-size settings, ranging from ${cell11Format(Math.min(...cell11SensitivityRadii), 1)} to ${cell11Format(Math.max(...cell11SensitivityRadii), 1)} m. These qualitative descriptions use 250 m for the bootstrap range and 100 m for the sensitivity range as descriptive yardsticks, not statistical tests. The bootstrap range is not automatically a confidence interval and ignores spatial dependence.</p>
  <p>The cutpoint maximizes a cumulative comparison; it does not establish a boundary at which the relationship ends. The separate GAM can help assess whether the distance–rating relationship becomes relatively flat beyond it.</p>
  <p>Only ${cutpointData.filter(d => d.distance <= 250).length} usable restaurants lie within 250 m. The chosen radius and its unadjusted effect size may be unstable and the effect size is selected upward by maximizing the statistic. Spatial autocorrelation can violate the exchangeability assumed by unrestricted rating permutations, and other restaurant characteristics may confound the association. These observational results do not establish causation.</p>
</section>`);
