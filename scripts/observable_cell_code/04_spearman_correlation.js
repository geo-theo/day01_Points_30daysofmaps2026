// Cell 04 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson to the notebook before running it.
import * as cell04D3 from "npm:d3";
import * as cell04Htl from "npm:htl";
import cell04JStatPackage from "npm:jstat";

const cell04JStat = cell04JStatPackage.jStat ?? cell04JStatPackage;
const cell04GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const cell04Features = cell04GeoJSON.features;
const cell04Eligible = cell04Features.map(feature => feature.properties ?? {})
  .filter(row => Number.isFinite(row.distance_from_eiffeltower_m) &&
    row.distance_from_eiffeltower_m >= 0 && row.distance_from_eiffeltower_m <= 1500);
const cell04Rows = cell04Eligible.filter(row => Number.isFinite(row.rating))
  .map(row => ({distance: row.distance_from_eiffeltower_m, rating: row.rating}));
// Assign the shared 500 m boundary to the farther group, so the groups do not overlap.
const cell04Near = cell04Rows.filter(row => row.distance < 500);
const cell04Far = cell04Rows.filter(row => row.distance >= 500);
const cell04Results = cell04Htl.html`<p>Calculating correlations and bootstrap intervals…</p>`;
const cell04View = cell04Htl.html`<section>
  ${cell04Results}
</section>`;
display(cell04View);

// A worker keeps the resampling off the notebook's main thread. Each bootstrap
// sample resamples restaurants as paired distance–rating observations and
// recomputes average ranks, including ties, in that sample.
const cell04WorkerCode = `
function ranks(values) {
  const order = Array.from({length: values.length}, (_, i) => i);
  order.sort((a, b) => values[a] - values[b]);
  const result = new Float64Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && values[order[end]] === values[order[start]]) end++;
    const rank = (start + 1 + end) / 2;
    for (let i = start; i < end; i++) result[order[i]] = rank;
    start = end;
  }
  return result;
}
function rho(x, y) {
  if (x.length < 3) return null;
  const a = ranks(x), b = ranks(y), mean = (x.length + 1) / 2;
  let cross = 0, ssx = 0, ssy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = a[i] - mean, dy = b[i] - mean;
    cross += dx * dy; ssx += dx * dx; ssy += dy * dy;
  }
  return ssx > 0 && ssy > 0 ? Math.max(-1, Math.min(1, cross / Math.sqrt(ssx * ssy))) : null;
}
function quantile(sorted, p) {
  const pos = (sorted.length - 1) * p, lo = Math.floor(pos), fraction = pos - lo;
  return sorted[lo] + fraction * (sorted[Math.ceil(pos)] - sorted[lo]);
}
function analyze(rows, seed, repetitions) {
  const x = rows.map(row => row.distance), y = rows.map(row => row.rating), n = rows.length;
  const estimate = rho(x, y);
  if (estimate === null) return {n, estimate, low: null, high: null, valid: 0};
  // Mulberry32 gives reproducible paired bootstrap samples.
  let state = seed >>> 0;
  function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const bx = new Float64Array(n), by = new Float64Array(n), estimates = [];
  for (let b = 0; b < repetitions; b++) {
    for (let i = 0; i < n; i++) {
      const j = Math.floor(random() * n); bx[i] = x[j]; by[i] = y[j];
    }
    const value = rho(bx, by);
    if (value !== null) estimates.push(value);
  }
  estimates.sort((a, b) => a - b);
  // Do not silently discard degenerate replicates when constructing an interval.
  const complete = estimates.length === repetitions;
  return {n, estimate, valid: estimates.length,
    low: complete ? quantile(estimates, 0.025) : null,
    high: complete ? quantile(estimates, 0.975) : null};
}
self.onmessage = event => {
  try {
    const {all, near, far, repetitions} = event.data;
    self.postMessage({all: analyze(all, 20261102, repetitions),
      near: analyze(near, 20261104, repetitions),
      far: analyze(far, 20261103, repetitions)});
  } catch (error) { self.postMessage({error: String(error)}); }
};`;

