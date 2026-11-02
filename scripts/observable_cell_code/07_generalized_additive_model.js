// Cell 07 — paste this entire file into one Observable Notebooks 2.0 JS/TS cell.
// Attach restaurants_paris.geojson. The eleven sections below form one notebook cell.
import * as cell07Plot from "npm:@observablehq/plot";
import * as cell07Inputs from "npm:@observablehq/inputs";
import * as cell07Htl from "npm:htl";

// 1. Prepare the data. Keep all original properties, including identifiers and missing controls.
const cell07GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const gamData = cell07GeoJSON.features.map(f => ({...f.properties,
  rating: f.properties?.rating, distance: f.properties?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && Number.isFinite(d.distance) && d.distance >= 0 && d.distance <= 1500);
if (gamData.length < 30) throw new Error("Too few valid ratings and distances for the GAM.");
const cell07Min = Math.min(...gamData.map(d => d.distance));
const cell07Max = Math.max(...gamData.map(d => d.distance));
const cell07Bands = Array.from({length: 6}, (_, i) => ({band: `${i * 250}–${(i + 1) * 250} m`,
  n: gamData.filter(d => d.distance >= i * 250 && (i === 5 ? d.distance <= 1500 : d.distance < (i + 1) * 250)).length}));

// 2. Cubic P-spline functions. A full B-spline basis already includes the intercept:
// do not add a second intercept. Uniform knots are fixed across bootstrap refits.
function cell07Spec(k, min = cell07Min, max = cell07Max) {
  const degree = 3, interior = k - degree - 1;
  if (k < 4 || !(max > min)) throw new Error("Invalid spline specification.");
  return {k, min, max, knots: [...Array(4).fill(0),
    ...Array.from({length: interior}, (_, i) => (i + 1) / (interior + 1)), ...Array(4).fill(1)]};
}
function cell07Basis(distance, spec) {
  if (distance < spec.min - 1e-9 || distance > spec.max + 1e-9) throw new Error("Prediction outside observed range.");
  const x = Math.max(0, Math.min(1, (distance - spec.min) / (spec.max - spec.min)));
  if (x === 1) return Array.from({length: spec.k}, (_, i) => +(i === spec.k - 1));
  const t = spec.knots;
  let b = Array.from({length: t.length - 1}, (_, i) => +(t[i] <= x && x < t[i + 1]));
  for (let p = 1; p <= 3; p++) b = Array.from({length: t.length - p - 1}, (_, i) =>
    (t[i + p] > t[i] ? (x - t[i]) / (t[i + p] - t[i]) * b[i] : 0) +
    (t[i + p + 1] > t[i + 1] ? (t[i + p + 1] - x) / (t[i + p + 1] - t[i + 1]) * b[i + 1] : 0));
  return b;
}
function cell07Penalty(k, p) {
  const s = Array.from({length: p}, () => Array(p).fill(0));
  for (let i = 0; i < k - 2; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++)
    s[i + a][i + b] += [1, -2, 1][a] * [1, -2, 1][b];
  return s;
}
// Cholesky factorization solves the small positive-definite penalized system;
// fail explicitly on rank deficiency instead of quietly adding a ridge penalty.
function cell07Cholesky(a) {
  const n = a.length, l = Array.from({length: n}, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let v = a[i][j];
    for (let k = 0; k < j; k++) v -= l[i][k] * l[j][k];
    if (i === j) { if (!(v > 1e-12)) throw new Error("Rank-deficient model matrix."); l[i][j] = Math.sqrt(v); }
    else l[i][j] = v / l[j][j];
  }
  return l;
}
function cell07Solve(l, b) {
  const n = b.length, y = Array(n), x = Array(n);
  for (let i = 0; i < n; i++) { let v = b[i]; for (let j = 0; j < i; j++) v -= l[i][j] * y[j]; y[i] = v / l[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let j = i + 1; j < n; j++) v -= l[j][i] * x[j]; x[i] = v / l[i][i]; }
  return x;
}
const cell07Dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cell07Lambdas = Array.from({length: 29}, (_, i) => 10 ** (-4 + i * 0.25));
function cell07Fit(rows, spec, controls = () => [], lambdas = cell07Lambdas) {
  const x = rows.map(d => [...cell07Basis(d.distance, spec), ...controls(d)]), y = rows.map(d => d.rating);
  const n = x.length, p = x[0].length;
  if (n <= p) throw new Error("Not enough observations for the model.");
  const cross = Array.from({length: p}, () => Array(p).fill(0)), xy = Array(p).fill(0);
  let yy = 0;
  for (let r = 0; r < n; r++) { yy += y[r] ** 2; for (let i = 0; i < p; i++) {
    xy[i] += x[r][i] * y[r]; for (let j = 0; j <= i; j++) cross[i][j] += x[r][i] * x[r][j];
  }}
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) cross[j][i] = cross[i][j];
  const penalty = cell07Penalty(spec.k, p);
  let best = null;
  const smoothingScores = [];
  for (const lambda of lambdas) {
    let l; try { l = cell07Cholesky(cross.map((row, i) => row.map((v, j) => v + lambda * penalty[i][j]))); } catch { continue; }
    const beta = cell07Solve(l, xy);
    let edf = 0;
    for (let j = 0; j < p; j++) edf += cell07Solve(l, cross.map(row => row[j]))[j];
    // Algebraic SSE avoids repeated passes over observations for each lambda.
    const sse = Math.max(0, yy - 2 * cell07Dot(beta, xy) + cell07Dot(beta, cross.map(row => cell07Dot(row, beta))));
    const gcv = n * sse / (n - edf) ** 2;
    if (Number.isFinite(gcv)) smoothingScores.push({lambda, gcv});
    if (Number.isFinite(gcv) && (!best || gcv < best.gcv)) best = {beta, edf, sse, gcv, lambda};
  }
  if (!best) throw new Error("No numerically valid fit; inspect the model matrix.");
  const mean = y.reduce((a, b) => a + b, 0) / n, sst = y.reduce((a, b) => a + (b - mean) ** 2, 0);
  const predict = (distance, controlVector = Array(p - spec.k).fill(0)) => cell07Dot([...cell07Basis(distance, spec), ...controlVector], best.beta);
  const fitted = x.map(row => cell07Dot(row, best.beta));
  return {...best, n, spec, fitted, smoothingScores, residuals: y.map((v, i) => v - fitted[i]), predict,
    rmse: Math.sqrt(best.sse / n), residualSD: Math.sqrt(best.sse / (n - best.edf)), r2: sst > 0 ? 1 - best.sse / sst : null};
}
function cell07Quantile(values, q) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, i = Math.floor(pos);
  return a[i] + (pos - i) * (a[Math.ceil(pos)] - a[i]);
}
function cell07Rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const cell07Fmt = x => Number.isFinite(x) ? x.toFixed(4) : "—";
const cell07Grid = [cell07Min];
for (let d = Math.ceil(cell07Min / 10) * 10; d < cell07Max; d += 10) if (d > cell07Min) cell07Grid.push(d);
cell07Grid.push(cell07Max);
const cell07Spec10 = cell07Spec(10);
const cell07BasisCheck = cell07Grid.every(d => Math.abs(cell07Basis(d, cell07Spec10).reduce((a, b) => a + b, 0) - 1) < 1e-10);
const cell07P = cell07Penalty(10, 10);
const cell07PenaltyCheck = cell07P.every((r, i) => Math.abs(r.reduce((a, b) => a + b, 0)) < 1e-10 && r.every((v, j) => v === cell07P[j][i]));
if (!cell07BasisCheck || !cell07PenaltyCheck) throw new Error("Spline basis or penalty validation failed.");

