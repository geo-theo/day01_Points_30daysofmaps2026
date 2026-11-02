// Cell 08 — paste this entire file into one Observable Notebooks 2.0 JS/TS cell.
// Attach restaurants_paris.geojson to the notebook before running it.
import * as cell08Plot from "npm:@observablehq/plot";
import * as cell08Inputs from "npm:@observablehq/inputs";

// Keep restaurants with an observed rating and distance within 1,500 m.
const cell08GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const cell08Data = cell08GeoJSON.features.map(feature => ({
  name: feature.properties?.restaurant_name,
  rating: feature.properties?.rating,
  distance: feature.properties?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && Number.isFinite(d.distance) &&
  d.distance >= 0 && d.distance <= 1500);
if (cell08Data.length < 30) throw new Error("Not enough restaurants with valid ratings and distances.");
const cell08Min = Math.min(...cell08Data.map(d => d.distance));
const cell08Max = Math.max(...cell08Data.map(d => d.distance));
if (!(cell08Max > cell08Min)) throw new Error("The restaurants need more than one distance value.");

// Cubic B-spline basis functions allow a smooth, flexible distance curve.
// Their coefficients are penalized to discourage unnecessary wiggles. The full
// basis already includes an intercept, so a separate intercept is not added.
function cell08Fit(cell08Data, cell08BasisCount = 10) {
const cell08Min = Math.min(...cell08Data.map(d => d.distance));
const cell08Max = Math.max(...cell08Data.map(d => d.distance));
if (cell08Data.length < 30 || !(cell08Max > cell08Min)) throw new Error("Not enough observations or distance variation for the GAM.");
const cell08Knots = [...Array(4).fill(0),
  ...Array.from({length: cell08BasisCount - 4}, (_, i) => (i + 1) / (cell08BasisCount - 3)),
  ...Array(4).fill(1)];
function cell08Basis(distance) {
  if (distance < cell08Min || distance > cell08Max) throw new Error("Distance is outside the observed range.");
  const x = (distance - cell08Min) / (cell08Max - cell08Min);
  if (x === 1) return Array.from({length: cell08BasisCount}, (_, i) => +(i === cell08BasisCount - 1));
  let basis = Array.from({length: cell08Knots.length - 1}, (_, i) => +(cell08Knots[i] <= x && x < cell08Knots[i + 1]));
  for (let degree = 1; degree <= 3; degree++) {
    basis = Array.from({length: cell08Knots.length - degree - 1}, (_, i) => {
      const leftWidth = cell08Knots[i + degree] - cell08Knots[i];
      const rightWidth = cell08Knots[i + degree + 1] - cell08Knots[i + 1];
      return (leftWidth ? (x - cell08Knots[i]) / leftWidth * basis[i] : 0) +
        (rightWidth ? (cell08Knots[i + degree + 1] - x) / rightWidth * basis[i + 1] : 0);
    });
  }
  return basis;
}
function cell08Dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
// Solve the small positive-definite system with a Cholesky factorization.
function cell08Solve(matrix, rightSide) {
  const p = rightSide.length;
  const lower = Array.from({length: p}, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i][j];
    for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
    if (i === j) {
      if (!(value > 1e-12)) throw new Error("The spline model could not be fitted reliably.");
      lower[i][j] = Math.sqrt(value);
    } else lower[i][j] = value / lower[j][j];
  }
  const y = Array(p), result = Array(p);
  for (let i = 0; i < p; i++) {
    let value = rightSide[i];
    for (let j = 0; j < i; j++) value -= lower[i][j] * y[j];
    y[i] = value / lower[i][i];
  }
  for (let i = p - 1; i >= 0; i--) {
    let value = y[i];
    for (let j = i + 1; j < p; j++) value -= lower[j][i] * result[j];
    result[i] = value / lower[i][i];
  }
  return result;
}

// Fit each smoothing level, then choose the one with the lowest generalized
// cross-validation (GCV) score. EDF summarizes the curve's flexibility.
const cell08X = cell08Data.map(d => cell08Basis(d.distance));
const cell08P = cell08X[0].length, cell08N = cell08Data.length;
const cell08Cross = Array.from({length: cell08P}, () => Array(cell08P).fill(0));
const cell08Xy = Array(cell08P).fill(0);
const cell08Penalty = Array.from({length: cell08P}, () => Array(cell08P).fill(0));
for (let i = 0; i < cell08N; i++) for (let j = 0; j < cell08P; j++) {
  cell08Xy[j] += cell08X[i][j] * cell08Data[i].rating;
  for (let k = 0; k < cell08P; k++) cell08Cross[j][k] += cell08X[i][j] * cell08X[i][k];
}
// Penalize second differences of the spline coefficients.
for (let i = 0; i < cell08BasisCount - 2; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++)
  cell08Penalty[i + j][i + k] += [1, -2, 1][j] * [1, -2, 1][k];
const cell08Mean = cell08Data.reduce((sum, d) => sum + d.rating, 0) / cell08N;
const cell08SST = cell08Data.reduce((sum, d) => sum + (d.rating - cell08Mean) ** 2, 0);
const cell08Lambdas = Array.from({length: 29}, (_, i) => 10 ** (-4 + i * 0.25));
let cell08Best = null;
for (const lambda of cell08Lambdas) {
  const system = cell08Cross.map((row, i) => row.map((value, j) => value + lambda * cell08Penalty[i][j]));
  let coefficients, edf;
  try {
    coefficients = cell08Solve(system, cell08Xy);
    edf = cell08Cross.reduce((sum, _, j) => sum + cell08Solve(system, cell08Cross.map(row => row[j]))[j], 0);
  } catch { continue; }
  const sse = cell08Data.reduce((sum, d, i) => sum + (d.rating - cell08Dot(cell08X[i], coefficients)) ** 2, 0);
  const gcv = cell08N * sse / (cell08N - edf) ** 2;
  if (Number.isFinite(gcv) && (!cell08Best || gcv < cell08Best.gcv)) cell08Best = {lambda, coefficients, edf, sse, gcv};
}
if (!cell08Best) throw new Error("No valid GAM fit was found.");
const cell08Gam = {...cell08Best,
  n: cell08N,
  min: cell08Min,
  max: cell08Max,
  mean: cell08Mean,
  lambdaAtEdge: cell08Best.lambda === cell08Lambdas[0] || cell08Best.lambda === cell08Lambdas[cell08Lambdas.length - 1],
  rmse: Math.sqrt(cell08Best.sse / cell08N),
  residualSD: Math.sqrt(cell08Best.sse / (cell08N - cell08Best.edf)),
  r2: cell08SST > 0 ? 1 - cell08Best.sse / cell08SST : null,
  predict: distance => cell08Dot(cell08Basis(distance), cell08Best.coefficients)
};
return cell08Gam;
}


const cell08Gam = cell08Fit(cell08Data);
const cell08MeanDistance = cell08Data.reduce((sum, row) => sum + row.distance, 0) / cell08Data.length;
const cell08Slope = cell08Data.reduce((sum, row) => sum + (row.distance - cell08MeanDistance) * (row.rating - cell08Gam.mean), 0) /
  cell08Data.reduce((sum, row) => sum + (row.distance - cell08MeanDistance) ** 2, 0);
const cell08Predictions = Array.from({length: 201}, (_, i) => {
  const distance = i === 200 ? cell08Max : cell08Min + (cell08Max - cell08Min) * i / 200;
  return {distance, gam: cell08Gam.predict(distance),
    linear: cell08Gam.mean + cell08Slope * (distance - cell08MeanDistance)};
});
const cell08Results = [
  {metric: "Restaurants", value: cell08Gam.n},
  {metric: "Mean rating", value: cell08Gam.mean},
  {metric: "R²", value: cell08Gam.r2},
  {metric: "RMSE (in sample)", value: cell08Gam.rmse},
  {metric: "Residual standard deviation (approx.)", value: cell08Gam.residualSD},
  {metric: "Effective degrees of freedom (EDF)", value: cell08Gam.edf},
  {metric: "GCV score", value: cell08Gam.gcv},
  {metric: "Smoothing penalty (λ)", value: cell08Gam.lambda}
];
const cell08Format = value => value == null ? "—" : Number.isInteger(value) ? value.toLocaleString() : value.toFixed(4);
display(cell08Inputs.table(cell08Results, {rows: cell08Results.length,
  header: {metric: "GAM metric", value: "Value"}, format: {value: cell08Format}}));
display(cell08Plot.plot({
  title: "Restaurant ratings versus distance from the Eiffel Tower",
  width: 900, height: 500,
  x: {label: "Distance from Eiffel Tower (m)", domain: [cell08Min, cell08Max]},
  y: {label: "Restaurant rating", domain: [1, 5]},
  color: {legend: true, domain: ["GAM", "Linear reference"], range: ["#14532d", "#86b86c"]},
  marks: [
    cell08Plot.ruleX([500], {stroke: "#888", strokeDasharray: "4,4"}),
    cell08Plot.dot(cell08Data, {x: "distance", y: "rating", r: 2, fill: "#374151", fillOpacity: 0.55,
      title: d => `${d.name || "Restaurant"}\nRating: ${d.rating}\nDistance: ${Math.round(d.distance)} m`}),
    cell08Plot.line(cell08Predictions, {x: "distance", y: "gam", stroke: () => "GAM", strokeWidth: 3, clip: true}),
    cell08Plot.line(cell08Predictions, {x: "distance", y: "linear", stroke: () => "Linear reference", strokeWidth: 2.5, strokeDasharray: "10,6", clip: true})
  ]
}));
