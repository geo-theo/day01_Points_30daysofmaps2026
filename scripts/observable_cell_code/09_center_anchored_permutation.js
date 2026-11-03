// CELL 09.1 — Data preparation. Paste this section into its own Observable JS/TS cell.
// Attach restaurants_paris.geojson to the notebook before running this cell.
import * as cell09Plot from "npm:@observablehq/plot";
import * as cell09Inputs from "npm:@observablehq/inputs";
import {html as cell09Html} from "npm:htl";

// To run a separate sensitivity scan, set this to a positive integer below 20.
// Keep the primary minimum at 20 for the prespecified primary analysis.
const cell09Minimum = 20;
const cell09SensitivityMinimum = null; // Example: 9. Null disables the extra scan.
const cell09Permutations = 9999;
const cell09Seed = 20261102;
const cell09GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const permutationData = cell09GeoJSON.features.map(({properties: p}) => ({
  rating: p?.rating, distance: p?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && d.rating >= 1 && d.rating <= 5 &&
  Number.isFinite(d.distance) && d.distance >= 0 && d.distance <= 1500)
  .sort ( (a, b) => a.distance - b.distance );
if (!Number.isInteger(cell09Minimum) || cell09Minimum < 1) throw new Error("Minimum group size must be a positive integer.");
if (cell09SensitivityMinimum !== null && (!Number.isInteger(cell09SensitivityMinimum) || cell09SensitivityMinimum < 1 || cell09SensitivityMinimum >= cell09Minimum))
  throw new Error("Sensitivity minimum must be a positive integer smaller than the primary minimum, or null.");
// Include 0 and 1,500 in the grid; empty groups are always ineligible.
const cell09Grid = Array.from({length: 61}, (_, i) => i * 25);
let cell09Count = 0;
const cell09Thresholds = cell09Grid.map(radius => {
  while (cell09Count < permutationData.length && permutationData[cell09Count].distance <= radius) cell09Count++;
  return {radius, n_inside: cell09Count, n_outside: permutationData.length - cell09Count};
});
const cell09Eligible = cell09Thresholds.filter(d => d.n_inside >= cell09Minimum && d.n_outside >= cell09Minimum);
if (!cell09Eligible.length) throw new Error("No radii satisfy the minimum group size; check the data or minimum.");
if (cell09Minimum < 20) display(cell09Html`<p><b>Warning:</b> A minimum below 20 can produce unstable estimates; treat this scan as exploratory.</p>`);

// CELL 09.2 — Permutation functions. Paste this section into a second cell.
// A fixed-seed generator and Fisher–Yates shuffle randomize ratings, never distances.
function cell09Random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cell09Shuffle(values, random) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}
// Cumulative sums evaluate all sorted thresholds in one pass per arrangement.
function cell09Differences(ratings, thresholds, total) {
  const n = ratings.length, differences = new Float64Array(thresholds.length);
  let sum = 0, index = 0;
  for (let j = 0; j < thresholds.length; j++) {
    const inside = thresholds[j].n_inside;
    while (index < inside) sum += ratings[index++];
    differences[j] = (total - sum) / (n - inside) - sum / inside;
  }
  return differences;
}
function cell09Analyze(data, thresholds, iterations, seed) {
  if (!thresholds.length) throw new Error("The scan has no eligible radii.");
  if (!Number.isInteger(iterations) || iterations < 2) throw new Error("At least two permutations are required.");
  const n = data.length, k = thresholds.length;
  const original = data.map(d => d.rating);
  const total = original.reduce((a, b) => a + b, 0);
  const observed = cell09Differences(original, thresholds, total);
  const means = new Float64Array(k), m2 = new Float64Array(k);
  // Store the complete simulated curve for each common shuffled arrangement.
  const curves = new Float64Array(iterations * k);
  const shuffled = original.slice(), random = cell09Random(seed);
  for (let b = 0; b < iterations; b++) {
    cell09Shuffle(shuffled, random);
    const values = cell09Differences(shuffled, thresholds, total);
    for (let j = 0; j < k; j++) {
      const value = values[j];
      curves[b * k + j] = value;
      const delta = value - means[j];
      means[j] += delta / (b + 1);
      m2[j] += delta * (value - means[j]);
    }
  }
  const sds = Array.from(m2, value => Math.sqrt(Math.max(0, value / (iterations - 1))));
  // Numerically constant null distributions contribute zero, rather than NaN.
  // The observed assignment belongs to the same permutation space.
  const z = (value, j) => sds[j] <= 1e-12 ? 0 : (value - means[j]) / sds[j];
  const observedZ = Array.from(observed, (value, j) => z(value, j));
  const maxima = new Float64Array(iterations);
  for (let b = 0; b < iterations; b++) {
    let max = -Infinity;
    for (let j = 0; j < k; j++) max = Math.max(max, z(curves[b * k + j], j));
    maxima[b] = max;
  }
  const maxZ = Math.max(...observedZ);
  let exceedances = 0;
  for (const maximum of maxima) if (maximum >= maxZ) exceedances++;
  const globalP = (1 + exceedances) / (iterations + 1);
  // Monte Carlo critical rank: ceil((B + 1) * 0.95), using one-based indexing.
  // A strict exceedance is conservative when the permutation maxima have ties.
  const sortedMaxima = Array.from(maxima).sort((a, b) => a - b);
  const criticalIndex = Math.ceil((iterations + 1) * 0.95) - 1;
  const critical = criticalIndex < iterations ? sortedMaxima[criticalIndex] : Infinity;
  let insideSum = 0, index = 0;
  const rows = thresholds.map((threshold, j) => {
    while (index < threshold.n_inside) insideSum += original[index++];
    const meanInside = insideSum / threshold.n_inside;
    const meanOutside = (total - insideSum) / threshold.n_outside;
    const upper = means[j] + critical * sds[j];
    return {...threshold, mean_inside: meanInside, mean_outside: meanOutside,
      observed_difference: observed[j], permutation_mean: means[j], permutation_sd: sds[j],
      standardized_difference: observedZ[j], upper_envelope: upper,
      significant: observedZ[j] > critical};
  });
  const maxStandardized = rows.reduce((best, row) => row.standardized_difference > best.standardized_difference ? row : best);
  const maxRaw = rows.reduce((best, row) => row.observed_difference > best.observed_difference ? row : best);
  return {rows, globalP, maxZ, maxStandardized, maxRaw, critical, iterations, seed, curves, maxima};
}
function cell09Describe(data, radius) {
  const inside = data.filter(d => d.distance <= radius), outside = data.filter(d => d.distance > radius);
  const mean = group => group.length ? group.reduce((sum, d) => sum + d.rating, 0) / group.length : null;
  const a = mean(inside), b = mean(outside);
  return {radius, n_inside: inside.length, n_outside: outside.length, mean_inside: a, mean_outside: b,
    observed_difference: a === null || b === null ? null : b - a};
}

// CELL 09.3 — Run the analysis. Paste this section into a third cell.
// Each scan uses one common shuffled rating arrangement across all its radii.
const cell09Result = cell09Analyze(permutationData, cell09Eligible, cell09Permutations, cell09Seed);
const cell09Rows = cell09Result.rows;
const cell09At250 = cell09Describe(permutationData, 250);
const cell09SensitivityEligible = cell09SensitivityMinimum === null ? [] : cell09Thresholds.filter(d =>
  d.n_inside >= cell09SensitivityMinimum && d.n_outside >= cell09SensitivityMinimum);
const cell09Sensitivity = cell09SensitivityMinimum === null ? null :
  cell09Analyze(permutationData, cell09SensitivityEligible, cell09Permutations, cell09Seed);
if (cell09Sensitivity) display(cell09Html`<p><b>Sensitivity scan:</b> minimum ${cell09SensitivityMinimum} per group, ${cell09Sensitivity.rows[0].radius}–${cell09Sensitivity.rows.at(-1).radius} m; separately corrected global p = ${cell09Sensitivity.globalP.toFixed(4)}; maximum standardized difference at ${cell09Sensitivity.maxStandardized.radius} m; largest raw difference at ${cell09Sensitivity.maxRaw.radius} m. Radii above its own simultaneous envelope: ${cell09Sensitivity.rows.filter(d => d.significant).map(d => `${d.radius} m`).join(", ") || "none"}. Small groups can make estimates unstable. This is a separate exploratory analysis.</p>`);

// CELL 09.4 — Main plot. Paste this section into a fourth cell.
display(cell09Plot.plot({
  title: "Cumulative restaurant rating difference by radius",
  subtitle: "Outside minus inside; upper line is the one-sided simultaneous 95% envelope",
  width: 900, height: 500,
  x: {label: "Radius from Eiffel Tower (m)", domain: [0, 1500]},
  y: {label: "Mean rating difference (outside − inside)"},
  color: {legend: true, domain: ["Observed difference", "Simultaneous upper envelope", "Above envelope"],
    range: ["#4b2c20", "#e87500", "#670d2f"]},
  marks: [
    cell09Plot.ruleY([0], {stroke: "#777"}),
    cell09Plot.ruleX([250, 500, 750, 1000, 1250, 1500], {stroke: "#999", strokeDasharray: "1,4", strokeLinecap: "round"}),
    cell09Plot.line(cell09Rows, {x: "radius", y: "observed_difference", stroke: () => "Observed difference", strokeWidth: 2.5}),
    cell09Plot.line(cell09Rows, {x: "radius", y: "upper_envelope", stroke: () => "Simultaneous upper envelope", strokeWidth: 2}),
    cell09Plot.dot(cell09Rows.filter(d => d.significant), {x: "radius", y: "observed_difference", stroke: () => "Above envelope", strokeWidth: 2, symbol: "times", r: 5,
      title: d => `${d.radius} m: difference ${d.observed_difference.toFixed(3)}`})
  ]
}));

// CELL 09.5 — Results table. Paste this section into a fifth cell.
const cell09Number = value => value == null ? "—" : value.toFixed(3);
display(cell09Html`<div style="max-width: 100%; max-height: 320px; overflow: auto;"><div style="min-width: 1000px;">${cell09Inputs.table(cell09Rows, {
  rows: 6,
  columns: ["radius", "n_inside", "n_outside", "mean_inside", "mean_outside", "observed_difference", "significant"],
  header: {radius: "Radius (m)", n_inside: "N inside", n_outside: "N outside", mean_inside: "Mean inside", mean_outside: "Mean outside", observed_difference: "Difference", significant: "Significant?"},
  format: {mean_inside: cell09Number, mean_outside: cell09Number, observed_difference: cell09Number, significant: d => d ? "Yes" : "No"}
})}</div></div>`);