// 3. Fit the primary model and compare held-out prediction errors with a linear fit.
const gamUnadjusted = cell07Fit(gamData, cell07Spec10);
function cell07Linear(train, distance) {
  const mx = train.reduce((s, d) => s + d.distance, 0) / train.length;
  const my = train.reduce((s, d) => s + d.rating, 0) / train.length;
  const slope = train.reduce((s, d) => s + (d.distance - mx) * (d.rating - my), 0) /
    train.reduce((s, d) => s + (d.distance - mx) ** 2, 0);
  return my + slope * (distance - mx);
}
// Folds are shuffled once, with smoothing reselected using only each training fold.
const cell07RandCV = cell07Rng(7181), cell07Order = gamData.map((_, i) => i);
for (let i = cell07Order.length - 1; i > 0; i--) { const j = Math.floor(cell07RandCV() * (i + 1)); [cell07Order[i], cell07Order[j]] = [cell07Order[j], cell07Order[i]]; }
const cell07Fold = Array(gamData.length); cell07Order.forEach((index, i) => cell07Fold[index] = i % 5);
let cell07GamCV = 0, cell07LinearCV = 0;
for (let fold = 0; fold < 5; fold++) {
  const train = gamData.filter((_, i) => cell07Fold[i] !== fold), test = gamData.filter((_, i) => cell07Fold[i] === fold);
  const fit = cell07Fit(train, cell07Spec10);
  for (const row of test) { cell07GamCV += (row.rating - fit.predict(row.distance)) ** 2; cell07LinearCV += (row.rating - cell07Linear(train, row.distance)) ** 2; }
}
cell07GamCV = Math.sqrt(cell07GamCV / gamData.length); cell07LinearCV = Math.sqrt(cell07LinearCV / gamData.length);
if (![...gamUnadjusted.fitted, gamUnadjusted.edf, gamUnadjusted.gcv].every(Number.isFinite)) throw new Error("Nonfinite model diagnostics.");
if (gamUnadjusted.smoothingScores.some(candidate => candidate.gcv < gamUnadjusted.gcv - 1e-12)) throw new Error("GCV selection check failed.");

