// Cell 06 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson to the notebook before running it.
import * as cell06Htl from "npm:htl";
import * as cell06Plot from "npm:@observablehq/plot";

const cell06Bands = ["<250m", "<500m", "<750m", "<1000m", "<1250m", "<1500m"];
const cell06GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const cell06Rows = cell06GeoJSON.features.map(feature => feature.properties ?? {})
  .filter(row => Number.isFinite(row.rating) &&
    Number.isFinite(row.distance_from_eiffeltower_m) &&
    row.distance_from_eiffeltower_m >= 0 && row.distance_from_eiffeltower_m <= 1500 &&
    cell06Bands.includes(row.distance_band));

// Linearly interpolate between neighboring values in the sorted sample.
function cell06Quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  return sorted[lower] + (position - lower) * (sorted[Math.ceil(position)] - sorted[lower]);
}

const cell06Summaries = cell06Bands.map(band => {
  const ratings = cell06Rows.filter(row => row.distance_band === band)
    .map(row => row.rating).sort((a, b) => a - b);
  return {
    band, n: ratings.length,
    mean: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    median: ratings.length ? cell06Quantile(ratings, 0.5) : null,
    q1: ratings.length ? cell06Quantile(ratings, 0.25) : null,
    q3: ratings.length ? cell06Quantile(ratings, 0.75) : null
  };
});

const cell06Format = value => Number.isFinite(value) ? value.toFixed(4) : "—";
const cell06Table = cell06Htl.html`<table style="border-collapse:collapse;font:13px system-ui">
  <thead><tr><th>Band</th><th>n</th><th>Mean</th><th>Median</th><th>Q1</th><th>Q3</th></tr></thead>
  <tbody>${cell06Summaries.map(row => cell06Htl.html`<tr>${
    [row.band, row.n, cell06Format(row.mean), cell06Format(row.median), cell06Format(row.q1), cell06Format(row.q3)]
      .map(value => cell06Htl.html`<td style="border-top:1px solid #ddd;padding:6px 12px">${value}</td>`)
  }</tr>`)}</tbody>
</table>`;
display(cell06Table);

// Draw the barcode, overlay translucent boxplots, and mark the medians in red.
const cell06BoxPlot = cell06Plot.plot({
  width: 900,
  height: 1000,
  marginLeft: 60,
  marginBottom: 50,
  x: {domain: cell06Bands, label: "Distance band (m)"},
  y: {domain: [1, 5], inset: 8, label: "Restaurant rating"},
  marks: [
    cell06Plot.tickY(cell06Rows, {
      x: "distance_band",
      y: "rating",
      stroke: "#356c8d",
      strokeOpacity: 0.3,
      title: row => `${row.restaurant_name || "Restaurant"}\nRating: ${row.rating.toFixed(2)}\nDistance: ${Math.round(row.distance_from_eiffeltower_m)} m`
    }),
    cell06Plot.boxY(cell06Rows, {
      x: "distance_band",
      y: "rating",
      fill: "#9ecae1",
      fillOpacity: 0.45,
      stroke: "#356c8d",
      r: 0 // Ratings outside the whiskers already appear as barcode ticks.
    }),
    cell06Plot.tickY(cell06Summaries.filter(row => row.median !== null), {
      x: "band",
      y: "median",
      stroke: "#c52b2b",
      strokeWidth: 3,
      title: row => `Median rating: ${row.median.toFixed(2)}`
    })
  ]
});
display(cell06BoxPlot);
