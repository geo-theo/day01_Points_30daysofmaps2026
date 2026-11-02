// Cell 01 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson to the notebook before running it.
import * as Plot from "npm:@observablehq/plot";
import * as Inputs from "npm:@observablehq/inputs";
import * as d3 from "npm:d3";

const parisGeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const parisRestaurants = parisGeoJSON.features.map((feature) => feature.properties ?? {});

// Treat only finite numeric values as observations; in particular, null is not zero.
const numericValues = (column) => parisRestaurants
  .map((restaurant) => restaurant[column])
  .filter((value) => typeof value === "number" && Number.isFinite(value));

const ratingValues = numericValues("rating");
// Work in tenths to align bin edges at 3.0, 3.1, and so on.
const ratingBinStart = ratingValues.length ? Math.floor(d3.min(ratingValues) * 10) : 0;
const ratingBinEnd = ratingValues.length
  ? Math.max(ratingBinStart + 1, Math.ceil(d3.max(ratingValues) * 10))
  : 10;
const ratingBinThresholds = d3.range(ratingBinStart + 1, ratingBinEnd).map((i) => i / 10);
// Precompute bins so the hover tooltip can report the exact range and count.
const ratingBins = d3.bin()
  .domain([ratingBinStart / 10, ratingBinEnd / 10])
  .thresholds(ratingBinThresholds)(ratingValues);
const summaryColumns = [
  "rating",
  "distance_from_eiffeltower_m",
  "total_reviews_count",
  "excellent",
  "terrible"
];
const parisSummary = summaryColumns.map((column) => {
  const values = numericValues(column).sort((a, b) => a - b);
  const q1 = d3.quantileSorted(values, 0.25);
  const q3 = d3.quantileSorted(values, 0.75);
  return {
    column,
    n: values.length,
    missing: parisRestaurants.length - values.length,
    mean: d3.mean(values) ?? null,
    median: d3.median(values) ?? null,
    std: d3.deviation(values) ?? null,
    IQR: q1 == null || q3 == null ? null : q3 - q1,
    min: d3.min(values) ?? null,
    max: d3.max(values) ?? null
  };
});

// Feature properties form the table; the original geometry remains in parisGeoJSON.
display(Inputs.table(parisRestaurants, {label: "Paris restaurants"}));
display(htl.html`<p style="margin-top: 0.25rem; color: #666; font-size: 0.875rem;">Total records: ${parisRestaurants.length.toLocaleString()}</p>`);
display(Plot.plot({
  title: "Distribution of restaurant ratings",
  x: {label: "Rating", domain: [ratingBinStart / 10, ratingBinEnd / 10]},
  y: {label: "Number of points"},
  marks: [
    Plot.rectY(ratingBins, {
      x1: (bin) => bin.x0,
      x2: (bin) => bin.x1,
      y: (bin) => bin.length,
      fill: (bin) => bin.x0 < 2 ? "#a50f15" : bin.x0 < 3 ? "#fb6a6a" : bin.x0 < 4 ? "#9ecae1" : "#08519c",
      title: (bin) => `Rating: ${bin.x0.toFixed(1)}–${bin.x1.toFixed(1)}\nPoints: ${bin.length.toLocaleString()}`,
      tip: true
    }),
    Plot.ruleX([2, 3, 4], {stroke: "#333", strokeOpacity: 0.45, strokeDasharray: "2,4"})
  ]
}));
display(Inputs.table(parisSummary, {label: "Summary statistics"}));