// 8. Encode adjusted controls. Reviews: median log-count imputation plus missing flag.
// Price and language are categorical. Cuisine uses the first listed tag, retaining
// categories with >=30 observations and pooling the rest; missing is Unknown.
const cell07LogReviews = gamData.map(d => Number.isFinite(d.reviews_count_in_default_language) && d.reviews_count_in_default_language >= 0 ? Math.log1p(d.reviews_count_in_default_language) : null);
const cell07ReviewMedian = cell07Quantile(cell07LogReviews, 0.5);
if (cell07ReviewMedian === null) throw new Error("No valid review counts for the adjusted model.");
const cell07First = x => typeof x === "string" && x.trim() ? x.split(",")[0].trim() : "Unknown";
function cell07Groups(values, minimum) {
  const counts = new Map(); values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  const pooled = values.map(v => v === "Unknown" || counts.get(v) >= minimum ? v : "Other");
  const totals = new Map(); pooled.forEach(v => totals.set(v, (totals.get(v) || 0) + 1));
  // The most common category is the reference; a constant category adds no column.
  const levels = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b));
  return {pooled, levels};
}
const cell07Price = cell07Groups(gamData.map(d => cell07First(d.price_level)), 10);
const cell07Cuisine = cell07Groups(gamData.map(d => cell07First(d.cuisines)), 30);
const cell07Language = cell07Groups(gamData.map(d => cell07First(d.default_language)), 20);
const cell07ReviewValues = cell07LogReviews.map(v => v === null ? cell07ReviewMedian : v);
const cell07ReviewMean = cell07ReviewValues.reduce((a, b) => a + b, 0) / gamData.length;
const cell07ReviewScale = Math.sqrt(cell07ReviewValues.reduce((a, b) => a + (b - cell07ReviewMean) ** 2, 0) / gamData.length) || 1;
gamData.forEach((d, i) => { d.cell07Index = i; });
const cell07MissingVaries = cell07LogReviews.some(v => v === null) && cell07LogReviews.some(v => v !== null);
function cell07Controls(row) {
  const i = row.cell07Index;
  return [(cell07ReviewValues[i] - cell07ReviewMean) / cell07ReviewScale,
    ...(cell07MissingVaries ? [+(cell07LogReviews[i] === null)] : []),
    ...cell07Price.levels.slice(1).map(v => +(cell07Price.pooled[i] === v)),
    ...cell07Cuisine.levels.slice(1).map(v => +(cell07Cuisine.pooled[i] === v)),
    ...cell07Language.levels.slice(1).map(v => +(cell07Language.pooled[i] === v))];
}
const cell07ControlMean = cell07Controls(gamData[0]).map((_, j) => gamData.reduce((s, d) => s + cell07Controls(d)[j], 0) / gamData.length);
const gamAdjusted = cell07Fit(gamData, cell07Spec10, cell07Controls);
const cell07AdjustedPredict = (fit, d) => fit.predict(d, cell07ControlMean);