const cell04Repetitions = 2000;
const cell04Url = URL.createObjectURL(new Blob([cell04WorkerCode], {type: "text/javascript"}));
const cell04Worker = new Worker(cell04Url);
// Clean up when the cell is rerun or removed.
invalidation.then(() => { cell04Worker.terminate(); URL.revokeObjectURL(cell04Url); });
cell04Worker.onerror = event => {
  cell04Results.replaceChildren(cell04Htl.html`<p>Calculation failed: ${event.message}</p>`);
  cell04Worker.terminate(); URL.revokeObjectURL(cell04Url);
};
cell04Worker.onmessage = event => {
  cell04Worker.terminate(); URL.revokeObjectURL(cell04Url);
  if (event.data.error) {
    cell04Results.replaceChildren(cell04Htl.html`<p>Calculation failed: ${event.data.error}</p>`);
    return;
  }
  const pValue = result => {
    if (result.estimate === null || result.n < 3) return null;
    if (result.estimate === 1) return 0;
    if (result.estimate === -1) return 1;
    const t = result.estimate * Math.sqrt((result.n - 2) / (1 - result.estimate ** 2));
    // By symmetry, the upper tail at t is the lower tail at -t.
    return cell04JStat.studentt.cdf(-t, result.n - 2);
  };
  const format = value => value === null || !Number.isFinite(value) ? "—" : value.toFixed(4);
  const pFormat = value => value === null || !Number.isFinite(value) ? "—" : value < 0.0001 ? "< 0.0001" : value.toFixed(4);
  const interval = result => result.low === null ? "Unavailable" : `[${format(result.low)}, ${format(result.high)}]`;
  const primary = event.data.all, near = event.data.near, far = event.data.far;
  const analyses = [primary, near, far];
  const rows = [
    ["Sample size", ...analyses.map(result => result.n.toLocaleString())],
    ["Spearman’s rho", ...analyses.map(result => format(result.estimate))],
    ["One-sided p-value", ...analyses.map(result => pFormat(pValue(result)))],
    ["95% bootstrap CI", ...analyses.map(interval)]
  ];
  const table = cell04D3.create("table")
    .style("border-collapse", "collapse")
    .style("width", "100%")
    .style("font", "13px system-ui, sans-serif")
    .style("text-align", "left");
  table.append("thead").append("tr").selectAll("th")
    .data(["Statistic", "0–1,500 m (primary)", "0–<500 m (secondary)", "500–1,500 m (secondary)"])
    .join("th").text(d => d)
    .style("padding", "6px 8px").style("border-bottom", "1px solid #aaa")
    .style("text-align", "left");
  table.append("tbody").selectAll("tr").data(rows).join("tr")
    .selectAll("td").data(d => d).join("td").text(d => d)
    .style("padding", "6px 8px").style("border-bottom", "1px solid #ddd")
    .style("vertical-align", "top");
  const degenerate = analyses.some(result => result.estimate !== null && result.valid < cell04Repetitions);
  cell04Results.replaceChildren(
    table.node(),
    cell04Htl.html`<p style="font:12px system-ui, sans-serif;">H₁: ratings increase with distance (ρ &gt; 0). P-values use a large-sample approximation; confidence intervals use ${cell04Repetitions.toLocaleString()} paired bootstrap resamples. The 500 m boundary belongs to the farther group; 1,500 m is included. Secondary tests do not directly compare the two groups.</p>`,
    ...(degenerate ? [cell04Htl.html`<p>At least one bootstrap resample had constant values, so its interval is unavailable.</p>`] : [])
  );
};
cell04Worker.postMessage({all: cell04Rows, near: cell04Near, far: cell04Far, repetitions: cell04Repetitions});
