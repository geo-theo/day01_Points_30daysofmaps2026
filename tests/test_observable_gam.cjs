// Run with: node --test tests/test_observable_gam.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {test} = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/observable_cell_code/07_generalized_additive_model.js"), "utf8");
const modelSource = source.slice(source.indexOf("const restaurantGAM ="), source.indexOf("const restaurantGAMChart ="));
const fit = data => vm.runInNewContext(modelSource + "\nrestaurantGAM;", {gamRestaurants: data});
const synthetic = (rating, count = 80) => ({features: Array.from({length: count}, (_, i) => ({
  properties: {distance_from_eiffeltower_m: 100 + 1400 * i / (count - 1), avg_rating: rating(i / (count - 1))}
}))});
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);

test("supplied data agrees with an independent NumPy/cardinal-spline calculation", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/observable/final/restaurants_within1500m.geojson"), "utf8"));
  const model = fit(data);
  assert.equal(model.n, 1069);
  assert.equal(model.omitted, 82);
  assert.equal(model.smoothingAtBoundary, false);
  // Reference: closed-form cardinal cubic basis, NumPy solve and trace.
  close(model.lambda, 21.87761623949554);
  close(model.edf, 5.006705370197324);
  close(model.gcv, 0.44135436762703156);
  close(model.rmse, 0.6612335793001828);
  close(model.devianceExplained, 0.008365906915046462);
  close(model.diagnostics.reduce((s, d) => s + d.residual, 0) / model.n, 0);
  for (const d of model.diagnostics) close(model.predict(d.distance), d.fitted);
});

test("unpenalized constant component preserves a constant rating", () => {
  const model = fit(synthetic(() => 3.5));
  assert.equal(model.devianceExplained, null);
  close(model.rmse, 0);
  for (const d of model.curve) close(d.rating, 3.5);
});

test("unpenalized linear component reproduces a line including endpoints", () => {
  const model = fit(synthetic(u => 2 + 2 * u));
  close(model.rmse, 0);
  close(model.devianceExplained, 1);
  for (const d of model.curve) close(d.rating, 2 + 2 * (d.distance - 100) / 1400);
});

test("recovers a smooth nonlinear response without leaving the observed range", () => {
  const model = fit(synthetic(u => 3 + Math.sin(2 * Math.PI * u), 120));
  assert.ok(model.rmse < 0.005);
  assert.ok(model.devianceExplained > 0.999);
  assert.ok(model.edf > 2 && model.edf <= 12);
  assert.equal(model.curve[0].distance, model.minDistance);
  assert.equal(model.curve.at(-1).distance, model.maxDistance);
  assert.throws(() => model.predict(model.minDistance - 1), /observed distance range/);
  assert.throws(() => model.predict(NaN), /observed distance range/);
});

test("rejects insufficient distance variation and excludes invalid records", () => {
  const constantDistance = synthetic(() => 4);
  for (const feature of constantDistance.features) feature.properties.distance_from_eiffeltower_m = 500;
  assert.throws(() => fit(constantDistance), /distinct distances/);
  const data = synthetic(u => 3 + u);
  for (const properties of [
    {distance_from_eiffeltower_m: 500, avg_rating: null},
    {distance_from_eiffeltower_m: 500, avg_rating: 6},
    {distance_from_eiffeltower_m: null, avg_rating: 4},
    {distance_from_eiffeltower_m: 1501, avg_rating: 4}
  ]) data.features.push({properties});
  const model = fit(data);
  assert.equal(model.n, 80);
  assert.equal(model.omitted, 4);
});