// 4, 6 and 7. Paired restaurant bootstrap, with smoothing reselected on every fit.
// Fixed knots and fixed standardization target make predictions comparable. This is
// an IID bootstrap, not a spatial bootstrap. Increase this value for more precision.
const cell07BootstrapIterations = 300, cell07Seed = 20261102, cell07Random = cell07Rng(cell07Seed);
const cell07Boot = [], cell07BootAdjusted = [];
let cell07Failures = 0;
const cell07Progress = cell07Htl.html`<p>Fitting bootstrap models (0/${cell07BootstrapIterations})…</p>`;
display(cell07Progress);
for (let b = 0; b < cell07BootstrapIterations; b++) {
  const sample = Array.from({length: gamData.length}, () => gamData[Math.floor(cell07Random() * gamData.length)]);
  try {
    const unadjusted = cell07Fit(sample, cell07Spec10);
    const adjusted = cell07Fit(sample, cell07Spec10, cell07Controls);
    cell07Boot.push(unadjusted); cell07BootAdjusted.push(adjusted);
  } catch (error) { cell07Failures++; }
  if (b % 5 === 4) { cell07Progress.textContent = `Fitting bootstrap models (${b + 1}/${cell07BootstrapIterations})…`; await new Promise(resolve => setTimeout(resolve, 0)); }
}
cell07Progress.textContent = `Bootstrap complete: ${cell07Boot.length}/${cell07BootstrapIterations} paired fits; ${cell07Failures} failed.`;
if (cell07Boot.length < cell07BootstrapIterations * 0.9) throw new Error("More than 10% of bootstrap fits failed; intervals are unavailable.");
const cell07Interval = values => [cell07Quantile(values, 0.025), cell07Quantile(values, 0.975)];
const gamPredictions = cell07Grid.map(distance => {
  const [low, high] = cell07Interval(cell07Boot.map(fit => fit.predict(distance)));
  return {distance, predicted: gamUnadjusted.predict(distance), low, high};
});
function cell07Derivative(fit, d) {
  const h = 0.1, a = Math.max(cell07Min, d - h), b = Math.min(cell07Max, d + h);
  return 100 * (fit.predict(b) - fit.predict(a)) / (b - a);
}
const gamDerivatives = cell07Grid.map(distance => {
  const [low, high] = cell07Interval(cell07Boot.map(fit => cell07Derivative(fit, distance)));
  return {distance, derivative: cell07Derivative(gamUnadjusted, distance), low, high, excludesZero: low > 0 || high < 0};
});
const cell07Distances = [225, 400, 500, 750, 1000, 1250, 1450];
const cell07At = cell07Distances.map(distance => {
  if (distance < cell07Min || distance > cell07Max) return {distance, predicted: null, low: null, high: null};
  const [low, high] = cell07Interval(cell07Boot.map(fit => fit.predict(distance)));
  return {distance, predicted: gamUnadjusted.predict(distance), low, high};
});
const cell07ContrastDefinitions = [
  {contrast: "A: 750 − 225 m", f: fit => fit.predict(750) - fit.predict(225), endpoints: [225, 750]},
  {contrast: "B: 1,250 − 500 m", f: fit => fit.predict(1250) - fit.predict(500), endpoints: [500, 1250]},
  {contrast: "C1: 225–500 m per 100 m", f: fit => (fit.predict(500) - fit.predict(225)) * 100 / 275, endpoints: [225, 500]},
  {contrast: "C2: 500–1,250 m per 100 m", f: fit => (fit.predict(1250) - fit.predict(500)) * 100 / 750, endpoints: [500, 1250]},
  {contrast: "C: near rate − far rate per 100 m", f: fit => (fit.predict(500) - fit.predict(225)) * 100 / 275 - (fit.predict(1250) - fit.predict(500)) * 100 / 750, endpoints: [225, 500, 1250]}
];
const cell07Contrasts = cell07ContrastDefinitions.map(({contrast, f, endpoints}) => {
  if (endpoints.some(d => d < cell07Min || d > cell07Max)) return {contrast, estimate: null, low: null, high: null, interpretation: "Outside observed range"};
  const [low, high] = cell07Interval(cell07Boot.map(f));
  return {contrast, estimate: f(gamUnadjusted), low, high,
    interpretation: low > 0 ? "Positive; interval excludes zero" : high < 0 ? "Negative; interval excludes zero" : "Interval includes zero; direction uncertain"};
});
const cell07AdjustedCurve = cell07Grid.map(distance => {
  const [low, high] = cell07Interval(cell07BootAdjusted.map(f => cell07AdjustedPredict(f, distance)));
  return {distance, predicted: cell07AdjustedPredict(gamAdjusted, distance), low, high};
});

// 10. Sensitivity: basis size, smoothing selection, leave-one-out central rows,
// and restricting the analysis to restaurants with at least five reviews.
const cell07Sensitivity = [8, 10, 12].map(k => { const fit = cell07Fit(gamData, cell07Spec(k));
  return {basis: k, lambda: fit.lambda, edf: fit.edf, gcv: fit.gcv, contrast: cell07ContrastDefinitions[0].endpoints.every(d => d >= cell07Min && d <= cell07Max) ? fit.predict(750) - fit.predict(225) : null}; });
const cell07Center = gamData.filter(d => d.distance < 250);
const cell07LeaveOneOut = cell07Center.map(row => {
  const sample = gamData.filter(d => d !== row), fit = cell07Fit(sample, cell07Spec10);
  const min = Math.min(...sample.map(d => d.distance)), max = Math.max(...sample.map(d => d.distance));
  return {restaurant: row.restaurant_name || String(row.fid), contrast: 225 >= min && 750 <= max ? fit.predict(750) - fit.predict(225) : null, fit, min, max};
});
const cell07ReviewSample = gamData.filter(d => Number.isFinite(d.reviews_count_in_default_language) && d.reviews_count_in_default_language >= 5);
const cell07ReviewFit = cell07ReviewSample.length > 30 ? cell07Fit(cell07ReviewSample, cell07Spec10) : null;
const cell07ReviewMin = cell07ReviewFit ? Math.min(...cell07ReviewSample.map(d => d.distance)) : null;
const cell07ReviewMax = cell07ReviewFit ? Math.max(...cell07ReviewSample.map(d => d.distance)) : null;
const cell07SmoothingSensitivity = [0.1, 1, 10].map(multiplier => {
  const fit = cell07Fit(gamData, cell07Spec10, () => [], [gamUnadjusted.lambda * multiplier]);
  return {multiplier, lambda: fit.lambda, edf: fit.edf, GCV: fit.gcv,
    contrast: 225 >= cell07Min && 750 <= cell07Max ? fit.predict(750) - fit.predict(225) : null};
});
const cell07Residuals = gamData.map((d, i) => ({distance: d.distance, fitted: gamUnadjusted.fitted[i], residual: gamUnadjusted.residuals[i]}));

// Display the results in the notebook; all named arrays and models above remain reusable.
const cell07Table = rows => cell07Inputs.table(rows, {rows: Math.min(rows.length, 12)});
display(cell07Htl.html`<h2>Cell 07: Restaurant ratings and distance — Gaussian GAM</h2>
<p>${gamData.length} usable restaurants; observed distances ${cell07Min.toFixed(1)}–${cell07Max.toFixed(1)} m. The model uses rating only; no extrapolation is shown. Ratings are bounded 1–5, while the Gaussian model is an approximation.</p>`);
display(cell07Table(cell07Bands));
display(cell07Htl.html`<h3>Unadjusted fit and cross-validation</h3>`);
display(cell07Table([{n: gamUnadjusted.n, lambda: gamUnadjusted.lambda, edf: gamUnadjusted.edf, residualSD: gamUnadjusted.residualSD,
  RMSE: gamUnadjusted.rmse, R2: gamUnadjusted.r2, GCV: gamUnadjusted.gcv, GAM_CV_RMSE: cell07GamCV, linear_CV_RMSE: cell07LinearCV}]));
if (gamUnadjusted.lambda === cell07Lambdas[0] || gamUnadjusted.lambda === cell07Lambdas[cell07Lambdas.length - 1])
  display(cell07Htl.html`<p>Warning: the selected smoothing penalty is at the edge of the search grid; consider widening it.</p>`);
display(cell07Htl.html`<p>Five-fold CV reselects smoothing on each training fold; a lower RMSE indicates better held-out prediction, but this comparison alone does not establish statistical nonlinearity.</p>`);
// 5. Main curve and 95% pointwise mean confidence band; rug is drawn at rating 1.
display(cell07Plot.plot({title: "Restaurant ratings and distance from the Eiffel Tower", width: 900, height: 500,
  x: {label: "Distance from Eiffel Tower (m)", domain: [cell07Min, cell07Max]}, y: {label: "Restaurant rating (1–5)", domain: [1, 5]},
  marks: [cell07Plot.ruleX([250, 500].filter(d => d >= cell07Min && d <= cell07Max), {stroke: "#777", strokeDasharray: "4,4"}),
    cell07Plot.areaY(gamPredictions, {x: "distance", y1: "low", y2: "high", fill: "steelblue", fillOpacity: 0.22, clip: true}),
    cell07Plot.dot(gamData, {x: "distance", y: "rating", r: 2, fillOpacity: 0.13}),
    cell07Plot.tickX(gamData, {x: "distance", y: 1, strokeOpacity: 0.16, length: 7}),
    cell07Plot.line(gamPredictions, {x: "distance", y: "predicted", stroke: "#125a9c", strokeWidth: 2.5, clip: true})]}));
display(cell07Htl.html`<p>Blue band: pointwise 95% bootstrap confidence interval for the mean, not a prediction interval for an individual. Sparse observations near the tower make that region particularly uncertain.</p><h3>Derivative per 100 m</h3>`);
display(cell07Plot.plot({width: 900, height: 320, x: {label: "Distance from Eiffel Tower (m)"}, y: {label: "Change in predicted rating per 100 m"},
  marks: [cell07Plot.ruleY([0], {stroke: "#555"}), cell07Plot.ruleX([500], {stroke: "#777", strokeDasharray: "4,4"}),
    cell07Plot.areaY(gamDerivatives, {x: "distance", y1: "low", y2: "high", fill: "steelblue", fillOpacity: 0.2}),
    cell07Plot.line(gamDerivatives, {x: "distance", y: "derivative", stroke: "#125a9c"}),
    cell07Plot.dot(gamDerivatives.filter(d => d.excludesZero), {x: "distance", y: "derivative", fill: "#b32929", r: 2})]}));
display(cell07Htl.html`<p>Red dots mark grid points whose pointwise interval excludes zero. These are not simultaneous confidence bands; an interval containing zero does not prove a flat relationship.</p><h3>Predicted means and paired contrasts</h3>`);
display(cell07Table(cell07At)); display(cell07Table(cell07Contrasts));
// 9. Same sample for both models. Standardization averages control vectors over
// the original analysis sample, equivalent to averaging predictions in this additive model.
display(cell07Htl.html`<h3>Adjusted and unadjusted distance relationships</h3>
<p>Both models use the same ${gamData.length} restaurants. The adjusted model includes log(1 + reviews), categorical price, first listed cuisine, and language. Categories below 10, 30, and 20 observations respectively are pooled as Other; missing categories are Unknown. Missing review counts are imputed to the median log count, with a missingness indicator when it varies. ${cell07LogReviews.filter(v => v === null).length} review counts were imputed. Adjusted predictions average over the observed control distribution. These are conditional associations, not causal effects.</p>`);
display(cell07Table([{model: "Unadjusted", n: gamUnadjusted.n, edf: gamUnadjusted.edf, lambda: gamUnadjusted.lambda, R2: gamUnadjusted.r2},
  {model: "Adjusted", n: gamAdjusted.n, edf: gamAdjusted.edf, lambda: gamAdjusted.lambda, R2: gamAdjusted.r2}]));
display(cell07Plot.plot({width: 900, height: 420, x: {label: "Distance from Eiffel Tower (m)"}, y: {label: "Predicted mean rating"},
  color: {legend: true, domain: ["Unadjusted", "Adjusted"], range: ["#125a9c", "#c54e22"]}, marks: [
    cell07Plot.ruleX([500], {stroke: "#777", strokeDasharray: "4,4"}),
    cell07Plot.areaY(gamPredictions, {x: "distance", y1: "low", y2: "high", fill: "#125a9c", fillOpacity: 0.15}),
    cell07Plot.areaY(cell07AdjustedCurve, {x: "distance", y1: "low", y2: "high", fill: "#c54e22", fillOpacity: 0.15}),
    cell07Plot.line(gamPredictions, {x: "distance", y: "predicted", stroke: () => "Unadjusted", strokeWidth: 2}),
    cell07Plot.line(cell07AdjustedCurve, {x: "distance", y: "predicted", stroke: () => "Adjusted", strokeWidth: 2})]}));
display(cell07Htl.html`<h3>Diagnostics and sensitivity</h3>`);
display(cell07Htl.html`<p>Basis-size sensitivity (GCV-selected smoothing):</p>`);
display(cell07Table(cell07Sensitivity));
display(cell07Htl.html`<p>Smoothing sensitivity (0.1×, 1× and 10× the selected penalty):</p>`);
display(cell07Table(cell07SmoothingSensitivity));
const cell07LooValues = cell07LeaveOneOut.map(d => d.contrast).filter(Number.isFinite);
display(cell07Htl.html`<p>Leaving out each of the ${cell07Center.length} restaurants within 250 m gives 750 minus 225 m contrasts from ${cell07Fmt(Math.min(...cell07LooValues))} to ${cell07Fmt(Math.max(...cell07LooValues))}. The ≥5-review sample contains ${cell07ReviewSample.length} restaurants; missing review counts are excluded for this sensitivity check.</p>`);
display(cell07Plot.plot({title: "Sensitivity of fitted curves", width: 900, height: 300, x: {label: "Distance (m)"}, y: {label: "Predicted rating"},
  marks: [
    ...cell07LeaveOneOut.map(d => cell07Plot.line(cell07Grid.filter(distance => distance >= d.min && distance <= d.max).map(distance => ({distance, predicted: d.fit.predict(distance)})), {x: "distance", y: "predicted", stroke: "#999", strokeOpacity: 0.5})),
    ...(cell07ReviewFit ? [cell07Plot.line(cell07Grid.filter(distance => distance >= cell07ReviewMin && distance <= cell07ReviewMax).map(distance => ({distance, predicted: cell07ReviewFit.predict(distance)})), {x: "distance", y: "predicted", stroke: "#c54e22", strokeDasharray: "4,4"})] : []),
    cell07Plot.line(gamPredictions, {x: "distance", y: "predicted", stroke: "#125a9c", strokeWidth: 2})]}));
display(cell07Htl.html`<p>Blue: primary; grey: each central leave-one-out fit; dashed orange: at least five reviews. Knots remain fixed to the primary observed range for comparison.</p>`);
display(cell07Plot.plot({title: "Residuals versus fitted rating", width: 700, height: 250, x: {label: "Fitted rating"}, y: {label: "Residual"}, marks: [cell07Plot.ruleY([0]), cell07Plot.dot(cell07Residuals, {x: "fitted", y: "residual", r: 2, fillOpacity: 0.18})]}));
display(cell07Plot.plot({title: "Residuals versus distance", width: 700, height: 250, x: {label: "Distance (m)"}, y: {label: "Residual"}, marks: [cell07Plot.ruleY([0]), cell07Plot.dot(cell07Residuals, {x: "distance", y: "residual", r: 2, fillOpacity: 0.18})]}));
display(cell07Plot.plot({title: "Residual distribution", width: 700, height: 250, x: {label: "Residual"}, y: {label: "Restaurants"}, marks: [cell07Plot.rectY(cell07Residuals, cell07Plot.binX({y: "count"}, {x: "residual", thresholds: 30})), cell07Plot.ruleY([0])]}));
// 11. A deliberately cautious, data-derived interpretation.
const cell07A = cell07Contrasts[0], cell07B = cell07Contrasts[1], cell07C = cell07Contrasts[4];
const cell07AdjustedA = 225 >= cell07Min && 750 <= cell07Max ? cell07AdjustedPredict(gamAdjusted, 750) - cell07AdjustedPredict(gamAdjusted, 225) : null;
const cell07AdjustedACI = 225 >= cell07Min && 750 <= cell07Max ? cell07Interval(cell07BootAdjusted.map(f => cell07AdjustedPredict(f, 750) - cell07AdjustedPredict(f, 225))) : [null, null];
display(cell07Htl.html`<h3>Results summary</h3>
<p>The estimated 750 m minus 225 m difference is ${cell07Fmt(cell07A.estimate)} rating points (95% interval ${cell07Fmt(cell07A.low)} to ${cell07Fmt(cell07A.high)}); ${cell07A.interpretation.toLowerCase()}. The 1,250 m minus 500 m difference is ${cell07Fmt(cell07B.estimate)} (${cell07Fmt(cell07B.low)} to ${cell07Fmt(cell07B.high)}). The near-minus-far change per 100 m is ${cell07Fmt(cell07C.estimate)} (${cell07Fmt(cell07C.low)} to ${cell07Fmt(cell07C.high)}).</p>
<p>The adjusted 750 m minus 225 m contrast is ${cell07Fmt(cell07AdjustedA)} (${cell07Fmt(cell07AdjustedACI[0])} to ${cell07Fmt(cell07AdjustedACI[1])}), using the same sample and averaged controls. Compare its direction and uncertainty with the unadjusted contrast above.</p>
<p>Five-fold RMSE is ${cell07Fmt(cell07GamCV)} for the GAM and ${cell07Fmt(cell07LinearCV)} for the linear model. Inspect the derivative, intervals, adjusted curve and sensitivity plots before characterizing nonlinearity, a localized disadvantage, or flattening. An interval that includes zero does not establish a negligible effect; a meaningful-effect threshold is not specified.</p>
<p>Intervals resample restaurants independently and reselect smoothing. Nearby restaurants may be spatially dependent, so these intervals may understate uncertainty. The analysis is observational and does not establish causation. Bootstrap failures: ${cell07Failures}/${cell07BootstrapIterations}; spline partition-of-unity and penalty checks passed.</p>`);
